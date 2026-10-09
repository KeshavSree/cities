import { coastZ } from './world';
import { isReservedPlot } from './projects';
import { plannedStreet, junctionStreets, type PlannedStreet } from './streets';

const adjacency=new Map<string,PlannedStreet[]>();
/** Walk actual node keys, including both halves of a triangular fork and
 * every cul-de-sac facet. Missing T arms never become routing shortcuts.
 */
function links(key:string){
  const cached=adjacency.get(key);if(cached)return cached;
  const [x,z]=key.split(':')[1].split(',').map(Number);
  const candidates=[plannedStreet(x,z,true),plannedStreet(x-1,z,true),plannedStreet(x,z,false),plannedStreet(x,z-1,false),...junctionStreets(x,z)];
  const roads=candidates.filter((road):road is PlannedStreet=>{
    if(!road||!road.nodes.some(n=>n.key===key))return false;
    // Public sites reserve their interior; their bordering streets are legal.
    if(/^[hv]:/.test(road.key)&&isReservedPlot(road.x,road.z)&&isReservedPlot(road.x-(road.horizontal?0:1),road.z-(road.horizontal?1:0)))return false;
    const [a,b]=road.points;
    return [0,.25,.5,.75,1].every(t=>{const px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t;return pz<=coastZ(px)-1;});
  });
  if(adjacency.size>=4096)adjacency.delete(adjacency.keys().next().value!);
  adjacency.set(key,roads);return roads;
}

interface Step{depth:number;parent:string|null;road:PlannedStreet|null;}
interface Approach{seen:Map<string,Step>;queue:string[];cursor:number;}
const approaches=new Map<string,Approach>();
/** Precompute a bounded expansion from the existing plot's street nodes once.
 * Every candidate reuses this tree, before occupancy or rendering is involved.
 */
export function plannedApproach(existing:PlannedStreet[],frontage:PlannedStreet,maxSteps=32){
  const sources=[...new Set(existing.flatMap(r=>r.nodes.map(n=>n.key)))].sort(),cacheKey=`${maxSteps}:${sources.join('|')}`;
  let approach=approaches.get(cacheKey);
  if(!approach){
    approach={queue:[...sources],cursor:0,seen:new Map<string,Step>(sources.map(key=>[key,{depth:0,parent:null,road:null}]))};
    if(approaches.size>=16)approaches.delete(approaches.keys().next().value!);
    approaches.set(cacheKey,approach);
  }
  const {seen,queue}=approach,targets=frontage.nodes.map(n=>n.key);
  // Expand only as far as the next requested candidate; retain the frontier
  // for later slots so preview generation does not scan the entire region.
  while(approach.cursor<queue.length){
    const depth=Math.min(...targets.map(key=>seen.get(key)?.depth??Infinity));
    // Finish the preceding layer so equal-length endpoint ties resolve the
    // same way regardless of which other candidate was requested first.
    if(seen.get(queue[approach.cursor])!.depth>=depth)break;
    const key=queue[approach.cursor++],step=seen.get(key)!;if(step.depth>=maxSteps)continue;
    for(const road of links(key)){
      const next=road.nodes.find(n=>n.key!==key)!.key;if(seen.has(next))continue;
      seen.set(next,{depth:step.depth+1,parent:key,road});queue.push(next);
    }
  }
  const target=frontage.nodes.map(n=>n.key).filter(key=>seen.has(key))
    .sort((a,b)=>seen.get(a)!.depth-seen.get(b)!.depth||a.localeCompare(b))[0];
  if(!target)return null;
  const path:PlannedStreet[]=[];
  for(let cursor=target;seen.get(cursor)!.parent;){const entry=seen.get(cursor)!;path.push(entry.road!);cursor=entry.parent!;}
  return path.reverse();
}
