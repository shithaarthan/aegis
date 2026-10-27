// Community Datadog detect adapter — first third-party adapter merged for 1.0 (P5-T07).
// Built against docs/extension-api.md only: DetectAdapter contract + conformance kit.
import { createHash } from "node:crypto";
import { fingerprintStack } from "@aegis/core";
import type { DetectAdapter, Incident } from "@aegis/core";

export class DatadogDetectAdapter implements DetectAdapter {
  readonly id = "datadog-webhook";
  readonly sourceType = "datadog";
  constructor(private repo: string, private app: string) {}
  async healthCheck() {
    return { ok: true, detail: "datadog adapter: stateless normalize" };
  }
  normalize(raw: unknown): Incident[] {
    const p = raw as { title?: string; text?: string; alert_type?: string; tags?: string[] };
    const stack = `${p.alert_type === "error" ? "Error" : "Alert"}: ${p.title ?? "datadog monitor"}\n${p.text ?? ""}`;
    const route = (p.tags ?? []).find((t) => t.startsWith("route:"))?.slice(6) ?? "";
    const sig = fingerprintStack(stack, route);
    const now = new Date().toISOString();
    void createHash;
    return [{
      id: `inc_dd_${sig.fingerprint.slice(0, 8)}`,
      signature: sig, source: this.id, edition: "agent",
      repo: this.repo, app: this.app, firstSeen: now, lastSeen: now,
      occurrences: 1, status: "DETECTED", severity: p.alert_type === "error" ? "high" : "medium",
      evidence: { stackTrace: stack }, diagnosis: null, lockedTest: null,
      patchAttempts: [], verification: null, heal: null, rollback: null,
      tokens: 0, costUsd: 0, stageTimingsMs: {}, trustLevelApplied: 0,
    }];
  }
}
