import type { Building } from '../shared/types';
import { placementPlan } from '../shared/plots';
import { neighborhoodScores, streetNetwork } from './neighborhood';
import { buildingForm } from './buildingForm';
import { TIERS } from '../shared/progression';

/** Each preview simulates one join, rather than treating all empty slots as occupied. */
export function upcomingPlotPreviews(buildings:Building[],inviter:Building,available:{x:number;z:number}[]){
  const occupied=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const slots=available.filter(p=>!occupied.has(`${p.x},${p.z}`)).flatMap(p=>{const plan=placementPlan(inviter,p.x,p.z);return plan?[plan]:[];});
  return slots.map(plan=>{
    const resident:Building={...inviter,id:`preview:${plan.x},${plan.z}`,name:'Next resident',username:'preview',
      x:plan.x,z:plan.z,level:1,xp:0,bricks:0,segments:JSON.stringify(Array(TIERS.length).fill(null)),likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,
      invited_by:inviter.id,inviter_x:inviter.x,inviter_z:inviter.z,invite_degree:1};
    const hypothetical=[...buildings,resident];
    const scoreAt=neighborhoodScores(hypothetical),score=scoreAt(plan.x,plan.z);
    const network=streetNetwork(hypothetical,(x,z)=>scoreAt(x,z).total);
    const planned=new Map([...plan.roads,...plan.accessRoads].map(r=>[r.key,r]));
    const streets=[...planned.keys()].map(key=>network.roads.get(key)!);
    const nodeKeys=new Set(streets.flatMap(road=>road.nodes.map(n=>n.key)));
    const junctions=[...network.junctions.values()].filter(n=>nodeKeys.has(n.key));
    return {plan,resident,score,streets,junctions,form:buildingForm(resident,score.total)};
  });
}
export type PlotPreview=ReturnType<typeof upcomingPlotPreviews>[number];
