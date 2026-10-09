import type { Building } from '../shared/types';
import { plotPosition, PLOT_SPACING } from '../shared/world';
import { plotPlan, placementPlan } from '../shared/plots';
import { plannedStreet, boundaryStreet, junctionStreets, parcelOutline, type PlannedStreet, type PlannedNode } from '../shared/streets';
import { PUBLIC_PROJECTS, projectBoundary } from '../shared/projects';
import { MAX_LEVEL } from '../shared/progression';

export const SETTLEMENT_THRESHOLDS={suburban:.25,urban:.72};
export const SETTLEMENT_WEIGHTS={density:.45,levels:.55};

export interface SettlementScore {
  total:number;density:number;levels:number;densityContribution:number;levelContribution:number;
  averageLevel:number;nearbyResidents:number;
}

/** Roads blend nearby occupancy and distance-weighted development levels. */
export function neighborhoodScores(buildings:Building[]) {
  const occupied=new Map(buildings.map(b=>[`${b.x},${b.z}`,b]));
  const cache=new Map<string,SettlementScore>();
  return (x:number,z:number)=>{
    const key=`${x},${z}`;if(cache.has(key))return cache.get(key)!;
    const center=plotPosition(x,z);let weight=0,total=0,levelWeight=0,nearbyResidents=0;
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
      const neighbor=plotPosition(x+dx,z+dz);
      const distanceSquared=((neighbor.x-center.x)**2+(neighbor.z-center.z)**2)/PLOT_SPACING**2;
      const importance=Math.exp(-distanceSquared/3.2);total+=importance;
      const b=occupied.get(`${x+dx},${z+dz}`);if(!b)continue;
      nearbyResidents++;weight+=importance;levelWeight+=importance*b.level;
    }
    const density=weight/total,averageLevel=weight?levelWeight/weight:0;
    const levels=weight?Math.max(0,(averageLevel-1)/(MAX_LEVEL-1)):0;
    const densityContribution=SETTLEMENT_WEIGHTS.density*density,levelContribution=SETTLEMENT_WEIGHTS.levels*levels;
    const score={total:densityContribution+levelContribution,density,levels,densityContribution,levelContribution,averageLevel,nearbyResidents};
    cache.set(key,score);return score;
  };
}
export function neighborhoodDensity(buildings:Building[]) {
  const scoreAt=neighborhoodScores(buildings);
  return (x:number,z:number)=>scoreAt(x,z).total;
}
export const settlementType=(density:number)=>density>=SETTLEMENT_THRESHOLDS.urban?'urban':density>=SETTLEMENT_THRESHOLDS.suburban?'suburban':'rural';

/** Street geometry comes from the same immutable plan used by parcel previews. */
export const streetPoints=(x:number,z:number,horizontal:boolean)=>boundaryStreet(x,z,horizontal).points;
export type GroundPoint={x:number;z:number};
export interface Street extends PlannedStreet{densities:[number,number,number];}
export interface Junction extends PlannedNode{density:number;}
export function streetNetwork(buildings:Building[],densityAt:(x:number,z:number)=>number){
  const roads=new Map<string,Street>(),junctions=new Map<string,Junction>();
  const nodeDensity=(x:number,z:number)=>(densityAt(x,z)+densityAt(x-1,z)+densityAt(x,z-1)+densityAt(x-1,z-1))/4;
  const densityForNode=(node:PlannedNode)=>{const [x,z]=node.key.split(':')[1].split(',').map(Number);return nodeDensity(x,z);};
  const add=(plan:PlannedStreet)=>{
    if(roads.has(plan.key))return;
    const start=densityForNode(plan.nodes[0]),end=densityForNode(plan.nodes[1]);
    const middle=plan.key.startsWith('h:')?(densityAt(plan.x,plan.z)+densityAt(plan.x,plan.z-1))/2:plan.key.startsWith('v:')?(densityAt(plan.x,plan.z)+densityAt(plan.x-1,plan.z))/2:nodeDensity(plan.x,plan.z);
    roads.set(plan.key,{...plan,densities:[start,middle,end]});
    plan.nodes.forEach((node,i)=>junctions.set(node.key,{...node,density:i===0?start:end}));
  };
  const residents=new Map(buildings.map(b=>[b.id,b]));
  for(const building of buildings){
    const inviter=building.inviter_x!=null&&building.inviter_z!=null?{x:building.inviter_x,z:building.inviter_z}:residents.get(building.invited_by||'');
    const plan=inviter?placementPlan(inviter,building.x,building.z):null;
    for(const road of plotPlan(building.x,building.z).roads)add(road);
    for(const road of plan?.accessRoads||[])add(road);
  }
  // Public sites retain their boundary streets, and use legal planned links to
  // reach the city. A route cannot restore a deliberately absent T/dead-end arm.
  for(const project of PUBLIC_PROJECTS){
    const boundary=projectBoundary(project.id),existing=[...junctions.values()].filter(n=>n.cap!==false).map(n=>{
      const [x,z]=n.key.split(':')[1].split(',').map(Number);return {x,z};
    });
    let connection:{from:GroundPoint;to:GroundPoint;distance:number}|undefined;
    for(const from of boundary)for(const to of existing){
      const distance=Math.abs(from.x-to.x)+Math.abs(from.z-to.z);
      if(!connection||distance<connection.distance)connection={from,to,distance};
    }
    if(!connection||connection.distance>16)continue;
    for(let i=0;i<boundary.length;i++){
      const a=boundary[i],b=boundary[(i+1)%boundary.length];add(boundaryStreet(Math.min(a.x,b.x),Math.min(a.z,b.z),a.z===b.z));
    }
    const queue=[connection.from],seen=new Map<string,{parent:string;road:PlannedStreet}|null>([[`${connection.from.x},${connection.from.z}`,null]]);
    const target=`${connection.to.x},${connection.to.z}`;
    for(let index=0;index<queue.length&&index<1600&&!seen.has(target);index++){
      const from=queue[index];
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const next={x:from.x+dx,z:from.z+dz},key=`${next.x},${next.z}`;
        if(seen.has(key)||Math.abs(next.x-connection.from.x)+Math.abs(next.z-connection.from.z)>connection.distance+6)continue;
        const road=plannedStreet(Math.min(from.x,next.x),Math.min(from.z,next.z),dz===0);if(!road)continue;
        seen.set(key,{parent:`${from.x},${from.z}`,road});queue.push(next);
      }
    }
    if(seen.has(target))for(let key=target;seen.get(key);){
      const step=seen.get(key)!;add(step.road);
      for(const node of step.road.nodes){const [x,z]=node.key.split(':')[1].split(',').map(Number);for(const extra of junctionStreets(x,z))add(extra);}
      key=step.parent;
    }
  }
  return {roads,junctions};
}

