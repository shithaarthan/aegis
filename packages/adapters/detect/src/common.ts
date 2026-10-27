// Shared incident factory for detect adapters. Never writes to the store (D-05).
import { createHmac, randomUUID } from "node:crypto";
import type { Edition, Incident, IncidentSignature } from "@aegis/core";
import { fingerprintStack } from "@aegis/core";

export function makeIncident(args: {
  source: string;
  edition: Edition;
  repo: string;
  app: string;
  stackTrace: string;
  route?: string;
  severity?: Incident["severity"];
  logs?: string;
}): Incident {
  const sig: IncidentSignature = fingerprintStack(args.stackTrace, args.route ?? "");
  const now = new Date().toISOString();
  return {
    id: `inc_${sig.fingerprint.slice(0, 8)}_${randomUUID().slice(0, 6)}`,
    signature: sig,
    source: args.source,
    edition: args.edition,
    repo: args.repo,
    app: args.app,
    firstSeen: now,
    lastSeen: now,
    occurrences: 1,
    status: "DETECTED",
    severity: args.severity ?? "high",
    evidence: { stackTrace: args.stackTrace, logs: args.logs },
    diagnosis: null,
    lockedTest: null,
    patchAttempts: [],
    verification: null,
    heal: null,
    rollback: null,
    tokens: 0,
    costUsd: 0,
    stageTimingsMs: {},
    trustLevelApplied: 0,
  };
}

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Constant-time compare for webhook signatures. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
