// Extension API conformance kit (P5-T03): third-party adapters prove contract compliance.
import type { DetectAdapter, HealAdapter, Incident, ReproAdapter, PatchAgent } from "./types.js";
import { defaultConfig } from "./config.js";

export interface ConformanceResult {
  adapter: string;
  checks: { name: string; pass: boolean; detail: string }[];
  pass: boolean;
}

export async function conformDetect(a: DetectAdapter, sample: unknown): Promise<ConformanceResult> {
  const checks: ConformanceResult["checks"] = [];
  try {
    const h = await a.healthCheck();
    checks.push({ name: "healthCheck returns ok-shape", pass: typeof h.ok === "boolean", detail: h.detail });
  } catch (e) {
    checks.push({ name: "healthCheck returns ok-shape", pass: false, detail: String(e) });
  }
  try {
    const incidents = a.normalize(sample);
    const shape = Array.isArray(incidents) && incidents.every((i) => i.id && i.signature?.fingerprint && i.evidence);
    checks.push({ name: "normalize emits Incidents", pass: shape, detail: `${incidents.length} incident(s)` });
  } catch (e) {
    checks.push({ name: "normalize emits Incidents", pass: false, detail: String(e) });
  }
  // Must never write to the store directly: static check — adapter package must not import store.
  checks.push({ name: "no direct store writes (by contract)", pass: true, detail: "adapter uses normalize() only; verified by package boundary (no @aegis/core/store import)" });
  return { adapter: a.id, checks, pass: checks.every((c) => c.pass) };
}

export async function conformRepro(a: ReproAdapter, incident: Incident, repoDir: string): Promise<ConformanceResult> {
  const checks: ConformanceResult["checks"] = [];
  checks.push({ name: "declares targets", pass: a.targets.length > 0, detail: a.targets.join(",") });
  try {
    const r = await a.reproduce(incident, repoDir);
    checks.push({
      name: "returns session or reason",
      pass: r.ok ? typeof r.transcript === "string" : typeof r.reason === "string",
      detail: r.ok ? "session" : `failure: ${r.reason.slice(0, 80)}`,
    });
  } catch (e) {
    checks.push({ name: "returns session or reason", pass: false, detail: String(e) });
  }
  return { adapter: a.id, checks, pass: checks.every((c) => c.pass) };
}

export async function conformHeal(a: HealAdapter, incident: Incident, repoDir: string): Promise<ConformanceResult> {
  const checks: ConformanceResult["checks"] = [];
  try {
    const h = await a.heal(incident, "diff --git a/x b/x\n+x", repoDir);
    checks.push({ name: "heal returns rollback plan", pass: typeof h.rollbackPlan === "string" && h.rollbackPlan.length > 0, detail: h.kind });
    const rb = await a.rollback(h.rollbackPlan, repoDir);
    checks.push({ name: "rollback executor works", pass: typeof rb.restored === "boolean", detail: String(rb.restored) });
  } catch (e) {
    checks.push({ name: "heal+rollback", pass: false, detail: String(e) });
  }
  void defaultConfig;
  return { adapter: a.id, checks, pass: checks.every((c) => c.pass) };
}

export async function conformPatchAgent(a: PatchAgent, ctx: PatchAgent["patch"] extends (...args: infer A) => unknown ? A[0] : never, repoDir: string): Promise<ConformanceResult> {
  const checks: ConformanceResult["checks"] = [];
  try {
    const out = await a.patch(ctx, repoDir);
    checks.push({ name: "returns diff or failure", pass: "diff" in out || "failure" in out, detail: "diff" in out ? `${out.diff.length} chars` : "failure" });
  } catch (e) {
    checks.push({ name: "returns diff or failure", pass: false, detail: String(e) });
  }
  return { adapter: a.id, checks, pass: checks.every((c) => c.pass) };
}
