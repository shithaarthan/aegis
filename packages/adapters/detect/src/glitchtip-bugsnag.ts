// GlitchTip + Bugsnag detect adapters (P2-T04). Same normalized Incident contract (D-10).
import type { DetectAdapter, Incident } from "@aegis/core";
import { makeIncident } from "./common.js";

export class GlitchTipDetectAdapter implements DetectAdapter {
  readonly id = "glitchtip-webhook";
  readonly sourceType = "glitchtip";
  constructor(private repo: string, private app: string) {}
  async healthCheck() { return { ok: true, detail: "glitchtip adapter: sentry-compatible normalize" }; }
  normalize(raw: unknown): Incident[] {
    // GlitchTip is Sentry-protocol compatible.
    const p = raw as { project?: string; event?: { level?: string; culprit?: string; title?: string; stack?: string } };
    const ev = p.event ?? {};
    const stack = ev.stack ?? `${ev.title ?? "GlitchTipError"}: ${ev.culprit ?? "unknown"}`;
    return [makeIncident({
      source: this.id, edition: "agent", repo: this.repo, app: this.app,
      stackTrace: stack, route: ev.culprit ?? "",
      severity: ev.level === "fatal" ? "critical" : "high",
    })];
  }
}

export class BugsnagDetectAdapter implements DetectAdapter {
  readonly id = "bugsnag-webhook";
  readonly sourceType = "bugsnag";
  constructor(private repo: string, private app: string) {}
  async healthCheck() { return { ok: true, detail: "bugsnag adapter: normalize" }; }
  normalize(raw: unknown): Incident[] {
    const p = raw as {
      error?: { errorClass?: string; message?: string; stacktrace?: { file?: string; method?: string; lineNumber?: number }[] };
      request?: { url?: string };
    };
    const err = p.error ?? {};
    const frames = (err.stacktrace ?? []).slice(0, 8)
      .map((f) => `    at ${f.method ?? "<anon>"} (${f.file ?? "unknown"}:${f.lineNumber ?? 0})`);
    const stack = [`${err.errorClass ?? "Error"}: ${err.message ?? "unknown error"}`, ...frames].join("\n");
    return [makeIncident({
      source: this.id, edition: "agent", repo: this.repo, app: this.app,
      stackTrace: stack, route: p.request?.url ?? "",
    })];
  }
}
