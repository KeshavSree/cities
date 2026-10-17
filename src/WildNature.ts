import * as THREE from 'three';
import type { Building } from '../shared/types';
import { WildNaturePlan, type WildPlant } from './wildNaturePlan';

const CHUNK=28,TILE=56,RADIUS=140;
/** A bounded, instanced woodland follows the view without moving individual trees. */
export class WildNature {
  readonly group=new THREE.Group();
  private plan=new WildNaturePlan([]);
  private buildingsKey='';
  private windowKey='';
  private tiles=new Map<string,{objects:THREE.InstancedMesh[];count:number}>();
  private geometries={trunk:new THREE.CylinderGeometry(.055,.095,1,5),leaf:new THREE.IcosahedronGeometry(1,0),pine:new THREE.ConeGeometry(1,1,6)};
  private materials=new Map<string,THREE.MeshStandardMaterial>();
  readonly stats={built:0,reused:0,removed:0};

  constructor(){this.group.name='Wild woodland';this.group.userData.noPick=true;}
  setBuildings(buildings:Building[]){
    // Purchases, balance changes and day/night previews do not regenerate nature.
    const key=buildings.map(b=>`${b.id}:${b.x},${b.z}:${b.invited_by}:${b.inviter_x},${b.inviter_z}:${b.level}`).sort().join('|');
    if(key===this.buildingsKey)return;
    this.buildingsKey=key;this.plan=new WildNaturePlan(buildings);this.clear();this.windowKey='';
  }
  update(center:{x:number;z:number}){
    const x=Math.floor(center.x/CHUNK)*CHUNK,z=Math.floor(center.z/CHUNK)*CHUNK,key=`${x},${z}`;
    if(key===this.windowKey)return false;
    this.windowKey=key;
    const keep=new Set<string>();
    for(let ix=Math.floor((x-RADIUS)/TILE);ix<Math.ceil((x+RADIUS+CHUNK)/TILE);ix++)for(let iz=Math.floor((z-RADIUS)/TILE);iz<Math.ceil((z+RADIUS+CHUNK)/TILE);iz++){
      const id=`${ix},${iz}`;keep.add(id);
      if(this.tiles.has(id)){this.stats.reused++;continue;}
      const before=this.group.children.length,plants=this.plan.plants(ix*TILE,(ix+1)*TILE,iz*TILE,(iz+1)*TILE);
      this.buildTile(plants);this.tiles.set(id,{objects:this.group.children.slice(before) as THREE.InstancedMesh[],count:plants.length});this.stats.built++;
    }
    for(const [id,tile] of this.tiles)if(!keep.has(id)){for(const object of tile.objects){object.removeFromParent();object.dispose();}this.tiles.delete(id);this.stats.removed++;}
    this.group.userData.plantCount=[...this.tiles.values()].reduce((sum,t)=>sum+t.count,0);this.group.userData.tiles=this.tiles.size;
    return true;
  }
  private buildTile(plants:WildPlant[]){
    const broad=plants.filter(p=>p.kind==='broadleaf'),pine=plants.filter(p=>p.kind==='pine'),bush=plants.filter(p=>p.kind==='bush');
    const trunks=plants.filter(p=>p.kind!=='bush');
    this.instances('Trunks',this.geometries.trunk,trunks,p=>({y:p.height*.34,sx:1,sy:p.height*.68,sz:1}), '#886c50','#a58964');
    this.instances('Broadleaf canopy',this.geometries.leaf,broad,p=>({y:p.height*.69,sx:p.radius,sy:p.height*.34,sz:p.radius*.88}),'#62805a','#91a66c');
    this.instances('Broadleaf crown',this.geometries.leaf,broad,p=>({y:p.height*.84,sx:p.radius*.68,sy:p.height*.20,sz:p.radius*.67}),'#668b60','#a1b676');
    this.instances('Pine lower branches',this.geometries.pine,pine,p=>({y:p.height*.51,sx:p.radius,sy:p.height*.64,sz:p.radius}),'#3f6956','#708b60');
    this.instances('Pine upper branches',this.geometries.pine,pine,p=>({y:p.height*.76,sx:p.radius*.69,sy:p.height*.48,sz:p.radius*.69}),'#496f58','#799563');
    this.instances('Wild undergrowth',this.geometries.leaf,bush,p=>({y:p.height*.45,sx:p.radius,sy:p.height*.55,sz:p.radius*.8}),'#70885c','#a0ad70');
  }
  private instances(name:string,geometry:THREE.BufferGeometry,plants:WildPlant[],shape:(plant:WildPlant)=>{y:number;sx:number;sy:number;sz:number},low:string,high:string){
    if(!plants.length)return;
    let material=this.materials.get(name);if(!material){material=new THREE.MeshStandardMaterial({roughness:1,flatShading:true});this.materials.set(name,material);}
    const mesh=new THREE.InstancedMesh(geometry,material,plants.length);mesh.matrixAutoUpdate=false;
    mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.noPick=true;
    const transform=new THREE.Object3D(),a=new THREE.Color(low),b=new THREE.Color(high),color=new THREE.Color();
    plants.forEach((p,i)=>{const s=shape(p);transform.position.set(p.x,s.y,p.z);transform.rotation.y=p.angle;transform.scale.set(s.sx,s.sy,s.sz);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);mesh.setColorAt(i,color.copy(a).lerp(b,p.tint));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();this.group.add(mesh);
  }
  private clear(){
    for(const child of this.group.children)if(child instanceof THREE.InstancedMesh){child.dispose();}
    this.group.clear();this.tiles.clear();
  }
  dispose(){this.clear();Object.values(this.geometries).forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.materials.clear();}
}
