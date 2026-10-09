/** Shared world coordinates keep the rendered coast and plot allocation in agreement. */
export const PLOT_SPACING = 7;
// Covers the ground footprint at the supported zoom/orbit range, including nearby offscreen plots.
export const VIEW_RADIUS = 64;
export const COAST_SAMPLE_STEP = PLOT_SPACING;

export function worldHash(x:number,z:number) {
  const value=Math.sin(x*127.1+z*311.7)*43758.5453;
  return value-Math.floor(value);
}

// The branch starts at a street corner. Both grids are rigid square lattices;
// the outgoing grid continues indefinitely instead of rotating back with distance.
export const GRID_FORK={x:2,z:2};
const GRID_ORIGIN={x:GRID_FORK.x-.5,z:GRID_FORK.z-.5};
const NEW_GRID_ANGLE=Math.PI/6;
type Matrix={a:number;b:number;c:number;d:number};
const IDENTITY:Matrix={a:1,b:0,c:0,d:1};
const ROTATED:Matrix={a:Math.cos(NEW_GRID_ANGLE),b:-Math.sin(NEW_GRID_ANGLE),c:Math.sin(NEW_GRID_ANGLE),d:Math.cos(NEW_GRID_ANGLE)};
const apply=(m:Matrix,x:number,z:number)=>({x:m.a*x+m.b*z,z:m.c*x+m.d*z});
const inverse=(m:Matrix):Matrix=>{const det=m.a*m.d-m.b*m.c;return {a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det};};
/** Join two rigid lattices with a linear triangular fan. Lines stay straight
 * inside each fan, and the two boundary rays match their neighboring grids.
 */
function fan(start:number,end:number,startRotation:number,endRotation:number):Matrix{
  const radians=(degrees:number)=>degrees*Math.PI/180;
  const basis={a:Math.cos(radians(start)),b:Math.cos(radians(end)),c:Math.sin(radians(start)),d:Math.sin(radians(end))};
  const target={a:Math.cos(radians(start+startRotation)),b:Math.cos(radians(end+endRotation)),c:Math.sin(radians(start+startRotation)),d:Math.sin(radians(end+endRotation))};
  const from=inverse(basis);
  return {a:target.a*from.a+target.b*from.c,b:target.a*from.b+target.b*from.d,c:target.c*from.a+target.d*from.c,d:target.c*from.b+target.d*from.d};
}
const UPPER_FAN=fan(60,105,30,0),LOWER_FAN=fan(-105,-60,0,30);
function gridMatrix(angle:number,world=false){
  if(angle>=(world?-30:-60)&&angle<=(world?90:60))return ROTATED;
  if(angle>=(world?90:60)&&angle<=105)return UPPER_FAN;
  if(angle>=-105&&angle<=(world?-30:-60))return LOWER_FAN;
  return IDENTITY;
}
export function streetGrid(x:number,z:number){
  const bearing=Math.atan2(z-GRID_ORIGIN.z,x-GRID_ORIGIN.x)*180/Math.PI;
  const matrix=gridMatrix(bearing),transition=matrix===UPPER_FAN||matrix===LOWER_FAN;
  const angle=matrix===ROTATED?NEW_GRID_ANGLE:0;
  return {key:transition?'grid-seam':angle?'outgoing-grid':'original-grid',center:GRID_ORIGIN,angle,heading:NEW_GRID_ANGLE,
    interface:transition,matrix};
}

/** Stable irregular coordinates: adding residents never shifts an existing tower. */
export function plotPosition(x:number,z:number) {
  const grid=streetGrid(x,z),point=apply(grid.matrix,x-grid.center.x,z-grid.center.z);
  return {
    x:(grid.center.x+point.x)*PLOT_SPACING,
    z:(grid.center.z+point.z)*PLOT_SPACING,
  };
}

/** Each grid/fan is linear and has a positive determinant. Invert the physical
 * sector for camera paging, including the full indefinitely continuing new grid.
 */
export function plotCoordinates(worldX:number,worldZ:number){
  const x=worldX/PLOT_SPACING-GRID_ORIGIN.x,z=worldZ/PLOT_SPACING-GRID_ORIGIN.z;
  const bearing=Math.atan2(z,x)*180/Math.PI;
  const point=apply(inverse(gridMatrix(bearing,true)),x,z);
  return {x:GRID_ORIGIN.x+point.x,z:GRID_ORIGIN.z+point.z};
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
