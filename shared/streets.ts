import { plotPosition, worldHash } from './world';
import { isReservedPlot } from './projects';

export const AREA_WIDTH=4,AREA_DEPTH=3,AREA_CAPACITY=AREA_WIDTH*AREA_DEPTH;
export type Point={x:number;z:number};
type Port='n'|'e'|'s'|'w';
export type Layout='t-junction'|'y-junction'|'cul-de-sac'|'crossroads';
export interface PlannedNode{key:string;position:Point;turnRadius?:number;cap?:boolean;}
export interface PlannedStreet{
  key:string;x:number;z:number;horizontal:boolean;points:[Point,Point];nodes:[PlannedNode,PlannedNode];kind:'street'|'turning-ring'|'turning-link';
}
const modulo=(n:number,d:number)=>(n%d+d)%d;
export function areaLayout(ax:number,az:number):Layout{
  return (['t-junction','y-junction','cul-de-sac'] as const)[modulo(ax+2*az,3)];
}
/** One planned special junction inside each area. Public project boundaries stay intact. */
export function junctionLayout(x:number,z:number):Layout{
  const ax=Math.floor((x+2)/AREA_WIDTH),az=Math.floor((z+1)/AREA_DEPTH),kind=areaLayout(ax,az);
  if(x!==ax*AREA_WIDTH||z!==az*AREA_DEPTH-1+(kind==='cul-de-sac'?1:2))return 'crossroads';
  if([[-1,-1],[0,-1],[0,0],[-1,0]].some(([dx,dz])=>isReservedPlot(x+dx,z+dz)))return 'crossroads';
  return kind;
}
const center=(x:number,z:number)=>plotPosition(x-.5,z-.5);
const blocked=(x:number,z:number,port:Port)=>{
  const kind=junctionLayout(x,z);
  return kind==='t-junction'&&port==='e'||kind==='cul-de-sac'&&port!=='w';
};
function node(x:number,z:number,port:Port):PlannedNode{
  const position=center(x,z),kind=junctionLayout(x,z),key=`node:${x},${z}`;
  if(kind==='y-junction'){
    const upper=port==='n'||port==='e',offset=upper?.72:-.72;
    return {key:`${key}:${upper?'ne':'sw'}`,position:{x:position.x+offset,z:position.z-offset}};
  }
  return {key,position,...kind==='cul-de-sac'?{turnRadius:1.35}:{}};
}
/** Geometry is available even for omitted streets, to preserve the land partition. */
export function boundaryStreet(x:number,z:number,horizontal:boolean):PlannedStreet{
  const nodes:[PlannedNode,PlannedNode]=horizontal?[node(x,z,'e'),node(x+1,z,'w')]:[node(x,z,'s'),node(x,z+1,'n')];
  return {key:`${horizontal?'h':'v'}:${x},${z}`,x,z,horizontal,nodes,points:[nodes[0].position,nodes[1].position],kind:'street'};
}
export function plannedStreet(x:number,z:number,horizontal:boolean){
  if(horizontal?(blocked(x,z,'e')||blocked(x+1,z,'w')):(blocked(x,z,'s')||blocked(x,z+1,'n')))return null;
  return boundaryStreet(x,z,horizontal);
}
export function junctionStreets(x:number,z:number):PlannedStreet[]{
  const kind=junctionLayout(x,z);
  if(kind==='y-junction'){
    const a=node(x,z,'n'),b=node(x,z,'s');
    return [{key:`y:${x},${z}`,x,z,horizontal:false,nodes:[a,b],points:[a.position,b.position],kind:'street'}];
  }
  if(kind!=='cul-de-sac')return [];
  const origin=center(x,z),radius=1.35;
  // Facet normals include the four diagonal approaches from surrounding homes.
  const nodes=Array.from({length:12},(_,i)=>{const angle=i/12*Math.PI*2;return {key:`ring:${x},${z}:${i}`,position:{x:origin.x+Math.cos(angle)*radius,z:origin.z+Math.sin(angle)*radius},cap:false};});
  const ring=nodes.map((a,i):PlannedStreet=>{const b=nodes[(i+1)%12];return {key:`bulb:${x},${z}:${i}`,x,z,horizontal:false,nodes:[a,b],points:[a.position,b.position],kind:'turning-ring'};});
  const hub=node(x,z,'w'),entry=nodes[6];
  const access:PlannedStreet={key:`bulb-access:${x},${z}`,x,z,horizontal:false,nodes:[hub,entry],points:[hub.position,entry.position],kind:'turning-link'};
  return [...ring,access,plannedStreet(x-1,z,true)!];
}
export function plotStreets(x:number,z:number){
  const roads=new Map<string,PlannedStreet>();
  for(const [rx,rz,h] of [[x,z,true],[x+1,z,false],[x,z+1,true],[x,z,false]] as [number,number,boolean][]){
    const road=plannedStreet(rx,rz,h);if(road)roads.set(road.key,road);
  }
  const corners=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]];
  const court=corners.find(([nx,nz])=>junctionLayout(nx,nz)==='cul-de-sac');
  // Homes on a court share its single approach and turning circle. Building
  // one does not also activate a ring of unrelated grid streets behind it.
  if(court)return junctionStreets(court[0],court[1]);
  for(const [nx,nz] of corners)for(const road of junctionStreets(nx,nz))roads.set(road.key,road);
  return [...roads.values()];
}
function clipLand(polygon:Point[],a:Point,b:Point,toward:Point){
  const dx=b.x-a.x,dz=b.z-a.z,sign=(dx*(toward.z-a.z)-dz*(toward.x-a.x))>=0?1:-1;
  const distance=(p:Point)=>sign*(dx*(p.z-a.z)-dz*(p.x-a.x)),result:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=distance(p),dq=distance(q);
    if(dp>=0)result.push(p);
    if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);result.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
  }
  return result;
}
export function parcelOutline(x:number,z:number){
  const bottom=boundaryStreet(x,z,true),right=boundaryStreet(x+1,z,false),top=boundaryStreet(x,z+1,true),left=boundaryStreet(x,z,false);
  let points=[...bottom.points,...right.points,...[...top.points].reverse(),...[...left.points].reverse()];
  points=points.filter((p,i)=>Math.hypot(p.x-points[(i+1)%points.length].x,p.z-points[(i+1)%points.length].z)>1e-7);
  const position=plotPosition(x,z);
  for(const [nx,nz] of [[x,z],[x+1,z],[x+1,z+1],[x,z+1]]){
    if(junctionLayout(nx,nz)!=='cul-de-sac')continue;
    const frontage=closestStreet(position,junctionStreets(nx,nz).filter(r=>r.kind==='turning-ring'));
    points=clipLand(points,...frontage.points,position);
  }
  return points;
}
export function closestStreet(position:Point,roads:PlannedStreet[]){
  return roads.reduce((best,road)=>{
    const distance=(r:PlannedStreet)=>{const a=r.points[0],b=r.points[1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(position.x-a.x-dx*t,position.z-a.z-dz*t);};
    return distance(road)<distance(best)?road:best;
  });
}
export function frontageForPlot(x:number,z:number,roads:PlannedStreet[],horizontal:boolean){
  const position=plotPosition(x,z),bulbs=roads.filter(r=>r.kind==='turning-ring');
  if(bulbs.length)return closestStreet(position,bulbs);
  const positive=worldHash(x+29,z-17)>=.5;
  const preferred=`${horizontal?'h':'v'}:${x+(!horizontal&&positive?1:0)},${z+(horizontal&&positive?1:0)}`;
  return roads.find(r=>r.key===preferred)||closestStreet(position,roads.filter(r=>r.kind==='street'&&!r.key.startsWith('y:')));
}
