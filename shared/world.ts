/** Shared world coordinates keep the rendered coast and plot allocation in agreement. */
export const PLOT_SPACING = 7;
// Covers the ground footprint at the supported zoom/orbit range, including nearby offscreen plots.
export const VIEW_RADIUS = 64;
export const COAST_SAMPLE_STEP = PLOT_SPACING;

export function worldHash(x:number,z:number) {
  const value=Math.sin(x*127.1+z*311.7)*43758.5453;
  return value-Math.floor(value);
}

// Independent square-grid seeds. The established grid stays at zero degrees;
// each seed defines a square grid at +/-30 degrees. Only their interface bends.
const GRID_REGION_SPAN=18,GRID_CORE_RADIUS=3.25,GRID_INTERFACE_RADIUS=6.75;
const modulo=(n:number,d:number)=>(n%d+d)%d;
export function streetGrid(x:number,z:number){
  const rz=Math.floor((z+3.5+GRID_REGION_SPAN/2)/GRID_REGION_SPAN);
  const stagger=modulo(rz,2)*5;
  const rx=Math.floor((x-6.5-stagger+GRID_REGION_SPAN/2)/GRID_REGION_SPAN);
  const center={x:rx*GRID_REGION_SPAN+6.5+stagger,z:rz*GRID_REGION_SPAN-3.5};
  const radius=Math.hypot(x-center.x,z-center.z);
  const t=Math.max(0,Math.min(1,(GRID_INTERFACE_RADIUS-radius)/(GRID_INTERFACE_RADIUS-GRID_CORE_RADIUS)));
  const blend=t*t*(3-2*t);
  const heading=(modulo(rx+rz,2)?-1:1)*Math.PI/6;
  return {key:`${rx},${rz}`,center,radius,angle:heading*blend,heading,
    interface:radius>GRID_CORE_RADIUS&&radius<GRID_INTERFACE_RADIUS};
}
const rotate=(x:number,z:number,angle:number)=>({x:x*Math.cos(angle)-z*Math.sin(angle),z:x*Math.sin(angle)+z*Math.cos(angle)});

/** Stable irregular coordinates: adding residents never shifts an existing tower. */
export function plotPosition(x:number,z:number) {
  const grid=streetGrid(x,z),point=rotate(x-grid.center.x,z-grid.center.z,grid.angle);
  return {
    x:(grid.center.x+point.x)*PLOT_SPACING,
    z:(grid.center.z+point.z)*PLOT_SPACING,
  };
}

/** The interface preserves radius around its grid seed, so its inverse is exact.
 * Use it for camera paging rather than assuming all streets have the root angle.
 */
export function plotCoordinates(worldX:number,worldZ:number){
  const x=worldX/PLOT_SPACING,z=worldZ/PLOT_SPACING,grid=streetGrid(x,z);
  const point=rotate(x-grid.center.x,z-grid.center.z,-grid.angle);
  return {x:grid.center.x+point.x,z:grid.center.z+point.z};
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
