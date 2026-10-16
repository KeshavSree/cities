import type { Building } from '../shared/types';
import { coastZ } from '../shared/world';
import { plotPlan } from '../shared/plots';
import { buildingForm } from './buildingForm';
import { neighborhoodDensity, roadWidth, streetDensity, streetNetwork, type Street } from './neighborhood';
import { placedDecorations, decorationFootprint } from '../shared/decorations';

export type StreetPoint = { x:number; z:number };
export type StreetStart = { point:StreetPoint; target:StreetPoint; roadKey:string; label:string };
export const WALK_RADIUS = .12;
// The city's doors are about .8 world units tall.
export const EYE_HEIGHT = .76;

export function streetName(road:Street){
  const names=['Willow','Cedar','Maple','Juniper','Birch','Market','Garden','Makers'];
  const index=Math.abs(road.horizontal?road.z:road.x)%names.length;
  return `${names[index]} ${road.kind==='turning-ring'?'Court':road.horizontal?'Street':'Lane'}`;
}

/** Only choose actual, walkable streets close to the clicked ground point. */
export function pickStreetStart(point:StreetPoint,roads:Iterable<Street>,obstacles:StreetPoint[][]):StreetStart|null{
  let best:{distance:number;start:StreetStart}|null=null;
  for(const road of roads){
    const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
    if(lengthSquared<1e-8)continue;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/lengthSquared));
    const projected={x:a.x+t*dx,z:a.z+t*dz};
    const distance=Math.hypot(point.x-projected.x,point.z-projected.z);
    if(distance>roadWidth(streetDensity(road,t))/2+.25||best&&distance>=best.distance||!canWalk(projected,obstacles))continue;
    const length=Math.sqrt(lengthSquared);
    best={distance,start:{point:projected,target:{x:projected.x+dx/length*4,z:projected.z+dz/length*4},roadKey:road.key,label:streetName(road)}};
  }
  return best?.start??null;
}

export function buildingObstacles(buildings:Building[]) {
  const density=neighborhoodDensity(buildings);
  return buildings.map(building=>buildingForm(building,density(building.x,building.z)).foundationOutline);
}
export function streetObstacles(buildings:Building[],ignoreDecoration?:string) {
  const foundations=buildingObstacles(buildings);
  const items=buildings.flatMap(building=>placedDecorations(building).map(item=>({id:item.id,kind:item.kind,footprint:decorationFootprint(building,item.kind,item)})));
  return [...foundations,...items.filter(item=>item.kind!=='person'&&item.id!==ignoreDecoration).map(item=>item.footprint)];
}

/** Circle against convex building foundations, including angled parcels. */
export function canWalk(point:StreetPoint,obstacles:StreetPoint[][],radius=WALK_RADIUS) {
  if(point.z>coastZ(point.x)-.5-radius)return false;
  return !obstacles.some(polygon=>{
    let inside=true;
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z;
      if(dx*(point.z-a.z)-dz*(point.x-a.x)<0)inside=false;
      const lengthSquared=dx*dx+dz*dz;
      const t=lengthSquared?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/lengthSquared)):0;
      if(Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)<radius)return true;
    }
    return inside;
  });
}

/** Short steps prevent tunneling; separate axes let the walker slide along walls. */
export function walkStep(start:StreetPoint,dx:number,dz:number,obstacles:StreetPoint[][]):StreetPoint {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06));
  const point={...start};
  for(let i=0;i<steps;i++){
    if(canWalk({x:point.x+dx/steps,z:point.z},obstacles))point.x+=dx/steps;
    if(canWalk({x:point.x,z:point.z+dz/steps},obstacles))point.z+=dz/steps;
  }
  return point;
}

/** Arrive on the real road facing the selected building's entrance. */
export function streetArrival(building:Pick<Building,'x'|'z'>,obstacles:StreetPoint[][]) {
  const plan=plotPlan(building.x,building.z),[a,b]=plan.frontage.points;
  const dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
  const t=Math.max(.12,Math.min(.88,((plan.position.x-a.x)*dx+(plan.position.z-a.z)*dz)/lengthSquared));
  const road={x:a.x+t*dx,z:a.z+t*dz};
  const toward={x:plan.position.x-road.x,z:plan.position.z-road.z};
  const length=Math.hypot(toward.x,toward.z);
  const candidates=[0,-.24,.24,-.48,.48].map(offset=>({x:road.x+toward.x/length*offset,z:road.z+toward.z/length*offset}));
  // Very narrow irregular frontages may need a few steps along the road.
  for(const along of [0,.5,-.5,1,-1,2,-2])for(const candidate of candidates){
    const point={x:candidate.x+dx/Math.sqrt(lengthSquared)*along,z:candidate.z+dz/Math.sqrt(lengthSquared)*along};
    if(canWalk(point,obstacles))return {point,target:plan.position};
  }
  return null;
}

/** Enter beside the item being edited, using an actual clear street as the start. */
export function streetStartByPoint(target:StreetPoint,buildings:Building[],ignoreDecoration?:string):StreetStart|null{
  const roads=streetNetwork(buildings,neighborhoodDensity(buildings)).roads,obstacles=streetObstacles(buildings,ignoreDecoration),candidates:StreetPoint[]=[];
  for(const road of roads.values()){
    const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
    const nearest=Math.max(.08,Math.min(.92,((target.x-a.x)*dx+(target.z-a.z)*dz)/(length||1)));
    for(const t of [nearest,.25,.5,.75]){const p={x:a.x+dx*t,z:a.z+dz*t};if(Math.hypot(p.x-target.x,p.z-target.z)<12)candidates.push(p);}
  }
  candidates.sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
  for(const point of candidates){const start=pickStreetStart(point,roads.values(),obstacles);if(start)return {...start,target:{...target}};}
  return null;
}
