import { baseShopSlots, shopAttachment, BASE_SHOP_WIDTH, BASE_SHOP_DEPTH } from './shopAttachments';
import type { Building } from './types';
import { plotPlan } from './plots';
import { coastZ } from './world';
import { buildingForm, clipOutline, insetPlotPolygon, outlineArea } from '../src/buildingForm';

export const DECORATIONS={
  planter:{label:'Flower planter',cost:40,width:.38,depth:.38,description:'A stone planter filled with flowers.'},
  bench:{label:'Garden bench',cost:70,width:.72,depth:.25,description:'A wooden seat for your front garden.'},
  lamp:{label:'Garden lamp',cost:90,width:.16,depth:.16,description:'A warm light beside your building.'},
  tree:{label:'Small tree',cost:120,width:.48,depth:.48,description:'A leafy tree in a square planting bed.'},
  storefront:{label:'Corner shop',cost:220,width:.96,depth:.56,description:'A little shop with a striped awning and display counter.'},
  base_shop:{label:'Tower storefront',cost:300,width:BASE_SHOP_WIDTH,depth:BASE_SHOP_DEPTH,description:'A shop that snaps onto your ground-floor walls. Neighbors stop here to shop.'},
  person:{label:'Neighbor',cost:100,width:.28,depth:.28,description:'A neighbor who walks around, visits shops, and returns home.'},
  sculpture:{label:'Garden sculpture',cost:160,width:.38,depth:.38,description:'A small geometric sculpture on a stone plinth.'},
} as const;
export type DecorationKind=keyof typeof DECORATIONS;
export interface Decoration {id:string;kind:DecorationKind;x:number|null;z:number|null;rotation:number;}
export interface DecorationPosition {x:number;z:number;rotation:number;}
export interface DecorationDraft {id?:string;kind:DecorationKind;x:number|null;z:number|null;rotation:number;requestId:string;}
export const MAX_DECORATIONS=24;
export const DECORATION_ROAD_INSET=1.12;
const EDGE_CONTACT_TOLERANCE=.001;
export const isDecorationKind=(value:unknown):value is DecorationKind=>typeof value==='string'&&Object.hasOwn(DECORATIONS,value);
const inventoryCache=new WeakMap<object,{json:string;items:readonly Decoration[]}>();
const geometryCache=new WeakMap<Building,{key:string;yard:{x:number;z:number}[];foundation:{x:number;z:number}[]}>();
const layoutCache=new WeakMap<Building,{key:string;items:(Decoration&DecorationPosition)[];footprints:{x:number;z:number}[][]}>();
const geometryKey=(building:Building)=>[building.x,building.z,building.level,building.style,building.color,building.segments].join(':');
function geometryFor(building:Building){
  const key=geometryKey(building),cached=geometryCache.get(building);if(cached?.key===key)return cached;
  const value={key,yard:insetPlotPolygon(plotPlan(building.x,building.z),DECORATION_ROAD_INSET),foundation:buildingForm(building,1).foundationOutline};geometryCache.set(building,value);return value;
}
export function decorationsOf(building:Pick<Building,'decorations'>):readonly Decoration[]{
  const json=building.decorations||'[]',cached=inventoryCache.get(building);if(cached?.json===json)return cached.items;
  let result:Decoration[]=[];
  try{const items=JSON.parse(json);result=Array.isArray(items)?items.filter((item):item is Decoration=>item&&typeof item.id==='string'&&isDecorationKind(item.kind)&&(item.x===null||Number.isFinite(item.x))&&(item.z===null||Number.isFinite(item.z))&&Number.isInteger(item.rotation)&&item.rotation>=0&&item.rotation<=3):[];}catch{/* Malformed inventory has no placed objects. */}
  inventoryCache.set(building,{json,items:result});return result;
}

