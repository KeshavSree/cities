import type { Building } from '../shared/types';
import { plotPosition, PLOT_SPACING } from '../shared/world';
import { plotPlan } from '../shared/plots';
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

/** Straight streets connect shared corners at varied angles. */
export function streetPoints(x:number,z:number,horizontal:boolean) {
  const a=plotPosition(x-.5,z-.5);
  const b=horizontal?plotPosition(x+.5,z-.5):plotPosition(x-.5,z+.5);
  return [a,b];
}

export type GroundPoint={x:number;z:number};
export interface Street {
  key:string;x:number;z:number;horizontal:boolean;
  points:GroundPoint[];densities:[number,number,number];
}
export function streetNetwork(buildings:Building[],densityAt:(x:number,z:number)=>number){
  const occupied=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const roads=new Map<string,Street>();
  const junctions=new Map<string,{position:GroundPoint;density:number}>();
  const nodeDensity=(x:number,z:number)=>(densityAt(x,z)+densityAt(x-1,z)+densityAt(x,z-1)+densityAt(x-1,z-1))/4;
  const add=(x:number,z:number,horizontal:boolean)=>{
    const key=`${horizontal?'h':'v'}:${x},${z}`;
    if(roads.has(key))return;
    const endX=x+(horizontal?1:0),endZ=z+(horizontal?0:1);
    const points=streetPoints(x,z,horizontal);
    const densities:[number,number,number]=[nodeDensity(x,z),horizontal?(densityAt(x,z)+densityAt(x,z-1))/2:(densityAt(x,z)+densityAt(x-1,z))/2,nodeDensity(endX,endZ)];
    roads.set(key,{key,x,z,horizontal,points,densities});
    junctions.set(`${x},${z}`,{position:points[0],density:densities[0]});
    junctions.set(`${endX},${endZ}`,{position:points[1],density:densities[2]});
  };
  for(const b of buildings){
    const plan=plotPlan(b.x,b.z),horizontal=plan.axis==='horizontal';
    // An occupied plot always creates its planned entrance road, even in isolation.
    add(plan.frontage.x,plan.frontage.z,plan.frontage.horizontal);
    add(b.x,b.z,horizontal);add(b.x+(horizontal?0:1),b.z+(horizontal?1:0),horizontal);
    if(settlementType(densityAt(b.x,b.z))==='urban'||
      [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>occupied.has(`${b.x+dx},${b.z+dz}`))){
      add(b.x,b.z,!horizontal);add(b.x+(horizontal?1:0),b.z+(horizontal?0:1),!horizontal);
    }
  }
  // Shared places occupy land just like homes: give each one real boundary streets
  // and connect its closest street corner to the existing network.
  for(const project of PUBLIC_PROJECTS){
    const boundary=projectBoundary(project.id),existing=[...junctions.keys()].map(key=>{
      const [x,z]=key.split(',').map(Number);return {x,z};
    });
    let connection:{from:GroundPoint;to:GroundPoint;distance:number}|undefined;
    for(const from of boundary)for(const to of existing){
      const distance=Math.abs(from.x-to.x)+Math.abs(from.z-to.z);
      if(!connection||distance<connection.distance)connection={from,to,distance};
    }
    // Far-away projects do not generate streets through the unloaded world.
    if(!connection||connection.distance>16)continue;
    for(let i=0;i<boundary.length;i++){
      const a=boundary[i],b=boundary[(i+1)%boundary.length];
      add(Math.min(a.x,b.x),Math.min(a.z,b.z),a.z===b.z);
    }
    let {x,z}=connection.from;
    while(x!==connection.to.x){const next=x+Math.sign(connection.to.x-x);add(Math.min(x,next),z,true);x=next;}
    while(z!==connection.to.z){const next=z+Math.sign(connection.to.z-z);add(x,Math.min(z,next),false);z=next;}
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
  const {x,z}=building,center=plotPosition(x,z);
  let polygon=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dz])=>plotPosition(x+dx,z+dz));
  for(const key of [`h:${x},${z}`,`h:${x},${z+1}`,`v:${x},${z}`,`v:${x+1},${z}`]){
    const road=roads.get(key);if(!road)continue;
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
