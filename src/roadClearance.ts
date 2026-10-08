import type { Building } from '../shared/types';
import { plotPlan } from '../shared/plots';
import { buildingForm, insetPlotPolygon, MODEL_SETBACKS } from './buildingForm';
import { tierIndex } from '../shared/progression';
import type { GroundPoint } from './neighborhood';

/** Skyscrapers and later models claim the road edge, leaving its center open. */
export function roadObstacles(buildings:Building[],densityAt:(x:number,z:number)=>number){
  return buildings.filter(b=>tierIndex(b.level)>=5).map(b=>{
    const plan=plotPlan(b.x,b.z),form=buildingForm(b,densityAt(b.x,b.z));
    return insetPlotPolygon(plan,MODEL_SETBACKS[form.tier]-form.foundationPadding-.025);
  });
}

function clip(polygon:GroundPoint[],a:GroundPoint,b:GroundPoint,inside:boolean){
  const distance=(p:GroundPoint)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const result:GroundPoint[]=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=distance(p),dq=distance(q),keepP=inside?dp>=0:dp<=0,keepQ=inside?dq>=0:dq<=0;
    if(keepP)result.push(p);
    if(keepP!==keepQ){const t=dp/(dp-dq);result.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
  }
  return result;
}
const bounds=(p:GroundPoint[])=>({minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z))});

/** Subtract convex podiums from street polygons, retaining straight edges. */
export function clearRoadSurface(polygon:GroundPoint[],obstacles:GroundPoint[][]){
  let pieces=[polygon];
  for(const obstacle of obstacles){
    const box=bounds(obstacle),next:GroundPoint[][]=[];
    for(const piece of pieces){
      const extent=bounds(piece);
      if(extent.maxX<=box.minX||extent.minX>=box.maxX||extent.maxZ<=box.minZ||extent.minZ>=box.maxZ){next.push(piece);continue;}
      let remainder=piece;
      for(let i=0;i<obstacle.length&&remainder.length>=3;i++){
        const a=obstacle[i],b=obstacle[(i+1)%obstacle.length],outside=clip(remainder,a,b,false);
        if(outside.length>=3)next.push(outside);
        remainder=clip(remainder,a,b,true);
      }
    }
    pieces=next;
  }
  return pieces;
}

export function inRoadObstacle(point:GroundPoint,obstacles:GroundPoint[][],margin=0){
  return obstacles.some(p=>p.every((a,i)=>{
    const b=p[(i+1)%p.length];
    return (b.x-a.x)*(point.z-a.z)-(b.z-a.z)*(point.x-a.x)>=-margin*Math.hypot(b.x-a.x,b.z-a.z);
  }));
}
