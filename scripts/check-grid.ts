import assert from 'node:assert/strict';
import { plotCoordinates, plotPosition, streetGrid, PLOT_SPACING, GRID_TRANSITION_END } from '../shared/world';
import { boundaryStreet, junctionLayout, plannedStreet, junctionStreets, type PlannedStreet } from '../shared/streets';
import { availablePlotPlans, previewPlotPlans, plotPlan } from '../shared/plots';
import { connectStreetPlans } from '../shared/streetRoutes';
import { streetNetwork, neighborhoodScores } from '../src/neighborhood';
import { upcomingPlotPreviews } from '../src/plotPreview';
import type { Building } from '../shared/types';

const near=(actual:number,expected:number,label:string)=>assert(Math.abs(actual-expected)<1e-8,`${label}: ${actual} instead of ${expected}`);
let squareBlocks=0,transitionBlocks=0;
for(let x=-40;x<=40;x++)for(let z=-40;z<=40;z++){
  const point=plotPosition(x,z),inverse=plotCoordinates(point.x,point.z);
  near(inverse.x,x,'Viewport inverse x');near(inverse.z,z,'Viewport inverse z');
  const corners=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]];
  const grids=corners.map(([nx,nz])=>streetGrid(nx-.5,nz-.5));
  if(Math.max(Math.abs(x),Math.abs(z))>=7)assert(grids.every(g=>g.key==='outgoing-grid'),`Transition persisted beyond its endpoint at ${x},${z}`);
  if(grids.some(g=>g.interface)){transitionBlocks++;continue;}
  if(!grids.every(g=>g.key==='outgoing-grid'))continue;
  // Forks deliberately change local corners. Check the ordinary lattice blocks.
  if(corners.some(([nx,nz])=>junctionLayout(nx,nz)==='y-junction'))continue;
  const roads=[boundaryStreet(x,z,true),boundaryStreet(x+1,z,false),boundaryStreet(x,z+1,true),boundaryStreet(x,z,false)];
  const vectors=roads.map(r=>({x:r.points[1].x-r.points[0].x,z:r.points[1].z-r.points[0].z}));
  vectors.forEach(v=>near(Math.hypot(v.x,v.z),PLOT_SPACING,`Side length at ${x},${z}`));
  near(vectors[0].x*vectors[1].x+vectors[0].z*vectors[1].z,0,`Right angle at ${x},${z}`);
  near(Math.atan2(vectors[0].z,vectors[0].x)*180/Math.PI,30,`Grid heading at ${x},${z}`);
  squareBlocks++;
}
assert(squareBlocks>1000,'Insufficient coverage of the outgoing grid');
assert(transitionBlocks<200,'Transition grew into an unbounded wedge');
// Every bearing must finish the transition, including the former infinite fans.
for(const distance of [10,100,1000,10000])for(let bearing=0;bearing<360;bearing+=5){
  const x=Math.round(distance*Math.cos(bearing*Math.PI/180)),z=Math.round(distance*Math.sin(bearing*Math.PI/180)),a=plotPosition(x,z),east=plotPosition(x+1,z),south=plotPosition(x,z+1);
  assert.equal(streetGrid(x,z).key,'outgoing-grid');
  near(Math.hypot(east.x-a.x,east.z-a.z),7,'Distant east spacing');
  near(Math.hypot(south.x-a.x,south.z-a.z),7,'Distant south spacing');
  near(Math.atan2(east.z-a.z,east.x-a.x)*180/Math.PI,30,'Distant fixed heading');
  near((east.x-a.x)*(south.x-a.x)+(east.z-a.z)*(south.z-a.z),0,'Distant right angle');
}
const origin={x:0,z:0},taken=new Set(['0,0']),previews=previewPlotPlans(origin,taken);
assert.equal(previews.length,48);assert.equal(new Set(previews.map(p=>`${p.x},${p.z}`)).size,48);
assert.deepEqual(previews[0],availablePlotPlans(origin,taken)[0],'Preview changed the next invite allocation');
assert(previews.filter(p=>[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].every(([dx,dz])=>streetGrid(p.x+dx,p.z+dz).key==='outgoing-grid')).length>=16,'Previews do not expose the complete new grid');
const previewKeys=new Set(previews.filter(p=>[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].every(([dx,dz])=>streetGrid(p.x+dx,p.z+dz).key==='outgoing-grid')).map(p=>`${p.x},${p.z}`));
assert(previews.some(p=>Array.from({length:16},(_,i)=>`${p.x+i%4},${p.z+Math.floor(i/4)}`).every(key=>previewKeys.has(key))),'No coherent 4×4 square-grid preview');
const reachable=(roads:Iterable<PlannedStreet>,start:string)=>{
  const edges=new Map<string,string[]>();
  for(const road of roads){const [a,b]=road.nodes;for(const [from,to] of [[a.key,b.key],[b.key,a.key]])edges.set(from,[...(edges.get(from)||[]),to]);}
  const seen=new Set([start]),queue=[start];
  for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i])||[])if(!seen.has(next)){seen.add(next);queue.push(next);}
  return seen;
};
const original=plotPlan(0,0),previewRoads=connectStreetPlans([original,...previews].flatMap(p=>p.roads));
const connected=reachable(previewRoads.values(),original.roads[0].nodes[0].key);
for(const plan of previews)assert(connected.has(plan.roads.find(r=>r.key===plan.frontage.key)!.nodes[0].key),`Disconnected future plot ${plan.x},${plan.z}`);
for(const road of previewRoads.values()){
  const legal=/^[hv]:/.test(road.key)?plannedStreet(road.x,road.z,road.horizontal):junctionStreets(road.x,road.z).find(r=>r.key===road.key);
  assert(legal,`Connection restored a missing arm: ${road.key}`);assert.deepEqual(road.points,legal.points,'Connection changed planned geometry');
}
const resident:Building={id:'origin',username:'sample',name:'Sample',bio:'',avatar:null,github_url:null,website:null,school:null,is_demo:1,x:0,z:0,level:1,xp:0,bricks:35,segments:null,likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,synced_at:null,updated_at:''};
for(const preview of upcomingPlotPreviews([resident],resident,previews)){
  const hypothetical=[resident,preview.resident],scores=neighborhoodScores(hypothetical),actual=streetNetwork(hypothetical,(x,z)=>scores(x,z).total);
  const seen=reachable(actual.roads.values(),original.roads[0].nodes[0].key);
  assert(seen.has(preview.plan.roads.find(r=>r.key===preview.plan.frontage.key)!.nodes[0].key),`Built plot disconnected from old area: ${preview.plan.x},${preview.plan.z}`);
  for(const road of preview.streets)assert.deepEqual(road,actual.roads.get(road.key),'Preview approach differs from construction');
  const shown=reachable([...streetNetwork([resident],()=>0).roads.values(),...preview.streets],original.roads[0].nodes[0].key);
  assert(shown.has(preview.plan.roads.find(r=>r.key===preview.plan.frontage.key)!.nodes[0].key),'Blue preview hides its approach');
}
console.log('All 48 future plots connect to the original area through legal streets; individual preview approaches match construction.');
console.log(`Verified ${squareBlocks} outgoing square blocks: 7-unit sides, 90-degree corners, 30-degree heading. All 72 bearings finish the transition and remain square at 10, 100, 1,000 and 10,000 plots. ${transitionBlocks} transition blocks are confined within ±${GRID_TRANSITION_END} plots. Preview selection includes at least 16 complete outgoing blocks.`);
