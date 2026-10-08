import type { Building } from '../shared/types';
import { LEVELS_PER_TIER, segmentDesigns, tierForLevel, tierIndex } from '../shared/progression';
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
  for(const edge of edges)if(edge.widthProjection>=1e-6){
    w=Math.min(w,2*(edge.distance-.3-padding*(edge.widthProjection+edge.depthProjection)-d*edge.depthProjection/2)/edge.widthProjection);
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

/** Fit the proposed shape inside the supporting wall outline, with a structural setback. */
function supportedOutline(support:Point[],candidate:Point[],inset=.08){
  const center=centerOf(support),origin=centerOf(candidate);let scale=1;
  const relative=candidate.map(p=>({x:p.x-origin.x,z:p.z-origin.z}));
  for(let i=0;i<support.length;i++){
    const a=support[i],b=support[(i+1)%support.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
    const clearance=(center.x-a.x)*nx+(center.z-a.z)*nz-inset;
    const reach=Math.max(...relative.map(p=>-p.x*nx-p.z*nz));
    if(reach>0)scale=Math.min(scale,Math.max(0,clearance)/reach);
  }
  return relative.map(p=>({x:center.x+p.x*scale,z:center.z+p.z*scale}));
}
function beveledOutline(points:Point[],all=false){
  return points.flatMap((p,i)=>{
    if(!all&&i!==0)return [p];
    const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],t=all?.15:.22;
    return [{x:p.x+(previous.x-p.x)*t,z:p.z+(previous.z-p.z)*t},{x:p.x+(next.x-p.x)*t,z:p.z+(next.z-p.z)*t}];
  });
}
export const MODEL_SETBACKS=[0,0,0,1.2,.8,.4,.39,.38,.37,.36];

/** Each tier adds a segment; each upper shape is fitted to the section beneath it. */
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
  const designs=segmentDesigns(building),sections:{outline:Point[];cornice:Point[];y:number;h:number;segment:number}[]=[];
  let support=podium||rectangleOutline(plan,footprint.w,footprint.d);
  for(let segment=0;segment<designs.length;segment++){
    let outline=support;
    if(segment>0){
      let candidate=scaleOutline(support,tier<=2?.99:.97);
      if(segment===1&&tier>=3){
        if(tier>=7){
          const sides=tier===7?3:tier===8?5:6,radius=Math.max(footprint.w,footprint.d)*.5;
          candidate=Array.from({length:sides},(_,i)=>{const angle=plan.rotation+i/sides*Math.PI*2;return {x:plan.position.x+Math.cos(angle)*radius,z:plan.position.z+Math.sin(angle)*radius};});
        }else candidate=rectangleOutline(plan,footprint.w*.9,footprint.d*.86);
        if(tier===6)candidate=beveledOutline(candidate,true);
      }else if(segment===2&&tier>=4&&tier<=5)candidate=beveledOutline(candidate);
      if(tier>=7&&segment>1){
        const center=centerOf(candidate),angle=(tier===7?.018:tier===8?-.022:.025),c=Math.cos(angle),s=Math.sin(angle);
        candidate=candidate.map(p=>({x:center.x+(p.x-center.x)*c-(p.z-center.z)*s,z:center.z+(p.x-center.x)*s+(p.z-center.z)*c}));
      }
      outline=supportedOutline(support,candidate,tier>=6?.065:.045);
    }
    sections.push({outline,cornice:scaleOutline(outline,1.02),y:baseY+height*segment/designs.length,h:height/designs.length,segment});
    support=outline;
  }
  const roofHeight=tier===0?.25:tier<=2?.95:tier>=6?2.5:building.style==='spire'?2.26:.66;
  return {kind:definition.kind,tier,definition,height,footprint,podium,podiumFoundation,foundationOutline:podiumFoundation||rectangleOutline(plan,footprint.w+foundationPadding*2,footprint.d+foundationPadding*2),sections,foundationPadding,foundationHeight,baseY,topY:baseY+height+roofHeight,segments:designs};
}
