import type { Building } from '../shared/types';
import { segmentDesigns, tierForLevel, tierIndex } from '../shared/progression';

/** The tower and its ground follow its own level; road density is independent. */
export function buildingForm(building:Building,_roadScore?:number){
  const tier=tierIndex(building.level),step=(building.level-1)%4,definition=tierForLevel(building.level);
  const height=[1.15,2.35,4.3,7,10.2][tier]+step*[.16,.24,.35,.45,.55][tier];
  const footprint=[{w:3.2,d:2.7},{w:3.15,d:2.8},{w:3.45,d:3.05},{w:3.2,d:2.95},{w:2.85,d:2.85}][tier];
  const foundationHeight=[.09,.13,.19,.25,.34][tier],baseY=.085+foundationHeight;
  const roofHeight=tier===0||tier===1?1.12:building.style==='spire'?2.26:building.style==='terrace'?.9:.66;
  return {kind:definition.kind,tier,definition,height,footprint,foundationHeight,baseY,topY:baseY+height+roofHeight,segments:segmentDesigns(building)};
}
