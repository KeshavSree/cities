import assert from 'node:assert/strict';
import { plotCoordinates, plotPosition, streetGrid, PLOT_SPACING } from '../shared/world';
import { boundaryStreet, junctionLayout } from '../shared/streets';

const near=(actual:number,expected:number,label:string)=>assert(Math.abs(actual-expected)<1e-8,`${label}: ${actual} instead of ${expected}`);
let squareBlocks=0,transitionBlocks=0;
for(let x=-40;x<=40;x++)for(let z=-40;z<=40;z++){
  const point=plotPosition(x,z),inverse=plotCoordinates(point.x,point.z);
  near(inverse.x,x,'Viewport inverse x');near(inverse.z,z,'Viewport inverse z');
  const corners=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]];
  const grids=corners.map(([nx,nz])=>streetGrid(nx-.5,nz-.5));
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
for(const distance of [100,1000,10000]){
  const x=distance,z=-Math.round(distance*.75),a=plotPosition(x,z),east=plotPosition(x+1,z),south=plotPosition(x,z+1);
  assert.equal(streetGrid(x,z).key,'outgoing-grid');
  near(Math.hypot(east.x-a.x,east.z-a.z),7,'Distant east spacing');
  near(Math.hypot(south.x-a.x,south.z-a.z),7,'Distant south spacing');
  near(Math.atan2(east.z-a.z,east.x-a.x)*180/Math.PI,30,'Distant fixed heading');
  near((east.x-a.x)*(south.x-a.x)+(east.z-a.z)*(south.z-a.z),0,'Distant right angle');
}
console.log(`Verified ${squareBlocks} outgoing square blocks: 7-unit sides, 90-degree corners, 30-degree heading. Heading also holds at 100, 1,000 and 10,000 plots. ${transitionBlocks} boundary/fan blocks are deliberately excluded from the square-block guarantee.`);
