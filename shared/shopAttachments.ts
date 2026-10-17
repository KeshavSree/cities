import type { Building } from './types';
import { plotPlan } from './plots';
import { buildingForm } from '../src/buildingForm';
export const BASE_SHOP_WIDTH=.96;
export const BASE_SHOP_DEPTH=.52;
export interface ShopAttachment {x:number;z:number;rotation:number;angle:number;y:number;normal:{x:number;z:number};}
const slotCache=new WeakMap<Building,{key:string;slots:ShopAttachment[]}>();
/** Stable facade slots keep shops on real walls, clear of corners and the main entrance. */
export function baseShopSlots(building:Building):ShopAttachment[]{
  if(building.level<4)return [];
  const key=JSON.stringify([building.x,building.z,building.level,building.style,building.segments]),cached=slotCache.get(building);
  if(cached?.key===key)return cached.slots;
  const form=buildingForm(building,1),wall=form.sections[0].outline,plan=plotPlan(building.x,building.z),origin=plan.position;
  const wallCenter={x:wall.reduce((sum,p)=>sum+p.x,0)/wall.length,z:wall.reduce((sum,p)=>sum+p.z,0)/wall.length};
  const front={x:Math.sin(plan.rotation),z:Math.cos(plan.rotation)},slots:ShopAttachment[]=[];
  const frontEdge=wall.map((a,i)=>{const b=wall[(i+1)%wall.length];return {i,score:((a.x+b.x)/2-origin.x)*front.x+((a.z+b.z)/2-origin.z)*front.z};}).sort((a,b)=>b.score-a.score)[0]?.i;
  wall.forEach((a,i)=>{
    const b=wall[(i+1)%wall.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2};if(length<BASE_SHOP_WIDTH+.32)return;
    const candidate={x:dz/length,z:-dx/length},direction=(middle.x-wallCenter.x)*candidate.x+(middle.z-wallCenter.z)*candidate.z;
    const normal=direction>=0?candidate:{x:-candidate.x,z:-candidate.z},angle=Math.atan2(-normal.x,-normal.z),rotation=((Math.round(angle/(Math.PI/2))%4)+4)%4;
    const edgeClearance=BASE_SHOP_WIDTH/2+.16,min=edgeClearance,max=length-edgeClearance;
    const intervals=i===frontEdge?[[min,length/2-.48],[length/2+.48,max]]:[[min,max]];
    for(const [start,end] of intervals){
      if(end<start)continue;
      const count=Math.floor((end-start)/(BASE_SHOP_WIDTH+.14))+1;
      for(let j=0;j<count;j++){
        const along=start+(end-start)*(j+.5)/count;
        slots.push({x:Math.round((a.x+dx/length*along+normal.x*.07-origin.x)*10000)/10000,z:Math.round((a.z+dz/length*along+normal.z*.07-origin.z)*10000)/10000,rotation,angle,y:form.baseY,normal});
      }
    }
  });
  slotCache.set(building,{key,slots});
  return slots;
}
export function shopAttachment(building:Building,position:{x:number;z:number;rotation:number}){
  return baseShopSlots(building).find(slot=>slot.rotation===position.rotation&&Math.hypot(slot.x-position.x,slot.z-position.z)<.012)??null;
}
export function nearestShopSlot(building:Building,point:{x:number;z:number}){
  return [...baseShopSlots(building)].sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z))[0]??null;
}
