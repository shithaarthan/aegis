// Stub implementations for Phase-0 vertical slice (P0-T04) + self-test.
import { randomUUID } from "node:crypto";
import type { DetectAdapter, HealAdapter, Incident, PatchAgent, ReproAdapter } from "./types.js";

export class StubDetect implements DetectAdapter {
  readonly id = "stub-detect";
  readonly sourceType = "stub";
  async healthCheck() { return { ok: true, detail: "stub" }; }
  normalize(raw: unknown): Incident[] {
    const r = raw as { stackTrace?: string };
    const now = new Date().toISOString();
    return [{
      id: `inc_stub_${randomUUID().slice(0, 6)}`,
      signature: { fingerprint: "stubfp", errorType: "StubError", topFrames: ["stub"], route: "/" },
      source: "stub", edition: "agent", repo: "stub/repo", app: "stub",
      firstSeen: now, lastSeen: now, occurrences: 1, status: "DETECTED", severity: "medium",
      evidence: { stackTrace: r.stackTrace ?? "StubError" },
      diagnosis: null, lockedTest: null, patchAttempts: [],
      verification: null, heal: null, rollback: null,
      tokens: 0, costUsd: 0, stageTimingsMs: {}, trustLevelApplied: 0,
    }];
  }
}

export class StubRepro implements ReproAdapter {
  readonly id = "stub-repro";
  readonly targets = ["vm"];
  constructor(private willReproduce = true) {}
  async reproduce(incident: Incident, _repoDir: string) {
    void incident;
    if (this.willReproduce) {
      return { ok: true as const, adapterId: this.id, transcript: "stub replay: crashed as reported", howToReplay: "stub" };
    }
    return { ok: false as const, adapterId: this.id, reason: "stub cannot reproduce" };
  }
}

export class StubHeal implements HealAdapter {
  readonly id = "stub-heal";
  async heal(incident: Incident, diff: string, _repoDir: string) {
    void diff;
    return { kind: "pr" as const, ref: `https://example.com/pr/stub-${incident.id}`, rollbackPlan: `revert stub-${incident.id}` };
  }
  async rollback(_plan: string, _repoDir: string) {
    return { fired: true, restored: true, at: new Date().toISOString() };
  }
}

export class StubAgent implements PatchAgent {
  readonly id = "stub-agent";
  async patch(_ctx: unknown, _repoDir: string) {
    return {
      diff: "diff --git a/src/fix.ts b/src/fix.ts\n+export const fixed = true;\n",
      explanation: "Stub patch: marked fixed. (Replace with Pi in Phase 1.)",
    };
  }
}
