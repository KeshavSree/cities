import type { Building } from '../shared/types';
import { plotPlan } from '../shared/plots';
import { neighborhoodScores } from './neighborhood';
import { buildingForm } from './buildingForm';
import { TIERS } from '../shared/progression';

/** Each preview simulates one join, rather than treating all empty slots as occupied. */
export function upcomingPlotPreviews(buildings:Building[],inviter:Building,available:{x:number;z:number}[]){
  const occupied=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const slots=available.filter(p=>!occupied.has(`${p.x},${p.z}`)).map(p=>plotPlan(p.x,p.z));
  return slots.map(plan=>{
    const resident:Building={...inviter,id:`preview:${plan.x},${plan.z}`,name:'Next resident',username:'preview',
      x:plan.x,z:plan.z,level:1,xp:0,bricks:0,segments:JSON.stringify(Array(TIERS.length).fill(null)),likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,
      invited_by:inviter.id,invite_degree:1};
    const hypothetical=[...buildings,resident];
    const score=neighborhoodScores(hypothetical)(plan.x,plan.z);
    return {plan,resident,score,form:buildingForm(resident,score.total)};
  });
}
export type PlotPreview=ReturnType<typeof upcomingPlotPreviews>[number];
