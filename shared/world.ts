/** Shared world coordinates keep the rendered coast and plot allocation in agreement. */
export const PLOT_SPACING = 7;
// Covers the ground footprint at the supported zoom/orbit range, including nearby offscreen plots.
export const VIEW_RADIUS = 64;
export const COAST_SAMPLE_STEP = PLOT_SPACING;

export function worldHash(x:number,z:number) {
  const value=Math.sin(x*127.1+z*311.7)*43758.5453;
  return value-Math.floor(value);
}

/** Stable irregular coordinates: adding residents never shifts an existing tower. */
export function plotPosition(x:number,z:number) {
  return {
    x:x*PLOT_SPACING+Math.sin(z*.73)*2.2+Math.sin(z*.19)*3+(worldHash(x,11)-.5)*.6,
    // Opposite frontage roads stay parallel. Side streets join them at varied angles.
    z:z*PLOT_SPACING,
  };
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
  const position=plotPosition(x,z);
  const worldX = position.x;
  const front = position.z + PLOT_SPACING / 2 + 1.2;
  const left = worldX - PLOT_SPACING / 2 - 1.2;
  const right = worldX + PLOT_SPACING / 2 + 1.2;
  const shore = Math.min(coastZ(left), coastZ(worldX), coastZ(right));
  return front <= shore - 2.5;
}
