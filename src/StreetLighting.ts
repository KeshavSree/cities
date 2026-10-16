import * as THREE from 'three';
import { SpatialIndex } from './SpatialIndex';
import { AmbientStreetLights } from './AmbientStreetLights';

interface LampSettings {intensity:number;distance:number;kind?:'lamp'|'window';direction?:{x:number;y:number;z:number};angle?:number;penumbra?:number;color?:string;}
/** A marker survives city mesh batching without adding collision or picking geometry. */
export function streetLamp(parent:THREE.Object3D,x:number,y:number,z:number,intensity=5,distance=6){
  const source=new THREE.Object3D();source.position.set(x,y,z);source.userData.streetLamp={intensity,distance,kind:'lamp'} satisfies LampSettings;source.userData.noPick=true;parent.add(source);return source;
}

/** Window light points out through the glass and down onto the pavement. */
export function shopWindowLight(parent:THREE.Object3D,x:number,y:number,z:number){
  const source=streetLamp(parent,x,y,z,4,4.5);
  source.userData.streetLamp={intensity:4,distance:4.5,kind:'window',direction:{x:0,y:-.6,z:-1.1},angle:.95,penumbra:.85,color:'#ffd098'} satisfies LampSettings;
  return source;
}

/** Preserve world-space source positions and facing when the city is flattened into material batches. */
export function streetLampMarkers(root:THREE.Object3D){
  const markers:THREE.Object3D[]=[];
  root.updateWorldMatrix(true,true);
  root.traverse(source=>{if(source.userData.streetLamp){const marker=new THREE.Object3D();marker.matrix.copy(root.matrixWorld).invert().multiply(source.matrixWorld);marker.matrix.decompose(marker.position,marker.quaternion,marker.scale);marker.userData={...source.userData};markers.push(marker);}});
  return markers;
}
const visible=(object:THREE.Object3D)=>{for(let parent:THREE.Object3D|null=object;parent;parent=parent.parent)if(!parent.visible)return false;return true;};

/** A small, reusable pool provides actual surface lighting with bounded GPU/shadow cost. */
export class StreetLighting {
  readonly group=new THREE.Group();
  readonly lights:THREE.SpotLight[];
  readonly ambient=new AmbientStreetLights();
  private sources:THREE.Object3D[]=[];
  private index=new SpatialIndex<{source:THREE.Object3D;position:THREE.Vector3}>(16);
  private queryKey='';
  private candidates:{source:THREE.Object3D;position:THREE.Vector3}[]=[];

  private assignments:(string|null)[];
  private assignedSources:(THREE.Object3D|null)[];
  transitioning=false;
  private direction=new THREE.Vector3();
  private rotation=new THREE.Quaternion();
  private target=new THREE.Vector3();
  constructor(mobile=false){
    this.group.name='Street lighting';this.group.add(this.ambient.group);
    this.lights=Array.from({length:mobile?4:8},(_,index)=>{
      const light=new THREE.SpotLight('#ffd598',0,6,1.27,.7,2);
      light.castShadow=index<(mobile?1:2);light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;light.shadow.mapSize.set(mobile?256:512,mobile?256:512);
      light.shadow.bias=-.0003;light.shadow.normalBias=.025;light.shadow.camera.near=.05;
      this.group.add(light,light.target);return light;
    });
    this.assignments=this.lights.map(()=>null);this.assignedSources=this.lights.map(()=>null);this.group.visible=false;
  }
  setSources(root:THREE.Object3D){
    this.sources=root.children.filter(object=>object.userData.streetLamp);this.index.clear();this.queryKey='';root.updateMatrixWorld(true);
    this.ambient.setSources(this.sources);
    for(const source of this.sources){const position=source.getWorldPosition(new THREE.Vector3());this.index.insert({source,position},{minX:position.x,maxX:position.x,minZ:position.z,maxZ:position.z});}
  }

