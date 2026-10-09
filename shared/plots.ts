import { isLandPlot, plotPosition, streetGrid } from './world';
import { isReservedPlot } from './projects';

import { AREA_WIDTH, AREA_DEPTH, parcelOutline, plotStreets, frontageForPlot, areaLayout, type PlannedStreet, type Layout } from './streets';
export { AREA_WIDTH, AREA_DEPTH, AREA_CAPACITY } from './streets';
type Point={x:number;z:number};
export interface PlotPlan{
  x:number;z:number;area:string;axis:'horizontal'|'vertical';
  position:Point;corners:Point[];rotation:number;roads:PlannedStreet[];layout:Layout;
  frontage:{key:string;x:number;z:number;horizontal:boolean;distance:number;points:[Point,Point]};
}
const areas=new Map<string,Map<string,PlotPlan>>();

/** Plan all twelve slots together, including slots that have no resident yet.
 * Adjacent areas switch road families after a full area of planned frontage.
 * Occupancy never rotates a resident or changes an existing plot blueprint.
 */
export function plotPlan(x:number,z:number):PlotPlan{
  const ax=Math.floor((x+2)/AREA_WIDTH),az=Math.floor((z+1)/AREA_DEPTH),area=`${ax},${az}`;
  if(!areas.has(area)){
    const plans=new Map<string,PlotPlan>();
    const horizontal=(ax+az)%2===0;
    for(let dx=0;dx<AREA_WIDTH;dx++)for(let dz=0;dz<AREA_DEPTH;dz++){
      const px=ax*AREA_WIDTH-2+dx,pz=az*AREA_DEPTH-1+dz,position=plotPosition(px,pz);
      const corners=parcelOutline(px,pz),roads=plotStreets(px,pz),frontage=frontageForPlot(px,pz,roads,horizontal);
      const [a,b]=frontage.points;
      const vx=b.x-a.x,vz=b.z-a.z,length=Math.hypot(vx,vz);
      let nx=-vz/length,nz=vx/length;
      if((a.x-position.x)*nx+(a.z-position.z)*nz<0){nx=-nx;nz=-nz;}
      plans.set(`${px},${pz}`,{x:px,z:pz,area,axis:horizontal?'horizontal':'vertical',position,corners,
        roads,layout:areaLayout(ax,az),rotation:Math.atan2(nx,nz),frontage:{key:frontage.key,x:frontage.x,z:frontage.z,horizontal:frontage.horizontal,points:frontage.points,distance:Math.abs((a.x-position.x)*nx+(a.z-position.z)*nz)}});
    }
    // Bound the cache when the camera explores a very large world.
    if(areas.size>=512)areas.delete(areas.keys().next().value!);
    areas.set(area,plans);
  }
  return areas.get(area)!.get(`${x},${z}`)!;
}

/** Same precomputed candidate order for server placement and frontend previews. */
export function availablePlotPlans(origin:{x:number;z:number},occupied:Set<string>,radius=12){
  const plans:PlotPlan[]=[];
  for(let ring=1;ring<=radius;ring++)for(let dx=-ring;dx<=ring;dx++)for(let dz=-ring;dz<=ring;dz++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
    const x=origin.x+dx,z=origin.z+dz;
    if(occupied.has(`${x},${z}`)||isReservedPlot(x,z)||!isLandPlot(x,z))continue;
    plans.push(plotPlan(x,z));
  }
  return plans;
}

/** Keep the first allocation candidate, then show both the nearby transition
 * and complete outgoing blocks. A near-only preview can hide the new lattice.
 */
export function previewPlotPlans(origin:{x:number;z:number},occupied:Set<string>,limit=48){
  const plans=availablePlotPlans(origin,occupied),selected=new Map<string,PlotPlan>();
  const add=(plan:PlotPlan)=>selected.set(`${plan.x},${plan.z}`,plan);
  // Reserve a few slots for the approach into the exterior preview block.
  plans.slice(0,Math.max(1,Math.ceil(limit*2/3)-4)).forEach(add);
  const position=plotPosition(origin.x,origin.z),groups:PlotPlan[][]=Array.from({length:8},()=>[]),exterior=new Map<string,PlotPlan>();
  for(const plan of plans){
    const outgoing=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].every(([dx,dz])=>streetGrid(plan.x+dx,plan.z+dz).key==='outgoing-grid');
    if(!outgoing||selected.has(`${plan.x},${plan.z}`))continue;
    exterior.set(`${plan.x},${plan.z}`,plan);
    const sector=(Math.round(Math.atan2(plan.position.z-position.z,plan.position.x-position.x)/(Math.PI/4))+8)%8;
    groups[sector].push(plan);
  }
  // Show a coherent block of the new lattice, rather than disconnected single
  // plots whose square-grid relationship is hard to see in the 3D view.
  const side=Math.floor(Math.sqrt(limit-selected.size));let cluster:PlotPlan[]|undefined,bestDistance=Infinity;
  if(side>=2)for(const anchor of exterior.values()){
    const block:PlotPlan[]=[];
    for(let dx=0;dx<side;dx++)for(let dz=0;dz<side;dz++){
      const plan=exterior.get(`${anchor.x+dx},${anchor.z+dz}`);if(plan)block.push(plan);
    }
    if(block.length!==side*side)continue;
    const distance=block.reduce((sum,p)=>sum+(p.position.x-position.x)**2+(p.position.z-position.z)**2,0)/block.length;
    if(distance<bestDistance){bestDistance=distance;cluster=block;}
  }
  cluster?.forEach(add);
  if(cluster){
    const target=cluster.reduce((best,p)=>Math.abs(p.x-origin.x)+Math.abs(p.z-origin.z)<Math.abs(best.x-origin.x)+Math.abs(best.z-origin.z)?p:best);
    const available=new Map(plans.map(p=>[`${p.x},${p.z}`,p]));
    let x=origin.x,z=origin.z;
    while((x!==target.x||z!==target.z)&&selected.size<limit){
      if(Math.abs(target.x-x)>Math.abs(target.z-z))x+=Math.sign(target.x-x);else z+=Math.sign(target.z-z);
      const plan=available.get(`${x},${z}`);if(plan)add(plan);
    }
  }
  while(selected.size<limit&&groups.some(group=>group.length))for(const group of groups){
    if(selected.size>=limit)break;
    const plan=group.shift();if(plan&&!selected.has(`${plan.x},${plan.z}`))add(plan);
  }
  for(const plan of plans){if(selected.size>=limit)break;add(plan);}
  return [...selected.values()];
}
