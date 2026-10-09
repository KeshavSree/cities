import { isLandPlot, plotPosition } from './world';
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
