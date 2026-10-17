import assert from 'node:assert/strict';
import { canWalk, streetArrival, streetObstacles, buildingObstacles, pickStreetStart, streetStartChoices, walkStep, WALK_RADIUS } from '../src/streetNavigation';
import { streetNetwork, neighborhoodDensity } from '../src/neighborhood';
import { coastZ, isLandPlot } from '../shared/world';
import type { Building } from '../shared/types';

const resident=(x:number,z:number,level:number):Building=>({id:`${x},${z}`,username:'sample',name:'Sample',bio:'',avatar:null,github_url:null,website:null,school:null,is_demo:1,x,z,level,xp:0,bricks:0,segments:'[]',likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,synced_at:null,updated_at:''});
const square=[[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}]];
assert(!canWalk({x:0,z:0},square),'Cannot enter a foundation');
assert(!canWalk({x:1+WALK_RADIUS/2,z:0},square),'Keep body clear of wall');
assert(canWalk({x:1+WALK_RADIUS+.01,z:0},square),'Space beside wall remains walkable');
const stopped=walkStep({x:-2,z:0},5,0,square);
assert(stopped.x<=-1-WALK_RADIUS&&stopped.x>-1.2,'Fast steps cannot tunnel through a building');
const sliding=walkStep({x:-1.2,z:-.5},.8,.8,square);
assert(canWalk(sliding,square)&&sliding.z>.2,'Walk diagonally along a wall without getting stuck');
assert(!canWalk({x:0,z:coastZ(0)},[]),'Stop at the shoreline');

const sample=Array.from({length:25},(_,i)=>resident(i%5-2,Math.floor(i/5)-2,i%2?16:4));
const roads=streetNetwork(sample,neighborhoodDensity(sample)).roads,foundations=buildingObstacles(sample),obstacles=streetObstacles(sample);
assert.equal(obstacles.length,foundations.length,'Empty neighborhoods have only building collisions, with no free streetlights or furniture');
assert.equal(pickStreetStart({x:100000,z:-100000},roads.values(),obstacles),null,'Do not snap remote ground to a street');
assert.equal(pickStreetStart({x:0,z:coastZ(0)+2},roads.values(),obstacles),null,'Water cannot be a starting point');
let streetPicks=0;
for(const road of roads.values()){
  const [a,b]=road.points,point={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
  const start=pickStreetStart(point,roads.values(),obstacles);
  if(!canWalk(point,obstacles))continue;
  assert(start,'A clear street can be chosen');
  assert(Math.hypot(start.point.x-point.x,start.point.z-point.z)<.001,'Keep the start on the selected street');
  assert(canWalk(start.point,obstacles),'Chosen starts have body clearance');streetPicks++;
}
assert(streetPicks>10,'Cover multiple starting locations');

let arrivals=0;
for(let x=-12;x<=12;x++)for(let z=-12;z<=6;z++){
  if(!isLandPlot(x,z))continue;
  for(const level of [1,10,16,30]){
    const neighbors:Building[]=[];
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(isLandPlot(x+dx,z+dz))neighbors.push(resident(x+dx,z+dz,level));
    }
    const obstacles=streetObstacles(neighbors),arrival=streetArrival({x,z},obstacles);
    assert(arrival,`No safe road arrival at ${x},${z}, level ${level}`);
    assert(canWalk(arrival.point,obstacles),`Arrival inside a building at ${x},${z}`);
    assert(Number.isFinite(arrival.point.x)&&Number.isFinite(arrival.point.z),'Arrival must be finite');
    const end=walkStep(arrival.point,arrival.target.x-arrival.point.x,arrival.target.z-arrival.point.z,obstacles);
    assert(canWalk(end,obstacles),'Walking toward the entrance stops outside its foundation');
    arrivals++;
  }
}
console.log(`Street navigation checks passed: ${arrivals} safe arrivals, ${streetPicks} chosen starts, empty street defaults, wall sliding, tunneling, and shoreline collision.`);

const keyboardRoads=streetNetwork(sample,neighborhoodDensity(sample)).roads,keyboardObstacles=streetObstacles(sample),keyboardChoices=streetStartChoices({x:0,z:0},keyboardRoads.values(),keyboardObstacles);
assert(keyboardChoices.length>1,'Keyboard users can select among multiple actual streets');
assert.equal(new Set(keyboardChoices.map(choice=>choice.roadKey)).size,keyboardChoices.length,'Each road appears once');
let lastDistance=-1;
for(const choice of keyboardChoices){assert(keyboardRoads.has(choice.roadKey));assert(canWalk(choice.point,keyboardObstacles));assert.equal(pickStreetStart(choice.point,[keyboardRoads.get(choice.roadKey)!],keyboardObstacles)?.roadKey,choice.roadKey);const distance=Math.hypot(choice.point.x,choice.point.z);assert(distance>=lastDistance);lastDistance=distance;}
assert.equal(streetStartChoices({x:0,z:0},[],[]).length,0);
console.log(`Keyboard street choices passed: ${keyboardChoices.length} unique, clear roads ordered by distance.`);