export function decorationFootprint(building:Building,kind:DecorationKind,position:DecorationPosition){
  const origin=plotPlan(building.x,building.z).position,{width,depth}=DECORATIONS[kind],attachment=kind==='base_shop'?shopAttachment(building,position):null,angle=attachment?.angle??position.rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  // Attached shops are flush to a real wall. Their footprint extends outward
  // under the awning instead of straddling the building facade.
  const offset=attachment?{x:attachment.normal.x*(depth/2-.05),z:attachment.normal.z*(depth/2-.05)}:{x:0,z:0};
  return [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([x,z])=>({x:origin.x+position.x+offset.x+x*c+z*s,z:origin.z+position.z+offset.z-x*s+z*c}));
}
export function decorationSpace(building:Building,kind:DecorationKind,position:DecorationPosition):string|null{
  if(!Number.isFinite(position.x)||!Number.isFinite(position.z)||Math.abs(position.x)>12||Math.abs(position.z)>12||!Number.isInteger(position.rotation)||position.rotation<0||position.rotation>3)return 'Choose a valid position.';
  const {yard,foundation}=geometryFor(building),footprint=decorationFootprint(building,kind,position);
  if(yard.length<3||footprint.some(p=>!yard.every((a,i)=>{const b=yard[(i+1)%yard.length],dx=b.x-a.x,dz=b.z-a.z;return dx*(p.z-a.z)-dz*(p.x-a.x)>=-EDGE_CONTACT_TOLERANCE*Math.hypot(dx,dz);})))return 'Keep the decoration inside your plot and clear of the sidewalk.';
  if(footprint.some(p=>p.z>coastZ(p.x)-2.2))return 'Keep the decoration off the beach.';
  if(kind==='base_shop')return shopAttachment(building,position)?null:building.level<4?'Tower storefronts need a cottage or larger building (level 4).':'Choose a highlighted slot on your own building’s base.';
  if(outlineArea(clipOutline(footprint,foundation,.06))>1e-6)return 'Leave a little room beside your building.';
  return null;
}
export function placementError(building:Building,kind:DecorationKind,position:DecorationPosition,ignoreId?:string):string|null{
  const error=decorationSpace(building,kind,position);if(error)return error;
  const footprint=decorationFootprint(building,kind,position);
  const layout=layoutFor(building);
  for(let i=0;i<layout.items.length;i++){
    if(layout.items[i].id===ignoreId)continue;
    if(outlineArea(clipOutline(footprint,layout.footprints[i],.05))>1e-6)return 'Leave some space between decorations.';
  }
  return null;
}
function layoutFor(building:Building){
  const key=geometryKey(building)+'|'+(building.decorations||'[]'),cached=layoutCache.get(building);if(cached?.key===key)return cached;
  const items=decorationsOf(building).filter((item):item is Decoration&DecorationPosition=>item.x!==null&&item.z!==null&&!decorationSpace(building,item.kind,{x:item.x,z:item.z,rotation:item.rotation}));
  const value={key,items,footprints:items.map(item=>decorationFootprint(building,item.kind,item))};layoutCache.set(building,value);return value;
}
export function placedDecorations(building:Building){return layoutFor(building).items;}

export function suggestedDecorationPosition(building:Building,kind:DecorationKind,rotation=0,ignoreId?:string):DecorationPosition|null{
  if(kind==='base_shop')return baseShopSlots(building).find(slot=>!placementError(building,kind,slot,ignoreId))??null;
  const plan=plotPlan(building.x,building.z),points:DecorationPosition[]=[];
  const minX=Math.min(...plan.corners.map(p=>p.x))-plan.position.x,maxX=Math.max(...plan.corners.map(p=>p.x))-plan.position.x;
  const minZ=Math.min(...plan.corners.map(p=>p.z))-plan.position.z,maxZ=Math.max(...plan.corners.map(p=>p.z))-plan.position.z;
  for(let x=Math.ceil(minX*10)/10;x<maxX;x+=.1)for(let z=Math.ceil(minZ*10)/10;z<maxZ;z+=.1)points.push({x:Math.round(x*100)/100,z:Math.round(z*100)/100,rotation});
  points.sort((a,b)=>Math.hypot(a.x,a.z-2)-Math.hypot(b.x,b.z-2));
  return points.find(position=>!placementError(building,kind,position,ignoreId))??null;
}
