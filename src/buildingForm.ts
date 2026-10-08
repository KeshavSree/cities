import type { Building } from '../shared/types';
import { SETTLEMENT_THRESHOLDS, settlementType } from './neighborhood';

/** Levels keep growing without a cap; settlement determines the building's scale. */
export function buildingForm(building:Building,score:number){
  const kind=settlementType(score),growth=Math.sqrt(building.level);
  const height=kind==='rural'?.95+growth*.25:kind==='suburban'?1.7+growth*.75:2.3+growth*1.65;
  const footprint=kind==='rural'?{w:3.2,d:2.7}:building.style==='terrace'?{w:3.35,d:3.1}:building.style==='modern'?{w:2.9,d:2.9}:{w:2.5,d:2.5};
  const urban=Math.min(1,score/SETTLEMENT_THRESHOLDS.urban);
  const foundationHeight=.09+urban*(building.style==='modern'?.13:building.style==='spire'?.11:.08);
  const baseY=.085+foundationHeight;
  const roofHeight=building.style==='spire'?(kind==='rural'?1.12:2.26):building.style==='terrace'?(kind==='rural'?.45:.9):(kind==='rural'?.28:.66);
  return {kind,height,footprint,foundationHeight,baseY,topY:baseY+height+roofHeight};
}
