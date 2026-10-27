import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon } from "../src/daemon-run.js";
import { defaultConfig } from "../src/config.js";
import { setPaused } from "../src/safety.js";
import { runWatchWindow } from "../src/rollback.js";
import { diffRgbaBuffers } from "../src/visual.js";
import { captureTelemetry, setTelemetryEnabled, isTelemetryEnabled } from "../src/telemetry.js";
import type { PatchAgent, ReproAdapter, HealAdapter } from "../src/types.js";

const stubRepro: ReproAdapter = {
  id: "t-repro", targets: ["vm"],
  async reproduce() { return { ok: true, adapterId: "t", transcript: "crashed as reported", howToReplay: "t" }; },
};
const stubHeal: HealAdapter = {
  id: "t-heal",
  async heal(i) { return { kind: "in-place", ref: `healed-${i.id}`, rollbackPlan: "plan", deployed: true }; },
  async rollback() { return { fired: true, restored: true }; },
};
const stubAgent: PatchAgent = {
  id: "t-agent",
  async patch() { return { diff: "diff --git a/x b/x\n+x", explanation: "t fix" }; },
};

function slot(repoDir: string, trustLevel: 0 | 1 | 2 = 0) {
  return {
    name: repoDir, repoDir,
    config: defaultConfig({ edition: "live", trustLevel, testCommand: "__locked_only__" }),
    repro: stubRepro, heal: stubHeal,
  };
}

describe("P3 daemon + rollback drill", () => {
  it("daemon heals a sensor event end-to-end (P3-T10)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daemon-"));
    const seen: string[] = [];
    const d = new Daemon({ slots: [slot(dir)], agent: stubAgent, model: null, onIncident: (_s, st) => seen.push(st) });
    d.ingest({ id: "e1", kind: "sensor", payload: { kind: "exception", app: dir, stackTrace: "TypeError: boom\n    at f (a.js:1:1)" } });
    expect(await d.pumpOnce()).toBe(true);
    expect(seen[0]).toBe("REMEMBERED");
  });
  it("pause takes effect at the next stage boundary (P3-T01)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daemon-paused-"));
    setPaused(dir, true, "drill");
    const seen: string[] = [];
    const d = new Daemon({ slots: [slot(dir)], agent: stubAgent, model: null, onIncident: (_s, st) => seen.push(st) });
    d.ingest({ id: "e2", kind: "sensor", payload: { kind: "exception", stackTrace: "Error: x" } });
    await d.pumpOnce();
    expect(seen).toHaveLength(0);
    setPaused(dir, false);
  });
  it("multi-app daemon isolates quotas (P4-T06)", async () => {
    const a = mkdtempSync(join(tmpdir(), "multi-a-"));
    const b = mkdtempSync(join(tmpdir(), "multi-b-"));
    const cfg = (q: number) => defaultConfig({ edition: "live", dailyQuota: q, testCommand: "__locked_only__" });
    const statuses: string[] = [];
    const d = new Daemon({
      slots: [
        { name: "a", repoDir: a, config: cfg(0), repro: stubRepro, heal: stubHeal },
        { name: "b", repoDir: b, config: cfg(10), repro: stubRepro, heal: stubHeal },
      ],
      agent: stubAgent, model: null,
      onIncident: (_s, st) => statuses.push(`${_s}:${st}`),
    });
    d.ingest({ id: "e3", kind: "sensor", payload: { kind: "exception", app: "a", repoDir: a, stackTrace: "Error: x" } });
    d.ingest({ id: "e4", kind: "sensor", payload: { kind: "exception", app: "b", repoDir: b, stackTrace: "Error: y" } });
    await d.pumpOnce();
    await d.pumpOnce();
    // App A has quota 0 → OVER_QUOTA recorded; app B heals. No cross-talk.
    expect(statuses).toContain("a:OVER_QUOTA");
    expect(statuses).toContain("b:REMEMBERED");
  });
  it("rollback drill: regression → auto-revert fires (P3-T06)", async () => {
    let reverted = false;
    const out = await runWatchWindow(
      { windowMinutes: 15, checkCommand: "exit 1" },
      async (reason) => { reverted = reason.length > 0; },
      1,
    );
    expect(out.rolledBack).toBe(true);
    expect(reverted).toBe(true);
  });
});

describe("P4-T02 visual diff", () => {
  it("flags large changes, ignores identical frames", () => {
    const a = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const same = diffRgbaBuffers(a, new Uint8Array(a), { width: 2, height: 1 });
    expect(same.regression).toBe(false);
    const b = new Uint8Array([0, 0, 255, 255, 0, 0, 255, 255]);
    const changed = diffRgbaBuffers(a, b, { width: 2, height: 1 });
    expect(changed.compared).toBe(true);
    expect(changed.regression).toBe(true);
  });
  it("size mismatch is non-blocking", () => {
    expect(diffRgbaBuffers(new Uint8Array([1]), new Uint8Array([1, 2])).compared).toBe(false);
  });
});

describe("P5-T05 telemetry", () => {
  it("off = zero calls; on = documented fields only", () => {
    setTelemetryEnabled(false);
    expect(isTelemetryEnabled()).toBe(false);
    expect(captureTelemetry({ event: "heal", edition: "agent", target: "vm", outcome: "healed", durationMs: 1, tokens: 2, aegisVersion: "1.0.0" })).toBeNull();
    setTelemetryEnabled(true);
    const payload = captureTelemetry({ event: "heal", edition: "agent", target: "vm", outcome: "healed", durationMs: 1, tokens: 2, aegisVersion: "1.0.0" });
    expect(Object.keys(payload ?? {}).sort()).toEqual(["aegisVersion", "durationMs", "edition", "event", "outcome", "target", "tokens"]);
    setTelemetryEnabled(false);
  });
});
