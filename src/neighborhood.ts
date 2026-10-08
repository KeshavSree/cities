import type { Building } from '../shared/types';
import { plotPosition, PLOT_SPACING } from '../shared/world';

export const SETTLEMENT_THRESHOLDS={suburban:.25,urban:.72};
export const SETTLEMENT_WEIGHTS={proximity:.1,invitations:.9};
export const INVITATION_DEGREE_SCALE=8;

export interface SettlementScore {
  total:number;proximity:number;invitations:number;
  proximityContribution:number;invitationContribution:number;
  invitationDegree:number;nearbyResidents:number;
}

/** One calculation supplies both the rendered world and its dev score breakdown. */
export function neighborhoodScores(buildings:Building[]) {
  const occupied=new Map(buildings.map(b=>[`${b.x},${b.z}`,b]));
  const degrees=new Map<string,number>();
  for(const b of buildings)if(b.invited_by){degrees.set(b.id,(degrees.get(b.id)||0)+1);degrees.set(b.invited_by,(degrees.get(b.invited_by)||0)+1);}
  const cache=new Map<string,SettlementScore>();
  const positions=new Map<string,GroundPoint>();
  const positionAt=(x:number,z:number)=>{const key=`${x},${z}`;if(!positions.has(key))positions.set(key,plotPosition(x,z));return positions.get(key)!;};
  const kernel:{x:number;z:number}[]=[];
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)kernel.push({x,z});
  return (x:number,z:number)=>{
    const key=`${x},${z}`;
    if(cache.has(key))return cache.get(key)!;
    const center=positionAt(x,z);
    let weight=0,connections=0,total=0,nearbyResidents=0;
    for(const k of kernel){
      const neighbor=positionAt(x+k.x,z+k.z);
      const distanceSquared=((neighbor.x-center.x)**2+(neighbor.z-center.z)**2)/PLOT_SPACING**2;
      const importance=Math.exp(-distanceSquared/3.2);total+=importance;
      const b=occupied.get(`${x+k.x},${z+k.z}`);if(!b)continue;
      nearbyResidents++;
      weight+=importance;connections+=importance*Math.min(1,Math.max(b.invite_degree??0,degrees.get(b.id)||0)/INVITATION_DEGREE_SCALE);
    }
    const proximity=weight/total,invitations=weight?connections/weight:0;
    const proximityContribution=SETTLEMENT_WEIGHTS.proximity*proximity,invitationContribution=SETTLEMENT_WEIGHTS.invitations*invitations;
    const resident=occupied.get(key);
    const score={total:proximityContribution+invitationContribution,proximity,invitations,proximityContribution,invitationContribution,
      invitationDegree:resident?Math.max(resident.invite_degree??0,degrees.get(resident.id)||0):0,nearbyResidents};
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
    add(b.x,b.z,true);add(b.x,b.z+1,true);
    if(settlementType(densityAt(b.x,b.z))==='urban'||occupied.has(`${b.x},${b.z+1}`)||occupied.has(`${b.x},${b.z-1}`)){
      add(b.x,b.z,false);add(b.x+1,b.z,false);
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
