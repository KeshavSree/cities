import type { Building } from '../shared/types';
import { plotPlan } from '../shared/plots';
import { neighborhoodScores } from './neighborhood';
import { buildingForm } from './buildingForm';

/** Each preview simulates one join, rather than treating all empty slots as occupied. */
export function upcomingPlotPreviews(buildings:Building[],inviter:Building,available:{x:number;z:number}[]){
  const occupied=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const slots=available.filter(p=>!occupied.has(`${p.x},${p.z}`)).map(p=>plotPlan(p.x,p.z));
  const currentDegree=neighborhoodScores(buildings)(inviter.x,inviter.z).connectionDegree;
  const parent={...inviter,connection_degree:currentDegree+1};
  return slots.map(plan=>{
    const resident:Building={...inviter,id:`preview:${plan.x},${plan.z}`,name:'Next resident',username:'preview',
      x:plan.x,z:plan.z,level:1,resources:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,
      invited_by:inviter.id,connection_degree:1};
    const hypothetical=[...buildings.map(b=>b.id===inviter.id?parent:b),resident];
    const score=neighborhoodScores(hypothetical)(plan.x,plan.z);
    return {plan,resident,score,form:buildingForm(resident,score.total)};
  });
}
export type PlotPreview=ReturnType<typeof upcomingPlotPreviews>[number];
