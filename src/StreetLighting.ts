import * as THREE from 'three';
import { StreetLightField, type LampSettings } from './StreetLightField';
import { AmbientStreetLights } from './AmbientStreetLights';

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
/** World-space illumination is identical for every camera and viewport. */
export class StreetLighting {
  readonly group=new THREE.Group();
  readonly ambient=new AmbientStreetLights();
  readonly surface=new StreetLightField();
  private sources:THREE.Object3D[]=[];
  constructor(_mobile=false){this.group.name='Street lighting';this.group.add(this.ambient.group);this.group.visible=false;}
  setSources(root:THREE.Object3D){
    this.sources=root.children.filter(object=>object.userData.streetLamp);root.updateMatrixWorld(true);
    this.ambient.setSources(this.sources);this.surface.setSources(this.sources);
  }
  update(_center:{x:number;z:number},enabled:boolean,dynamicRoots:THREE.Object3D[]=[],_seconds=0){
    this.ambient.update(enabled);const changed=this.surface.update(enabled,dynamicRoots);
    const visible=enabled&&this.ambient.group.visible,visibilityChanged=this.group.visible!==visible;this.group.visible=visible;
    return changed||visibilityChanged;
  }
  dispose(){this.surface.dispose();this.ambient.dispose();this.group.clear();this.sources=[];}
}
