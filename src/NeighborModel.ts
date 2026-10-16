import * as THREE from 'three';
import type { DetailBox } from './StreetDetails';

/** The same character appears in the shop preview, while carried, and while walking. */
export function neighborModel(group:THREE.Group,box:DetailBox,owner?:string,jacket='#c99978'){
  const part=(parent:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>box(parent,x,y,z,w,h,d,color,owner);
  const legs:THREE.Group[]=[],arms:THREE.Group[]=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.075,.28,0);group.add(leg);legs.push(leg);
    part(leg,0,-.14,0,.075,.28,.09,'#4c6665');part(leg,0,-.255,-.035,.09,.05,.15,'#465552');
    const arm=new THREE.Group();arm.position.set(side*.12,.5,0);group.add(arm);arms.push(arm);
    part(arm,0,-.12,0,.04,.23,.07,jacket);part(arm,0,-.245,0,.04,.05,.07,'#d8b28e');
  }
  part(group,0,.39,0,.2,.24,.13,jacket);
  part(group,0,.595,0,.15,.17,.14,'#d8b28e');part(group,0,.685,.008,.17,.035,.15,'#6a5948');part(group,0,.65,.061,.16,.07,.028,'#6a5948');
  for(const x of [-.038,.038])part(group,x,.61,-.073,.017,.017,.007,'#485650');
  return {legs,arms};
}
