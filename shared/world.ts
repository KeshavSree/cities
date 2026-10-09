/** Shared world coordinates keep the rendered coast and plot allocation in agreement. */
export const PLOT_SPACING = 7;
// Covers the ground footprint at the supported zoom/orbit range, including nearby offscreen plots.
export const VIEW_RADIUS = 64;
export const COAST_SAMPLE_STEP = PLOT_SPACING;

export function worldHash(x:number,z:number) {
  const value=Math.sin(x*127.1+z*311.7)*43758.5453;
  return value-Math.floor(value);
}

// A finite square annulus connects the two lattices. Outside its outer edge,
// every direction is the same rigidly rotated square grid, forever.
export const GRID_TRANSITION_START=3.5,GRID_TRANSITION_END=6.5;
export const GRID_FORK={x:5,z:-3};
const NEW_GRID_ANGLE=Math.PI/6;
type Point={x:number;z:number};
type Matrix={a:number;b:number;c:number;d:number};
type Transform={matrix:Matrix;offset:Point};
const IDENTITY:Matrix={a:1,b:0,c:0,d:1};
const ROTATED:Matrix={a:Math.cos(NEW_GRID_ANGLE),b:-Math.sin(NEW_GRID_ANGLE),c:Math.sin(NEW_GRID_ANGLE),d:Math.cos(NEW_GRID_ANGLE)};
const apply=(m:Matrix,p:Point):Point=>({x:m.a*p.x+m.b*p.z,z:m.c*p.x+m.d*p.z});
const inverse=(m:Matrix):Matrix=>{const det=m.a*m.d-m.b*m.c;return {a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det};};
const span=(p:Point)=>Math.max(Math.abs(p.x),Math.abs(p.z));
const transform=(t:Transform,p:Point)=>{const q=apply(t.matrix,p);return {x:q.x+t.offset.x,z:q.z+t.offset.z};};
const untransform=(t:Transform,p:Point)=>apply(inverse(t.matrix),{x:p.x-t.offset.x,z:p.z-t.offset.z});
const root:Transform={matrix:IDENTITY,offset:{x:0,z:0}};
const outgoing:Transform={matrix:ROTATED,offset:{x:0,z:0}};
function affine(source:Point[],target:Point[]):Transform{
  const basis=inverse({a:source[1].x-source[0].x,b:source[2].x-source[0].x,c:source[1].z-source[0].z,d:source[2].z-source[0].z});
  const a={x:target[1].x-target[0].x,z:target[1].z-target[0].z},b={x:target[2].x-target[0].x,z:target[2].z-target[0].z};
  const matrix={a:a.x*basis.a+b.x*basis.c,b:a.x*basis.b+b.x*basis.d,c:a.z*basis.a+b.z*basis.c,d:a.z*basis.b+b.z*basis.d};
  const origin=apply(matrix,source[0]);
  return {matrix,offset:{x:target[0].x-origin.x,z:target[0].z-origin.z}};
}
function inTriangle(p:Point,triangle:Point[]){
  const side=(a:Point,b:Point)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const values=triangle.map((a,i)=>side(a,triangle[(i+1)%3]));
  return values.every(v=>v>=-1e-9)||values.every(v=>v<=1e-9);
}
const square=(r:number)=>[[-r,-r],[r,-r],[r,r],[-r,r]].map(([x,z])=>({x,z}));
const inner=square(GRID_TRANSITION_START),outer=square(GRID_TRANSITION_END);
/** Eight finite triangles form the connecting ring. Each mapping preserves
 * straight lines. The diagonal uses the preceding outer corner so no triangle
 * folds over when the outer square rotates 30 degrees.
 */
const patches=inner.flatMap((a,i)=>{
  const j=(i+1)%4;
  return [[a,inner[j],outer[i]],[inner[j],outer[j],outer[i]]].map(source=>{
    const target=source.map(p=>span(p)<=GRID_TRANSITION_START?p:apply(ROTATED,p));
    return {source,target,transform:affine(source,target)};
  });
});
export function streetGrid(x:number,z:number){
  const point={x,z},extent=span(point),transition=extent>GRID_TRANSITION_START&&extent<GRID_TRANSITION_END;
  const mapping=extent<=GRID_TRANSITION_START?root:extent>=GRID_TRANSITION_END?outgoing:patches.find(p=>inTriangle(point,p.source))!.transform;
  return {key:transition?'grid-seam':mapping===outgoing?'outgoing-grid':'original-grid',center:{x:0,z:0},
    angle:mapping===outgoing?NEW_GRID_ANGLE:0,heading:NEW_GRID_ANGLE,interface:transition,...mapping};
}

/** Stable coordinates shared by server placement, buildings and road previews. */
export function plotPosition(x:number,z:number) {
  const point=transform(streetGrid(x,z),{x,z});
  return {x:point.x*PLOT_SPACING,z:point.z*PLOT_SPACING};
}

/** The original square, finite connecting triangles and rotated exterior form
 * a complete planar partition. Camera paging uses the matching exact inverse.
 */
export function plotCoordinates(worldX:number,worldZ:number){
  const point={x:worldX/PLOT_SPACING,z:worldZ/PLOT_SPACING};
  if(span(point)<=GRID_TRANSITION_START)return point;
  const rotated=untransform(outgoing,point);
  if(span(rotated)>=GRID_TRANSITION_END)return rotated;
  const patch=patches.find(p=>inTriangle(point,p.target));
  if(!patch)throw new Error('Point outside the finite grid partition');
  return untransform(patch.transform,point);
}

/** A fixed, gently winding coast extending along the whole world x-axis. */
function coastAnchor(x: number): number {
  return 30 + Math.sin(x / 29) * 8 + Math.sin(x / 12 + 0.6) * 4;
}

/** Join globally anchored samples with lines, matching the low-poly shoreline exactly. */
export function coastZ(x: number): number {
  const left = Math.floor(x / COAST_SAMPLE_STEP) * COAST_SAMPLE_STEP;
  const fraction = (x - left) / COAST_SAMPLE_STEP;
  return coastAnchor(left) * (1 - fraction) + coastAnchor(left + COAST_SAMPLE_STEP) * fraction;
}

/** Leave room for the whole plot, bordering roads, and a strip of beach. */
export function isLandPlot(x: number, z: number): boolean {
  // Sample the transformed perimeter, including space for split junctions,
  // shoulders and beach. Axis-aligned bounds miss the newly angled blocks.
  for(let edge=0;edge<4;edge++)for(let step=0;step<=4;step++){
    const t=step/4,dx=edge===0?t-.5:edge===1?.5:edge===2?.5-t:-.5;
    const dz=edge===0?-.5:edge===1?t-.5:edge===2?.5:.5-t;
    const p=plotPosition(x+dx,z+dz);
    if(p.z+4.8>Math.min(coastZ(p.x-2),coastZ(p.x),coastZ(p.x+2)))return false;
  }
  return true;
}