  update(center:{x:number;z:number},enabled:boolean,dynamicRoots:THREE.Object3D[]=[],seconds=0){
    this.transitioning=false;this.ambient.update(enabled);
    if(!enabled&&!this.group.visible)return false;
    const key=`${Math.floor(center.x/8)},${Math.floor(center.z/8)}`;
    if(enabled&&key!==this.queryKey){
      this.queryKey=key;const x=Math.floor(center.x/8)*8,z=Math.floor(center.z/8)*8;
      this.candidates=[...this.index.query({minX:x-48,maxX:x+56,minZ:z-48,maxZ:z+56})];
    }
    const retained=new Set(this.assignments);
    const selected:{source:THREE.Object3D;position:THREE.Vector3;distance:number;score:number}[]=[];
    const consider=(entry:{source:THREE.Object3D;position:THREE.Vector3})=>{
      if(!visible(entry.source))return;
      const distance=(entry.position.x-center.x)**2+(entry.position.z-center.z)**2;
      const score=distance*(retained.has(entry.source.uuid)?.8:1);
      if(distance>=48**2||selected.length===this.lights.length&&score>=selected.at(-1)!.score)return;
      let index=0;while(index<selected.length&&selected[index].score<=score)index++;
      selected.splice(index,0,{...entry,distance,score});if(selected.length>this.lights.length)selected.pop();
    };
    if(enabled){
      for(const entry of this.candidates)consider(entry);
      for(const root of dynamicRoots)root.traverse(source=>{if(source.userData.streetLamp)consider({source,position:source.getWorldPosition(new THREE.Vector3())});});
    }
    const visibleGroup=enabled&&(selected.length>0||this.ambient.group.visible);
    let changed=this.group.visible!==visibleGroup;this.group.visible=visibleGroup;
    // Keep existing slot assignments stable as the walker moves between nearby lamps.
    const remaining=new Map(selected.map(entry=>[entry.source.uuid,entry]));
    const slots=this.assignments.map(id=>id?remaining.get(id):undefined);
    for(const entry of slots)if(entry)remaining.delete(entry.source.uuid);
    for(let index=0;index<this.lights.length;index++){
      const entry=slots[index]??remaining.values().next().value;
      if(entry)remaining.delete(entry.source.uuid);
      const light=this.lights[index],id=entry?.source.uuid??null;let slotChanged=false;
      const previous=this.assignedSources[index];
      // Retain the current source at near ties, then fade before reusing a slot.
      // A hidden/carried source is removed immediately, so it leaves no phantom light.
      if(seconds>0&&enabled&&this.assignments[index]!==id&&light.intensity>0&&previous?.parent&&visible(previous)){
        const power=(previous.userData.streetLamp as LampSettings).intensity;light.intensity=Math.max(0,light.intensity-power*seconds/.18);this.transitioning=true;changed=true;continue;
      }
      if(this.assignments[index]!==id){changed=true;slotChanged=true;this.assignments[index]=id;this.assignedSources[index]=entry?.source??null;light.intensity=0;}

      if(!entry){if(light.intensity!==0)changed=true;light.intensity=0;continue;}
      const settings=entry.source.userData.streetLamp as LampSettings;
      if(light.position.distanceToSquared(entry.position)>1e-8||light.distance!==settings.distance){changed=true;slotChanged=true;}
      const direction=settings.direction??{x:0,y:-1,z:0},angle=settings.angle??1.27,penumbra=settings.penumbra??.7,color=settings.color??'#ffd598';
      this.direction.set(direction.x,direction.y,direction.z).applyQuaternion(entry.source.getWorldQuaternion(this.rotation));this.target.copy(entry.position).add(this.direction);
      if(light.target.position.distanceToSquared(this.target)>1e-8||light.angle!==angle||light.penumbra!==penumbra||light.color.getHexString()!==color.slice(1)){changed=true;slotChanged=true;}
      light.position.copy(entry.position);light.target.position.copy(this.target);
      light.target.updateMatrixWorld();const power=seconds>0?Math.min(settings.intensity,light.intensity+settings.intensity*seconds/.18):settings.intensity;if(light.intensity!==power)changed=true;light.intensity=power;if(power!==settings.intensity)this.transitioning=true;light.distance=settings.distance;light.angle=angle;light.penumbra=penumbra;light.color.set(color);
      if(slotChanged)light.shadow.needsUpdate=true;
    }
    return changed;
  }
  dispose(){this.ambient.dispose();for(const light of this.lights)light.dispose();this.group.clear();this.sources=[];this.index.clear();this.candidates=[];}
}
