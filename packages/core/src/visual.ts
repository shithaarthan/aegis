// Optional visual-diff module for VERIFY (P4-T02): compares screenshots with a
// per-pixel threshold. Screenshots come from the target repo's Playwright setup;
// AEGIS only compares buffers it is given. Non-visual incidents are unaffected.
export interface VisualDiffResult {
  compared: boolean;
  pixelsChanged: number;
  changeRatio: number;
  regression: boolean;
  detail: string;
}

export function diffRgbaBuffers(
  a: Uint8Array,
  b: Uint8Array,
  opts: { width: number; height: number; thresholdPerPixel?: number; maxChangeRatio?: number } = { width: 0, height: 0 },
): VisualDiffResult {
  if (a.length !== b.length || a.length === 0) {
    return { compared: false, pixelsChanged: 0, changeRatio: 0, regression: false, detail: "buffers missing or size-mismatched — skipped, non-blocking" };
  }
  const perPixel = opts.thresholdPerPixel ?? 16;
  const pixels = a.length / 4;
  let changed = 0;
  for (let p = 0; p < pixels; p++) {
    const dr = Math.abs(a[p * 4] - b[p * 4]);
    const dg = Math.abs(a[p * 4 + 1] - b[p * 4 + 1]);
    const db = Math.abs(a[p * 4 + 2] - b[p * 4 + 2]);
    if (dr + dg + db > perPixel * 3) changed++;
  }
  const ratio = pixels === 0 ? 0 : changed / pixels;
  const maxRatio = opts.maxChangeRatio ?? 0.02;
  return {
    compared: true,
    pixelsChanged: changed,
    changeRatio: ratio,
    regression: ratio > maxRatio,
    detail: `${changed}/${pixels} px changed (${(ratio * 100).toFixed(2)}%, budget ${(maxRatio * 100).toFixed(2)}%)`,
  };
}
