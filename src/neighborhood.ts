import type { Building } from '../shared/types';
import { plotPosition } from '../shared/world';

/** Count occupied plots with nearby people contributing more than distant people. */
export function neighborhoodDensity(buildings:Building[]) {
  const occupied=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const cache=new Map<string,number>();
  const kernel:{x:number;z:number;weight:number}[]=[];
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)kernel.push({x,z,weight:Math.exp(-(x*x+z*z)/3.2)});
  const total=kernel.reduce((sum,k)=>sum+k.weight,0);
  return (x:number,z:number)=>{
    const key=`${x},${z}`;
    if(cache.has(key))return cache.get(key)!;
    const density=kernel.reduce((sum,k)=>sum+(occupied.has(`${x+k.x},${z+k.z}`)?k.weight:0),0)/total;
    cache.set(key,density);return density;
  };
}
export const settlementType=(density:number)=>density>=.54?'urban':density>=.22?'suburban':'rural';

/** Straight streets connect shared corners at varied angles. */
export function streetPoints(x:number,z:number,horizontal:boolean) {
  const a=plotPosition(x-.5,z-.5);
  const b=horizontal?plotPosition(x+.5,z-.5):plotPosition(x-.5,z+.5);
  return [a,b];
}