export const roadWidth=(density:number)=>.45+Math.min(1,density/SETTLEMENT_THRESHOLDS.urban)*.9;
export const roadShoulder=(density:number)=>.2+Math.min(1,density/SETTLEMENT_THRESHOLDS.urban)*.2;
export function streetDensity(road:Street,t:number){
  const [start,middle,end]=road.densities;
  return t<=.5?start+(middle-start)*t*2:middle+(end-middle)*(t-.5)*2;
}
export function mixGroundColor(a:string,b:string,amount:number){
  const t=Math.max(0,Math.min(1,amount));
  return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
}
export function roadColor(density:number){
  const amount=Math.round(Math.min(1,density/SETTLEMENT_THRESHOLDS.urban)*24)/24;
  return amount<.4?mixGroundColor('#b3ac91','#a8b2ad',amount/.4):mixGroundColor('#a8b2ad','#849394',(amount-.4)/.6);
}
export const shoulderColor=(density:number)=>mixGroundColor('#c4bd9f','#dfded3',Math.round(Math.min(1,density/SETTLEMENT_THRESHOLDS.urban)*12)/12);

/** Follow every boundary road's actual shoulder, including angled corners and tapers. */
export function projectPolygon(id:string,roads:Map<string,Street>):GroundPoint[]{
  const nodes=projectBoundary(id),lines:{a:GroundPoint;b:GroundPoint}[]=[];
  for(let i=0;i<nodes.length;i++){
    const start=nodes[i],end=nodes[(i+1)%nodes.length],horizontal=start.z===end.z;
    const road=roads.get(`${horizontal?'h':'v'}:${Math.min(start.x,end.x)},${Math.min(start.z,end.z)}`);
    if(!road)return [];
    const a=plotPosition(start.x-.5,start.z-.5),b=plotPosition(end.x-.5,end.z-.5);
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
    const reversed=start.x>end.x||start.z>end.z;
    const offset=(t:number)=>{
      const density=streetDensity(road,reversed?1-t:t),margin=(roadWidth(density)+roadShoulder(density))/2+.035;
      return {x:a.x+dx*t+nx*margin,z:a.z+dz*t+nz*margin};
    };
    for(let step=0;step<8;step++)lines.push({a:offset(step/8),b:offset((step+1)/8)});
  }
  return lines.flatMap((line,i)=>{
    const previous=lines[(i+lines.length-1)%lines.length];
    const u={x:previous.b.x-previous.a.x,z:previous.b.z-previous.a.z},v={x:line.b.x-line.a.x,z:line.b.z-line.a.z};
    const determinant=u.x*v.z-u.z*v.x;
    if(Math.abs(determinant)<1e-8)return [line.a];
    const t=((line.a.x-previous.a.x)*v.z-(line.a.z-previous.a.z)*v.x)/determinant;
    const point={x:previous.a.x+u.x*t,z:previous.a.z+u.z*t};
    return Math.hypot(point.x-line.a.x,point.z-line.a.z)<PLOT_SPACING/2?[point]:[previous.b,line.a];
  });
}

/** Fill the irregular lot right up to the actual bordering road shoulders. */
export function lotPolygon(building:Building,roads:Map<string,Street>):GroundPoint[]{
  const {x,z}=building,center=plotPosition(x,z),plan=plotPlan(x,z);
  let polygon=parcelOutline(x,z);
  for(const planned of plan.roads){
    const road=roads.get(planned.key);if(!road)continue;
    const [start,end]=road.points,rx=end.x-start.x,rz=end.z-start.z,roadLength=Math.hypot(rx,rz);
    // Access links are not parcel edges. Clip only streets sharing a boundary.
    if(!plan.corners.some((a,i)=>{
      const b=plan.corners[(i+1)%plan.corners.length];
      return Math.abs(rx*(a.z-start.z)-rz*(a.x-start.x))/roadLength<1e-5&&Math.abs(rx*(b.z-start.z)-rz*(b.x-start.x))/roadLength<1e-5;
    }))continue;
    const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    let nx=-dz/length,nz=dx/length;
    if((center.x-a.x)*nx+(center.z-a.z)*nz<0){nx=-nx;nz=-nz;}
    const density=Math.max(...road.densities),margin=(roadWidth(density)+roadShoulder(density))/2+.035;
    const distance=(p:GroundPoint)=>(p.x-a.x)*nx+(p.z-a.z)*nz-margin;
    const clipped:GroundPoint[]=[];
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=distance(p),dq=distance(q);
      if(dp>=0)clipped.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);clipped.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
    }
    polygon=clipped;
  }
  return polygon;
}
