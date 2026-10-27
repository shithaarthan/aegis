// Fingerprinting for TRIAGE dedupe (D-20): error type + top frames + route.
import { createHash } from "node:crypto";
import type { IncidentSignature } from "./types.js";

export function normalizeFrame(frame: string): string {
  return frame
    .replace(/\\/g, "/")
    .replace(/:\d+:\d+/g, "")
    .replace(/\(.*\)/g, "")
    .trim();
}

export function fingerprintStack(stack: string, route = ""): IncidentSignature {
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  // Runtimes often print source context first (e.g. Node prints the failing
  // line + caret before the TypeError). The head is the first error-like line.
  // The error token must LEAD the line so code comments mentioning errors
  // ("// TypeError when…") can never be mistaken for the failure head.
  const head = lines.find((l) => /^[\w$.]*((Error)|(Exception)|(Failure))(?=:|\s|$)/.test(l))
    ?? lines.find((l) => /^(ERROR|FATAL|panic|Traceback)(:|\s|$)/i.test(l))
    ?? lines[0]
    ?? "unknown-error";
  const errorType = head.slice(0, 160);
  const frames = lines
    .filter((l) => l.startsWith("at ") || l.includes(".js") || l.includes(".ts") || l.includes(".py"))
    .slice(0, 5)
    .map(normalizeFrame);
  const topFrames = frames.length > 0 ? frames : ["<no-frames>"];
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([errorType, topFrames, route]))
    .digest("hex")
    .slice(0, 32);
  return { fingerprint, errorType, topFrames, route };
}

export function sameSignature(a: IncidentSignature, b: IncidentSignature): boolean {
  return a.fingerprint === b.fingerprint;
}
