import { describe, it, expect } from "vitest";
import { initSensors, invariant, wrapHandler, ActionLog } from "../src/index.js";

describe("P3-T02 sdk-node", () => {
  it("emits crash + invariant events; scrubs secrets", () => {
    const seen: unknown[] = [];
    const { emit } = initSensors({ app: "shop", onEvent: (e) => seen.push(e), captureUncaught: false });
    emit({ kind: "exception", stackTrace: "Error: x with sk-abcdefghijklmnop inside" });
    invariant(emit, false, "cart-total", "expected >= 0");
    expect(seen).toHaveLength(2);
    expect(JSON.stringify(seen)).not.toContain("sk-abcdefghijklmnop");
  });
  it("wrapHandler captures route errors and rethrows", async () => {
    const seen: { route?: string }[] = [];
    const { emit } = initSensors({ onEvent: (e) => seen.push(e), captureUncaught: false });
    const h = wrapHandler(async () => { throw new Error("boom"); }, emit, () => "/pay");
    await expect(h({}, {})).rejects.toThrow("boom");
    expect(seen[0].route).toBe("/pay");
  });
  it("action log is a bounded ring buffer", () => {
    const log = new ActionLog(3);
    for (let i = 0; i < 5; i++) log.record(`e${i}`);
    expect(log.snapshot()).toHaveLength(3);
  });
});
