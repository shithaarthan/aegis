// Pipeline FSM: 9 stages + terminal states (D-04). Idempotent, kill-switch aware.
import type { IncidentStatus, PipelineStage } from "./types.js";

export const STAGES: PipelineStage[] = [
  "DETECT", "TRIAGE", "REPRODUCE", "DIAGNOSE", "TEST", "PATCH", "VERIFY", "HEAL", "REMEMBER",
];

export type FsmEvent =
  | "advance" | "duplicate" | "ignored" | "over-quota"
  | "reproduced" | "irreproducible" | "diagnosed" | "test-locked"
  | "diff-produced" | "budget-exhausted" | "verified" | "needs-retry"
  | "regression" | "healed" | "remembered" | "pause";

export const TRANSITIONS: Record<PipelineStage, Partial<Record<FsmEvent, IncidentStatus>>> = {
  DETECT: { advance: "DETECTED", pause: "PAUSED" },
  TRIAGE: { advance: "TRIAGED", duplicate: "DUPLICATE", ignored: "IGNORED", "over-quota": "OVER_QUOTA", pause: "PAUSED" },
  REPRODUCE: { reproduced: "REPRODUCED", irreproducible: "IRREPRODUCIBLE", pause: "PAUSED" },
  DIAGNOSE: { diagnosed: "DIAGNOSED", pause: "PAUSED" },
  TEST: { "test-locked": "TEST_LOCKED", pause: "PAUSED" },
  PATCH: { "diff-produced": "PATCHED", "budget-exhausted": "PATCH_BUDGET_EXHAUSTED", pause: "PAUSED" },
  VERIFY: { verified: "VERIFIED", "needs-retry": "PATCHED", regression: "REGRESSION", pause: "PAUSED" },
  HEAL: { healed: "HEALED", pause: "PAUSED" },
  REMEMBER: { remembered: "REMEMBERED", pause: "PAUSED" },
};

export function transition(stage: PipelineStage, event: FsmEvent): IncidentStatus {
  const next = TRANSITIONS[stage][event];
  if (!next) throw new Error(`Illegal FSM transition: ${stage} + ${event}`);
  return next;
}

/** Stage receipts make re-runs idempotent: same stage+incident+inputHash = skip. */
export class StageReceipts {
  private seen = new Map<string, string>();
  key(incidentId: string, stage: PipelineStage): string {
    return `${incidentId}:${stage}`;
  }
  alreadyRan(incidentId: string, stage: PipelineStage, inputHash: string): boolean {
    return this.seen.get(this.key(incidentId, stage)) === inputHash;
  }
  record(incidentId: string, stage: PipelineStage, inputHash: string): void {
    this.seen.set(this.key(incidentId, stage), inputHash);
  }
}

export function checkGate(args: {
  killSwitch: boolean;
  tokensUsed: number;
  tokenCeiling: number;
  startedAt: number;
  wallClockMs: number;
}): "go" | "pause" | "budget-exceeded" {
  if (args.killSwitch) return "pause";
  if (args.tokensUsed >= args.tokenCeiling) return "budget-exceeded";
  if (Date.now() - args.startedAt >= args.wallClockMs) return "budget-exceeded";
  return "go";
}
