import type { Building } from '../shared/types';
import { shopAttachment } from '../shared/shopAttachments';
import { DECORATIONS, placedDecorations } from '../shared/decorations';
import { plotPosition } from '../shared/world';
import { canWalk, streetObstacles, type StreetPoint } from './streetNavigation';
import { neighborhoodDensity, streetNetwork, type Street } from './neighborhood';

export const NEIGHBOR_RADIUS=.145;
const STEP=.15;
const distance=(a:StreetPoint,b:StreetPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export interface NeighborDestination {id:string;point:StreetPoint;face:StreetPoint;label:string;kind:'shop'|'stroll'|'home';purchased?:boolean;}

/** Shared static navigation, with a spatial index for the many small street furnishings. */
export class NeighborRoutes {
  readonly shops:NeighborDestination[]=[];
  readonly strolls:NeighborDestination[]=[];
  private obstacles=new Map<string,StreetPoint[][]>();
  private roads:Street[];
  private roadCells=new Map<string,Street[]>();
  private clearCells=new Map<string,boolean>();
  private costCells=new Map<string,number>();
  private paths=new Map<string,StreetPoint[]|null>();
  constructor(buildings:Building[]){
    for(const polygon of streetObstacles(buildings)){
      const x0=Math.floor((Math.min(...polygon.map(p=>p.x))-NEIGHBOR_RADIUS)/2),x1=Math.floor((Math.max(...polygon.map(p=>p.x))+NEIGHBOR_RADIUS)/2);
      const z0=Math.floor((Math.min(...polygon.map(p=>p.z))-NEIGHBOR_RADIUS)/2),z1=Math.floor((Math.max(...polygon.map(p=>p.z))+NEIGHBOR_RADIUS)/2);
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x},${z}`,list=this.obstacles.get(key)||[];list.push(polygon);this.obstacles.set(key,list);}
    }
    this.roads=[...streetNetwork(buildings,neighborhoodDensity(buildings)).roads.values()];
    for(const road of this.roads){
      const [a,b]=road.points;
      for(let x=Math.floor(Math.min(a.x,b.x)/4)-1;x<=Math.floor(Math.max(a.x,b.x)/4)+1;x++)for(let z=Math.floor(Math.min(a.z,b.z)/4)-1;z<=Math.floor(Math.max(a.z,b.z)/4)+1;z++){
        const key=`${x},${z}`,list=this.roadCells.get(key)||[];list.push(road);this.roadCells.set(key,list);
      }
      const point={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
      if(this.clear(point))this.strolls.push({id:`street:${road.key}`,point,face:b,label:'Taking a walk',kind:'stroll'});
    }
    for(const building of buildings){
      const origin=plotPosition(building.x,building.z);
      for(const shop of placedDecorations(building).filter(item=>item.kind==='storefront'||item.kind==='base_shop')){
        const angle=shop.kind==='base_shop'?shopAttachment(building,shop)!.angle:shop.rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),face={x:origin.x+shop.x,z:origin.z+shop.z};
        for(const along of [0,-.25,.25]){
          const depth=shop.kind==='base_shop'?DECORATIONS[shop.kind].depth-.05+NEIGHBOR_RADIUS+.08:DECORATIONS[shop.kind].depth/2+.25,point={x:face.x+along*c-depth*s,z:face.z-along*s-depth*c};
          if(this.clear(point)){this.shops.push({id:shop.id,point,face,label:DECORATIONS[shop.kind].label,kind:'shop',purchased:true});break;}
        }
      }

    }
  }
  clear(point:StreetPoint){return canWalk(point,this.obstacles.get(`${Math.floor(point.x/2)},${Math.floor(point.z/2)}`)||[],NEIGHBOR_RADIUS);}
  segment(a:StreetPoint,b:StreetPoint){
    const steps=Math.max(1,Math.ceil(distance(a,b)/.08));
    for(let i=0;i<=steps;i++)if(!this.clear({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps}))return false;
    return true;
  }
  private roadCost(point:StreetPoint){
    const key=`${Math.round(point.x/STEP)},${Math.round(point.z/STEP)}`,cached=this.costCells.get(key);if(cached!==undefined)return cached;
    let nearest=3;
    for(const road of this.roadCells.get(`${Math.floor(point.x/4)},${Math.floor(point.z/4)}`)||[]){
      const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));
      nearest=Math.min(nearest,Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz));
    }
    const cost=1+Math.min(2,Math.max(0,nearest-.55)*1.1);this.costCells.set(key,cost);return cost;
  }
  /** Lazy A* favors streets; every step and endpoint is checked against real footprints. */
  path(start:StreetPoint,goal:StreetPoint):StreetPoint[]|null{
    const key=`${start.x},${start.z}:${goal.x},${goal.z}`;
    if(this.paths.has(key))return this.paths.get(key)?.map(p=>({...p}))??null;
    const result=this.search(start,goal);
    if(this.paths.size>=256)this.paths.delete(this.paths.keys().next().value!);
    this.paths.set(key,result);if(this.clearCells.size>100_000){this.clearCells.clear();this.costCells.clear();}
    return result?.map(p=>({...p}))??null;
  }
  private search(start:StreetPoint,goal:StreetPoint):StreetPoint[]|null{

    if(!this.clear(start)||!this.clear(goal)||distance(start,goal)>40)return null;
    if(distance(start,goal)<.65&&this.segment(start,goal))return [{...start},{...goal}];
    const minX=Math.floor((Math.min(start.x,goal.x)-3)/STEP),maxX=Math.ceil((Math.max(start.x,goal.x)+3)/STEP);
    const minZ=Math.floor((Math.min(start.z,goal.z)-3)/STEP),maxZ=Math.ceil((Math.max(start.z,goal.z)+3)/STEP);
    type Node={x:number;z:number;g:number;f:number;parent:Node|null};
    const heap:Node[]=[],best=new Map<string,number>();
    const push=(node:Node)=>{heap.push(node);let i=heap.length-1;while(i){const parent=(i-1)>>1;if(heap[parent].f<=node.f)break;heap[i]=heap[parent];i=parent;}heap[i]=node;};
    const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
    const gridClear=(x:number,z:number)=>{const key=`${x},${z}`;let clear=this.clearCells.get(key);if(clear===undefined){clear=this.clear({x:x*STEP,z:z*STEP});this.clearCells.set(key,clear);}return clear;};
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const x=Math.round(start.x/STEP)+dx,z=Math.round(start.z/STEP)+dz,point={x:x*STEP,z:z*STEP};
      if(gridClear(x,z)&&this.segment(start,point)){const g=distance(start,point),key=`${x},${z}`;best.set(key,g);push({x,z,g,f:g+distance(point,goal),parent:null});}
    }
    for(let expanded=0;heap.length&&expanded<14000;expanded++){
      const node=pop(),key=`${node.x},${node.z}`;if(node.g>best.get(key)!+1e-7)continue;
      const point={x:node.x*STEP,z:node.z*STEP};
      if(distance(point,goal)<.31&&this.segment(point,goal)){
        const result:StreetPoint[]=[{...goal}];let current:Node|null=node;
        while(current){result.push({x:current.x*STEP,z:current.z*STEP});current=current.parent;}result.push({...start});result.reverse();
        // Remove collinear grid steps, preserving corners and clearance.
        return result.filter((p,i)=>{if(!i||i===result.length-1)return true;const a=result[i-1],b=result[i+1];return Math.abs((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x))>1e-7;});
      }
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
        if(!dx&&!dz)continue;const x=node.x+dx,z=node.z+dz;if(x<minX||x>maxX||z<minZ||z>maxZ||!gridClear(x,z))continue;
        const next={x:x*STEP,z:z*STEP},g=node.g+STEP*Math.hypot(dx,dz)*this.roadCost(next),nextKey=`${x},${z}`;
        if(g>=(best.get(nextKey)??Infinity)-1e-7||!this.segment(point,next))continue;
        best.set(nextKey,g);push({x,z,g,f:g+distance(next,goal),parent:node});
      }
    }
    return null;
  }
}
