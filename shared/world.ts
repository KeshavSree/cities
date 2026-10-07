/** Shared world coordinates keep the rendered coast and plot allocation in agreement. */
export const PLOT_SPACING = 7;
// Covers the ground footprint at the supported zoom/orbit range, including nearby offscreen plots.
export const VIEW_RADIUS = 64;
export const COAST_SAMPLE_STEP = PLOT_SPACING;

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
  const worldX = x * PLOT_SPACING;
  const front = z * PLOT_SPACING + PLOT_SPACING / 2 + 0.6;
  const left = worldX - PLOT_SPACING / 2 - 0.6;
  const right = worldX + PLOT_SPACING / 2 + 0.6;
  const shore = Math.min(coastZ(left), coastZ(worldX), coastZ(right));
  return front <= shore - 2.5;
}
