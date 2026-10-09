import type { Building } from '../shared/types';
import { LEVELS_PER_TIER, segmentDesigns, tierForLevel, tierIndex, type SegmentDesign, type BuildingTheme } from '../shared/progression';
import { plotPlan, type PlotPlan } from '../shared/plots';

/** Offset each parcel edge inward, keeping its original street angle. */
export function insetPlotPolygon(plan:PlotPlan,margin:number){
  let polygon=plan.corners.map(p=>({...p}));
  for(let i=0;i<plan.corners.length;i++){
    const a=plan.corners[i],b=plan.corners[(i+1)%plan.corners.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const distance=(p:{x:number;z:number})=>(dx*(p.z-a.z)-dz*(p.x-a.x))/length-margin;
    const clipped:{x:number;z:number}[]=[];
    for(let j=0;j<polygon.length;j++){
      const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=distance(p),dq=distance(q);
      if(dp>=0)clipped.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);clipped.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
    }
    polygon=clipped;
  }
  return polygon;
}

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
  const widthAt=(depth:number)=>Math.min(6.4,...edges.filter(edge=>edge.widthProjection>=1e-6).map(edge=>2*(edge.distance-.3-padding*(edge.widthProjection+edge.depthProjection)-depth*edge.depthProjection/2)/edge.widthProjection));
  w=widthAt(d);
  // Diagonal cul-de-sac frontage can make the old full-depth rectangle too
  // long. Trade depth for usable width while staying inside every parcel edge.
  if(w<1.6){
    for(const edge of edges)if(edge.depthProjection>1e-6)d=Math.min(d,2*(edge.distance-.3-padding*(edge.widthProjection+edge.depthProjection)-.8*edge.widthProjection)/edge.depthProjection);
    w=widthAt(d);
  }
  const growth=[.3,.48,.59,.72,.86,1,1.005,1.01,1.015,1.02][tier];
  return {w:w*growth,d:d*growth};
}

type Point={x:number;z:number};
const centerOf=(points:Point[])=>({x:points.reduce((sum,p)=>sum+p.x,0)/points.length,z:points.reduce((sum,p)=>sum+p.z,0)/points.length});
const scaleOutline=(points:Point[],scale:number)=>{const center=centerOf(points);return points.map(p=>({x:center.x+(p.x-center.x)*scale,z:center.z+(p.z-center.z)*scale}));};
const rectangleOutline=(plan:PlotPlan,w:number,d:number)=>{
  const c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);
  return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([x,z])=>({x:plan.position.x+x*c+z*s,z:plan.position.z-x*s+z*c}));
};

/** Convex clipping also measures the part of a proposal carried by the previous tier. */
export function clipOutline(polygon:Point[],boundary:Point[],allowance=0){
  let result=polygon;
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const distance=(p:Point)=>(dx*(p.z-a.z)-dz*(p.x-a.x))/length+allowance;
    const next:Point[]=[];
    for(let j=0;j<result.length;j++){
      const p=result[j],q=result[(j+1)%result.length],dp=distance(p),dq=distance(q);
      if(dp>=-1e-8)next.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
    }
    result=next;
  }
  return result.filter((p,i)=>Math.hypot(p.x-result[(i+1)%result.length].x,p.z-result[(i+1)%result.length].z)>1e-6);
}
export const outlineArea=(points:Point[])=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0))/2;

export interface BuildingSection {
  outline:Point[];cornice:Point[];y:number;h:number;segment:number;
  supportRatio:number;overhang:number;role:string;terrace:boolean;loggia:boolean;
}

