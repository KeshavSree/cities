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

function route(sources:Set<string>,targets:Set<string>,maxSteps:number){
  const queue=[...sources].sort(),seen=new Map(queue.map(key=>[key,{depth:0,parent:null as string|null,road:null as PlannedStreet|null}]));
  for(let i=0;i<queue.length;i++){
    const key=queue[i],step=seen.get(key)!;
    if(targets.has(key)){
      const path:PlannedStreet[]=[];
      for(let cursor=key;seen.get(cursor)!.parent;){const entry=seen.get(cursor)!;path.push(entry.road!);cursor=entry.parent!;}
      return path.reverse();
    }
    if(step.depth>=maxSteps)continue;
    for(const road of links(key)){
      const next=road.nodes.find(n=>n.key!==key)!.key;if(seen.has(next))continue;
      seen.set(next,{depth:step.depth+1,parent:key,road});queue.push(next);
    }
  }
  return [];
}

/** Activate short planned approaches between occupied road components. This
 * connects growth across the transition without paving the unused grid.
 */
export function connectStreetPlans(plans:Iterable<PlannedStreet>,maxSteps=32){
  const roads=new Map([...plans].map(road=>[road.key,road])),neighbors=new Map<string,Set<string>>();
  const add=(road:PlannedStreet)=>{
    roads.set(road.key,road);
    const [a,b]=road.nodes;
    for(const [from,to] of [[a.key,b.key],[b.key,a.key]]){if(!neighbors.has(from))neighbors.set(from,new Set());neighbors.get(from)!.add(to);}
  };
  roads.forEach(add);
  const component=(start:string)=>{
    const found=new Set([start]),queue=[start];
    for(let i=0;i<queue.length;i++)for(const key of neighbors.get(queue[i])||[])if(!found.has(key)){found.add(key);queue.push(key);}
    return found;
  };
  const visited=new Set<string>(),components:Set<string>[]=[];
  for(const key of [...neighbors.keys()].sort())if(!visited.has(key)){
    const nodes=component(key);nodes.forEach(n=>visited.add(n));components.push(nodes);
  }
  components.sort((a,b)=>b.size-a.size);
  if(!components.length)return roads;
  const anchor=components[0].values().next().value!;let connected=components[0];
  for(const nodes of components.slice(1)){
    if([...nodes].some(n=>connected.has(n)))continue;
    route(nodes,connected,maxSteps).forEach(add);
    connected=component(anchor);
  }
  return roads;
}
