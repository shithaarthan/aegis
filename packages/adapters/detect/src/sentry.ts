// Sentry webhook detect adapter (P1-T02). In-CI side: consumes dispatcher Incidents.
import type { DetectAdapter, Incident } from "@aegis/core";
import { makeIncident, safeEqual, hmacSha256Hex } from "./common.js";

/** Validates the Sentry `sentry-hook-signature` header (HMAC-SHA256 of the raw body). */
export function verifySentrySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = hmacSha256Hex(secret, rawBody);
  return safeEqual(header.trim(), expected);
}

interface SentryPayload {
  project?: string;
  event?: {
    event_id?: string;
    level?: string;
    culprit?: string;
    metadata?: { value?: string; type?: string };
    exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: { filename?: string; function?: string; lineno?: number }[] } }[] };
  };
}

export function sentryPayloadToStack(payload: SentryPayload): { stack: string; route: string } {
  const ev = payload.event ?? {};
  const exc = ev.exception?.values?.[0];
  const frames = (exc?.stacktrace?.frames ?? [])
    .slice(-8)
    .map((f) => `    at ${f.function ?? "<anon>"} (${f.filename ?? "unknown"}:${f.lineno ?? 0})`);
  const head = `${exc?.type ?? ev.metadata?.type ?? "Error"}: ${exc?.value ?? ev.metadata?.value ?? ev.culprit ?? "unknown error"}`;
  return { stack: [head, ...frames].join("\n"), route: ev.culprit ?? "" };
}

export class SentryDetectAdapter implements DetectAdapter {
  readonly id = "sentry-webhook";
  readonly sourceType = "sentry";
  constructor(private repo: string, private app: string) {}
  async healthCheck() { return { ok: true, detail: "sentry adapter: stateless normalize" }; }
  normalize(raw: unknown): Incident[] {
    const payload = raw as SentryPayload;
    const { stack, route } = sentryPayloadToStack(payload);
    const level = payload.event?.level;
    return [makeIncident({
      source: this.id, edition: "agent", repo: this.repo, app: this.app,
      stackTrace: stack, route,
      severity: level === "fatal" ? "critical" : level === "warning" ? "medium" : "high",
    })];
  }
}