// Themes propose a tier independently; the shared composition layer carries
// plot geometry and the previous tier across theme boundaries.
const MASSING_THEMES:Record<BuildingTheme,{profiles:number[][];towerProfiles:number[][];cornerCut:number}>={
  contemporary:{profiles:[
    [1,1,0,0], [.94,.80,-.025,-.08], [.94,.80,-.025,-.08],
    [.77,.83,.055,-.065], [.77,.71,.055,-.12], [.82,.71,.03,-.12],
    [.67,.72,-.04,-.10], [.67,.60,-.04,-.16], [.57,.62,.005,-.15], [.49,.50,.035,-.20],
  ],towerProfiles:[
    [1,1,0,0], [.94,.84,-.012,-.06], [.94,.84,-.012,-.06],
    [.80,.78,.008,-.09], [.80,.78,.008,-.09], [.80,.78,.008,-.09],
    [.68,.67,-.006,-.13], [.68,.67,-.006,-.13], [.68,.67,-.006,-.13], [.58,.58,0,-.16],
  ],cornerCut:.23},
};
function composeSections(plan:PlotPlan,base:Point[],designs:SegmentDesign[],tier:number){
  const count=designs.length;
  const c=Math.cos(plan.rotation),s=Math.sin(plan.rotation),origin=centerOf(base);
  const local=base.map(p=>({x:(p.x-origin.x)*c-(p.z-origin.z)*s,z:(p.x-origin.x)*s+(p.z-origin.z)*c}));
  const toWorld=(p:Point)=>({x:origin.x+p.x*c+p.z*s,z:origin.z-p.x*s+p.z*c});
  const w=Math.max(...local.map(p=>p.x))-Math.min(...local.map(p=>p.x));
  const d=Math.max(...local.map(p=>p.z))-Math.min(...local.map(p=>p.z));
  // Mirror the setback sequence between parcels while keeping the entrance
  // axis fixed. This creates complementary silhouettes along a street.
  const handedness=(Math.abs(plan.x*3+plan.z)%2===0?1:-1);
  let previous=base,previousQuad=base;
  return Array.from({length:count},(_,segment)=>{
    if(segment===0)return {outline:base,supportRatio:1,overhang:0,role:tier>=3?'Street podium':'Road-facing home',loggia:false};
    const grammar=MASSING_THEMES[designs[segment].theme];
    const profiles=tier>=6?grammar.towerProfiles:grammar.profiles;
    const [sx,sz,tx,tz]=profiles[segment];
    const continuesVolume=designs[segment-1].theme===designs[segment].theme&&profiles[segment].every((value,i)=>value===profiles[segment-1][i]);
    // Plot skew survives in every candidate. The previous parcel frame
    // contributes 35%; the design brief contributes 65%. Neither is a template.
    const strength=tier<=2?.25:1;
    const quad=tier>=6&&continuesVolume?previousQuad:local.map((p,i)=>{
      const desired=toWorld({x:p.x*(1-(1-sx)*strength)+tx*w*strength*handedness,z:p.z*(1-(1-sz)*strength)+tz*d*strength});
      return {x:desired.x*.65+previousQuad[i].x*.35,z:desired.z*.65+previousQuad[i].z*.35};
    });
    let candidate=quad;
    // A chamfer is a local response to a corner, never the entire tower's plan.
    if(tier>=6&&(segment>=6||segment===count-1)){
      const corner=(Math.abs(plan.x+plan.z)%2===0?0:2),t=segment===count-1?.18:.12;
      candidate=quad.flatMap((p,i)=>i!==corner?[p]:[
        {x:p.x+(quad[(i+quad.length-1)%quad.length].x-p.x)*t,z:p.z+(quad[(i+quad.length-1)%quad.length].z-p.z)*t},
        {x:p.x+(quad[(i+1)%quad.length].x-p.x)*t,z:p.z+(quad[(i+1)%quad.length].z-p.z)*t},
      ]);
    }
    // A small cantilever is permitted. At least 85% of the floor plate must
    // overlap the previous one, and no edge can project by more than 0.28.
    let allowance=tier>=4?.28:.10,outline=clipOutline(candidate,previous,allowance);
    let supportRatio=outlineArea(clipOutline(outline,previous))/outlineArea(outline);
    while(supportRatio<.85&&allowance>.001){
      allowance*=.5;outline=clipOutline(candidate,previous,allowance);
      supportRatio=outlineArea(clipOutline(outline,previous))/outlineArea(outline);
    }
    const overhang=Math.max(0,...previous.map((a,i)=>{const b=previous[(i+1)%previous.length],dx=b.x-a.x,dz=b.z-a.z;return Math.max(...outline.map(p=>(dz*(p.x-a.x)-dx*(p.z-a.z))/Math.hypot(dx,dz)));}));
    previous=outline;previousQuad=quad;
    return {outline,supportRatio,overhang,role:segment===count-1&&tier>=3?'Garden crown':segment<3?'Lower residential volume':segment<6?'Continuous middle volume':'Upper garden volume',loggia:tier>=6&&segment===6};
  });
}
export const MODEL_SETBACKS=[0,0,0,1.2,.8,.4,.39,.38,.37,.36];

/** Each tier adds an editable segment within a connected architectural composition. */
export function buildingForm(building:Building,roadScore=0){
  const tier=tierIndex(building.level),step=(building.level-1)%LEVELS_PER_TIER,definition=tierForLevel(building.level);
  const height=[.8,1.25,2.6,4.5,7.2,10.5,15,20,26,34][tier]+step*[.08,.14,.23,.32,.45,.55,.7,.85,1,1.2][tier];
  const foundationPadding=tier>=5?.1:.12+Math.min(1,roadScore/.72)*.08;
  // Use the same fit at all tiers so each successive footprint is strictly larger.
  const footprint=plotFootprint(building,tier,.1);
  const plan=plotPlan(building.x,building.z),podiumSetback=MODEL_SETBACKS[tier];
  const podium=tier>=3?insetPlotPolygon(plan,podiumSetback):null;
  const podiumFoundation=tier>=3?insetPlotPolygon(plan,podiumSetback-foundationPadding):null;
  const foundationHeight=[.045,.08,.13,.19,.25,.34,.4,.46,.52,.6][tier],baseY=.085+foundationHeight;
  const designs=segmentDesigns(building),base=podium||rectangleOutline(plan,footprint.w,footprint.d);
  const proposals=composeSections(plan,base,designs,tier);
  // Lower podium and crown are shorter than the main inhabited volumes.
  const weights=designs.map((_,i)=>tier<3?1:i===0?.68:i===designs.length-1?.8:1.12);
  const total=weights.reduce((sum,n)=>sum+n,0);let y=baseY;
  const sections:BuildingSection[]=proposals.map((proposal,segment)=>{
    const h=height*weights[segment]/total,above=proposals[segment+1]?.outline;
    const exposed=above?outlineArea(proposal.outline)-outlineArea(clipOutline(proposal.outline,above)):outlineArea(proposal.outline);
    const section={...proposal,cornice:scaleOutline(proposal.outline,1.012),y,h,segment,terrace:exposed>.35};y+=h;return section;
  });
  const roofHeight=tier===0?.25:tier<=2?.95:tier>=3?(building.style==='spire'?1.4:1.1):.66;
  return {kind:definition.kind,tier,definition,height,footprint,podium,podiumFoundation,foundationOutline:podiumFoundation||rectangleOutline(plan,footprint.w+foundationPadding*2,footprint.d+foundationPadding*2),sections,foundationPadding,foundationHeight,baseY,topY:baseY+height+roofHeight,segments:designs};
}
