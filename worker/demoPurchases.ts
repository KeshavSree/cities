import type { Building } from '../shared/types';
import { DECORATIONS, decorationsOf, placementError, suggestedDecorationPosition, type Decoration, type DecorationKind } from '../shared/decorations';
import { plotPosition } from '../shared/world';
import { plotPlan } from '../shared/plots';
import { NeighborRoutes } from '../src/neighborRoutes';

/** Explicit dev fixtures use actual placements and leave a walkable route to their shop. */
export function demoPurchasePlan(target:Building,neighbors:Building[]):Decoration[]{
  const existing=decorationsOf(target),items:Decoration[]=[];
  const withItems=()=>({...target,decorations:JSON.stringify([...existing,...items])});
  for(const kind of ['base_shop','lamp','bench','planter'] as DecorationKind[]){
    if(existing.length+items.length>=24)break;
    const p=suggestedDecorationPosition(withItems(),kind);
    if(p)items.push({id:`${target.id}:dev-example-${kind}-v1`,kind,x:p.x,z:p.z,rotation:p.rotation});
  }
  if(existing.length+items.length>=24)return items;
  const owner=withItems(),nav=new NeighborRoutes(neighbors.map(b=>b.id===owner.id?owner:b)),origin=plotPosition(owner.x,owner.z);
  const shops=nav.shops.filter(shop=>items.some(item=>item.id===shop.id)),candidates=[];
  for(let x=-2.2;x<=2.2;x+=.2)for(let z=-2.2;z<=2.2;z+=.2){
    const p={x:Math.round(x*10)/10,z:Math.round(z*10)/10,rotation:0};
    if(!placementError(owner,'person',p))candidates.push(p);
  }
  const home=candidates.sort((a,b)=>Math.hypot(a.x,a.z-2)-Math.hypot(b.x,b.z-2)).find(p=>shops.some(shop=>nav.path({x:origin.x+p.x,z:origin.z+p.z},shop.point)));
  if(home)items.push({id:`${target.id}:dev-example-person-v1`,kind:'person',...home});
  return items;
}

/** A repeat-safe, opt-in dense streetscape for local visual and performance testing. */
export function denseDemoPurchasePlan(target:Building,neighbors:Building[]):Decoration[]{
  const existing=decorationsOf(target),items:Decoration[]=[],plan=plotPlan(target.x,target.z),origin=plan.position;
  const owner=()=>({...target,decorations:JSON.stringify([...existing,...items])});
  const coordinates:{x:number;z:number;rotation:number}[]=[];
  const minX=Math.min(...plan.corners.map(p=>p.x))-origin.x,maxX=Math.max(...plan.corners.map(p=>p.x))-origin.x;
  const minZ=Math.min(...plan.corners.map(p=>p.z))-origin.z,maxZ=Math.max(...plan.corners.map(p=>p.z))-origin.z;
  for(let x=Math.ceil(minX*4)/4;x<maxX;x+=.25)for(let z=Math.ceil(minZ*4)/4;z<maxZ;z+=.25)coordinates.push({x,z,rotation:0});
  const add=(kind:DecorationKind,p:{x:number;z:number;rotation:number})=>items.push({id:`${target.id}:dense-ground-v2-${items.length}-${kind}`,kind,...p});
  const shopKind=target.level>=4?'base_shop':'storefront';
  if(!existing.some(i=>i.kind==='base_shop'||i.kind==='storefront')){const p=suggestedDecorationPosition(owner(),shopKind);if(p)add(shopKind,p);}
  const current=owner(),nav=new NeighborRoutes(neighbors.map(b=>b.id===target.id?current:b)),shopIds=new Set([...existing,...items].filter(i=>i.kind==='base_shop'||i.kind==='storefront').map(i=>i.id)),shops=nav.shops.filter(s=>shopIds.has(s.id)),corridors:{x:number;z:number}[][]=[];
  const personPositions=[...existing].filter(i=>i.kind==='person'&&i.x!==null&&i.z!==null).map(i=>({x:i.x!,z:i.z!,rotation:i.rotation}));
  if(!personPositions.length){
    const candidates=coordinates.filter(p=>!placementError(current,'person',p)).sort((a,b)=>Math.hypot(a.x,a.z-2)-Math.hypot(b.x,b.z-2));
    const home=candidates.slice(0,8).find(p=>{const start={x:origin.x+p.x,z:origin.z+p.z};for(const shop of shops){const path=nav.path(start,shop.point);if(path){corridors.push(path.map(q=>({x:q.x-origin.x,z:q.z-origin.z})));return true;}}return false;})||candidates[0];
    if(home){add('person',home);personPositions.push(home);}
  }
  if(!corridors.length)for(const person of personPositions)for(const shop of shops){const path=nav.path({x:origin.x+person.x,z:origin.z+person.z},shop.point);if(path){corridors.push(path.map(q=>({x:q.x-origin.x,z:q.z-origin.z})));break;}}
  const distanceToSegment=(p:{x:number;z:number},a:{x:number;z:number},b:{x:number;z:number})=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};
  for(const kind of ['lamp','tree','bench','planter','sculpture','lamp','tree','bench','planter','planter'] as DecorationKind[]){
    if(existing.length+items.length>=24)break;
    const building=owner(),placed=[...existing,...items].filter(i=>i.x!==null&&i.z!==null),radius=Math.hypot(DECORATIONS[kind].width,DECORATIONS[kind].depth)/2+.2;
    const spaced=[...coordinates].sort((a,b)=>{
      const score=(p:{x:number;z:number})=>Math.min(3,...placed.map(i=>Math.hypot(p.x-i.x!,p.z-i.z!)));
      return score(b)-score(a);
    });
    const position=spaced.find(p=>!corridors.some(path=>path.some((a,i)=>i>0&&distanceToSegment(p,path[i-1],a)<radius))&&!placementError(building,kind,p));
    if(position)add(kind,position);
  }
  return items;
}
