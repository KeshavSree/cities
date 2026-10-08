import type { Building } from '../shared/types';
import { segmentDesigns, tierForLevel, tierIndex } from '../shared/progression';
import { plotPlan } from '../shared/plots';

/** Fit a rectangle to the angled plot, reserving a passage along every street centerline. */
function plotFootprint(building:Building,tier:number,padding:number){
  const plan=plotPlan(building.x,building.z),right={x:Math.cos(plan.rotation),z:-Math.sin(plan.rotation)},front={x:Math.sin(plan.rotation),z:Math.cos(plan.rotation)};
  const edges=plan.corners.map((a,i)=>{
    const b=plan.corners[(i+1)%plan.corners.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const nx=-dz/length,nz=dx/length,distance=Math.abs((plan.position.x-a.x)*nx+(plan.position.z-a.z)*nz);
    const widthProjection=Math.abs(right.x*nx+right.z*nz),depthProjection=Math.abs(front.x*nx+front.z*nz);
    return {distance,widthProjection,depthProjection};
  });
  // The full tier reaches 0.4 units from its frontage centerline. Reduce width
  // to fit skewed side boundaries instead of pulling the front back from its road.
  let d=2*(plan.frontage.distance-.4),w=6.4;
  for(const edge of edges)if(edge.widthProjection<1e-6){
    d=Math.min(d,2*(edge.distance-.3-padding*edge.depthProjection)/edge.depthProjection);
  }
  for(const edge of edges)if(edge.widthProjection>=1e-6){
    w=Math.min(w,2*(edge.distance-.3-padding*(edge.widthProjection+edge.depthProjection)-d*edge.depthProjection/2)/edge.widthProjection);
  }
  const growth=[.48,.59,.72,.86,1][tier];
  return {w:w*growth,d:d*growth};
}

/** The tower and its ground follow its own level; road density is independent. */
export function buildingForm(building:Building,roadScore=0){
  const tier=tierIndex(building.level),step=(building.level-1)%4,definition=tierForLevel(building.level);
  const height=[1.15,2.35,4.3,7,10.2][tier]+step*[.16,.24,.35,.45,.55][tier];
  const foundationPadding=tier===4?.1:.12+Math.min(1,roadScore/.72)*.08;
  // Use the same fit at all tiers so each successive footprint is strictly larger.
  const footprint=plotFootprint(building,tier,.1);
  const foundationHeight=[.09,.13,.19,.25,.34][tier],baseY=.085+foundationHeight;
  const roofHeight=tier===0||tier===1?1.12:building.style==='spire'?2.26:building.style==='terrace'?.9:.66;
  return {kind:definition.kind,tier,definition,height,footprint,foundationPadding,foundationHeight,baseY,topY:baseY+height+roofHeight,segments:segmentDesigns(building)};
}
