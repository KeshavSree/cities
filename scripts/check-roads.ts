import assert from 'node:assert/strict';
import { plotPlan } from '../shared/plots';
import { plannedStreet, junctionStreets, junctionLayout, plotStreets } from '../shared/streets';
import { buildingForm, outlineArea } from '../src/buildingForm';
import { streetNetwork, lotPolygon, neighborhoodScores } from '../src/neighborhood';
import { upcomingPlotPreviews } from '../src/plotPreview';
import type { Building } from '../shared/types';
const resident=(x:number,z:number,level=1):Building=>({id:`${x},${z}`,username:'sample',name:'Sample',bio:'',avatar:null,github_url:null,website:null,school:null,is_demo:1,x,z,level,xp:0,bricks:35,segments:'[]',likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,synced_at:null,updated_at:''});
const inside=(point:{x:number;z:number},polygon:{x:number;z:number}[])=>polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b.x-a.x)*(point.z-a.z)-(b.z-a.z)*(point.x-a.x)>=-1e-5;});
const patterns=new Set<string>();let plots=0;
for(let x=-12;x<=12;x++)for(let z=-12;z<=6;z++){
  const plan=plotPlan(x,z);plots++;
  assert(plan.corners.length>=4&&outlineArea(plan.corners)>3,`Degenerate plot ${x},${z}`);
  assert(inside(plan.position,plan.corners),`Center outside ${x},${z}`);
  assert(plan.corners.every((a,i)=>{const b=plan.corners[(i+1)%plan.corners.length],c=plan.corners[(i+2)%plan.corners.length];return (b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x)>=-1e-5;}),`Nonconvex plot ${x},${z}`);
  assert(plan.roads.some(r=>r.key===plan.frontage.key));
  const [a,b]=plan.frontage.points,dx=b.x-a.x,dz=b.z-a.z;
  assert(Math.abs(Math.sin(plan.rotation)*dx+Math.cos(plan.rotation)*dz)<1e-5,'Entrance not perpendicular to street');
  for(const level of [1,4,7,10,13,16,19,22,25,28,30]){
    const form=buildingForm(resident(x,z,level),.6);
    assert(form.footprint.w>.1&&form.footprint.d>.1,`Invalid footprint ${x},${z} L${level}: ${JSON.stringify(form.footprint)}`);
    assert(form.sections.every(s=>s.outline.length>=3&&outlineArea(s.outline)>.1&&s.outline.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))));
    assert(form.sections.every(s=>s.supportRatio>=.84999));
  }
  for(const [nx,nz] of [[x,z],[x+1,z],[x+1,z+1],[x,z+1]]){
    const kind=junctionLayout(nx,nz);patterns.add(kind);
    if(kind==='crossroads')continue;
    const arms=[plannedStreet(nx,nz,true),plannedStreet(nx-1,nz,true),plannedStreet(nx,nz,false),plannedStreet(nx,nz-1,false)].filter(r=>r!==null);
    if(kind==='t-junction')assert.equal(arms.length,3);
    if(kind==='cul-de-sac')assert.equal(arms.length,1);
    if(kind==='y-junction'){
      const roads=[...arms,...junctionStreets(nx,nz)],degrees=new Map<string,number>();
      for(const road of roads)for(const node of road.nodes)degrees.set(node.key,(degrees.get(node.key)||0)+1);
      const halves=junctionStreets(nx,nz)[0].nodes;
      halves.forEach(n=>assert.equal(degrees.get(n.key),3));
    }
  }
  const world=streetNetwork([resident(x,z)],()=>.6);
  assert(world.roads.has(plan.frontage.key));
  for(const road of world.roads.values())if(/^[hv]:/.test(road.key))assert(plannedStreet(road.x,road.z,road.horizontal),`A built road restored a missing arm: ${road.key}`);
  assert(outlineArea(lotPolygon(resident(x,z),world.roads))>.5,`Lot removed ${x},${z}`);
}
assert(patterns.has('t-junction')&&patterns.has('y-junction')&&patterns.has('cul-de-sac'));
const existing=[resident(0,0,28),resident(1,0,14),resident(-1,0,10),resident(0,-2,7),resident(-1,2,4)];
for(const preview of upcomingPlotPreviews(existing,existing[0],[{x:0,z:2},{x:0,z:-3},{x:1,z:2}])){
  const scores=neighborhoodScores([...existing,preview.resident]);
  const actual=streetNetwork([...existing,preview.resident],(x,z)=>scores(x,z).total);
  for(const street of preview.streets)assert.deepEqual(street,actual.roads.get(street.key),'Preview changed on construction');
}
const dense=streetNetwork(Array.from({length:25},(_,i)=>resident(i%5-2,Math.floor(i/5)-1,30)),()=>1);
const interior='node:0,1';
assert.equal([...dense.roads.values()].filter(r=>r.nodes.some(n=>n.key===interior)).length,3,'Dense interior T became a crossroads');
// Plans are independent of activation order and surrounding occupancy.
assert.deepEqual(plotStreets(0,0),plotPlan(0,0).roads);
console.log(`Road planning checks passed for ${plots} parcels and all three junction types.`);
