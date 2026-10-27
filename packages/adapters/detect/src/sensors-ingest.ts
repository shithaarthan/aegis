// Daemon-side sensors-ingest detect adapter (P3-T03): sensor events → TRIAGE.
import type { DetectAdapter, Incident } from "@aegis/core";
import { makeIncident } from "./common.js";

export interface SensorEvent {
  kind: "exception" | "invariant" | "action-log" | "dom" | "visual";
  app: string;
  at: string;
  stackTrace?: string;
  message?: string;
  invariant?: string;
  route?: string;
  actionLog?: string[];
}

export class SensorsIngestAdapter implements DetectAdapter {
  readonly id = "sensors-ingest";
  readonly sourceType = "sensors";
  constructor(private repo: string) {}
  async healthCheck() { return { ok: true, detail: "sensors ingest: queue consumer" }; }
  normalize(raw: unknown): Incident[] {
    const e = raw as SensorEvent;
    const stack = e.stackTrace ?? `${e.kind === "invariant" ? "InvariantViolation" : "SensorError"}: ${e.invariant ?? e.message ?? "sensor event"}`;
    return [makeIncident({
      source: this.id, edition: "live", repo: this.repo, app: e.app ?? "app",
      stackTrace: stack, route: e.route ?? "",
      severity: e.kind === "exception" ? "critical" : "high",
      logs: e.actionLog?.join("\n").slice(0, 4000),
    })];
  }
}
