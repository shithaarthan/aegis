// Cloudflare Worker dispatcher (P1-T01): single entry for Sentry webhooks.
// Validates signature → normalizes to an Incident → preliminary dedupes → dispatches to GitHub Actions.
// A manual/CLI trigger bypasses the dispatcher for testing (same output contract).
// Runs on `workerd`; this module keeps fetch-handler wiring separate from pure logic for testability.

export interface DispatchEnv {
  SENTRY_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // "owner/repo"
}

export interface NormalizedDispatch {
  incidentFingerprint: string;
  dedupeKey: string;
  dispatched: boolean;
  reason: string;
}

const seen = new Map<string, number>();

export function fingerprintForDedupe(rawBody: string): string {
  // Preliminary dedupe: stable hash of the raw payload (full fingerprinting happens in Core TRIAGE).
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < rawBody.length; i++) {
    h1 = Math.imul(h1 ^ rawBody.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + rawBody.charCodeAt(i), 31);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

export async function verifySignatureWebCrypto(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (header.trim().length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Pure decision step: validate → dedupe → describe the GitHub dispatch. Testable without network. */
export async function decideDispatch(args: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  manualTrigger?: boolean;
  now?: number;
}): Promise<NormalizedDispatch> {
  const key = fingerprintForDedupe(args.rawBody);
  if (args.manualTrigger) {
    return { incidentFingerprint: key, dedupeKey: key, dispatched: true, reason: "manual trigger bypass" };
  }
  const valid = await verifySignatureWebCrypto(args.rawBody, args.signatureHeader, args.secret);
  if (!valid) {
    return { incidentFingerprint: key, dedupeKey: key, dispatched: false, reason: "invalid signature — rejected" };
  }
  const now = args.now ?? Date.now();
  const last = seen.get(key);
  if (last !== undefined && now - last < 10 * 60 * 1000) {
    return { incidentFingerprint: key, dedupeKey: key, dispatched: false, reason: "pre-dedupe hit (10-min window)" };
  }
  seen.set(key, now);
  return { incidentFingerprint: key, dedupeKey: key, dispatched: true, reason: "valid + novel — dispatch to GitHub Actions" };
}

export function githubDispatchRequest(repo: string, payload: { fingerprint: string; raw: string }): { url: string; init: RequestInit } {
  return {
    url: `https://api.github.com/repos/${repo}/dispatches`,
    init: {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${(globalThis as { __gh?: string }).__gh ?? "GITHUB_TOKEN"}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "aegis-incident", client_payload: payload }),
    },
  };
}

// Worker entrypoint (wired by wrangler; kept thin by design).
export default {
  async fetch(request: Request, env: DispatchEnv): Promise<Response> {
    const url = new URL(request.url);
    const rawBody = await request.text();
    if (url.searchParams.has("manual") || request.method !== "POST") {
      const d = await decideDispatch({ rawBody, signatureHeader: null, secret: "", manualTrigger: true });
      return Response.json(d);
    }
    const d = await decideDispatch({
      rawBody,
      signatureHeader: request.headers.get("sentry-hook-signature"),
      secret: env.SENTRY_WEBHOOK_SECRET,
    });
    if (!d.dispatched) return Response.json(d, { status: d.reason.includes("signature") ? 401 : 202 });
    const { url: dispatchUrl, init } = githubDispatchRequest(env.GITHUB_REPO, { fingerprint: d.incidentFingerprint, raw: rawBody.slice(0, 20000) });
    const authed: RequestInit = {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${env.GITHUB_TOKEN}` },
    };
    const gh = await fetch(dispatchUrl, authed);
    return Response.json({ ...d, githubStatus: gh.status }, { status: gh.ok ? 202 : 502 });
  },
};
