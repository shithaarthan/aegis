import { describe, it, expect } from "vitest";
import {
  SentryDetectAdapter, verifySentrySignature, hmacSha256Hex,
  GlitchTipDetectAdapter, BugsnagDetectAdapter,
  LogScraperAdapter, WorkersLogpushAdapter, SensorsIngestAdapter,
} from "../src/index.js";
import { conformDetect } from "@aegis/core";

const SENTRY_SAMPLE = {
  project: "demo",
  event: {
    event_id: "abc", level: "error", culprit: "/user",
    exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined", stacktrace: { frames: [{ filename: "user.ts", function: "getUserName", lineno: 12 }] } }] },
  },
};

describe("P1-T01/T02 sentry", () => {
  it("rejects forged webhooks, accepts signed", () => {
    const body = JSON.stringify(SENTRY_SAMPLE);
    const secret = "s3cret";
    const sig = hmacSha256Hex(secret, body);
    expect(verifySentrySignature(body, sig, secret)).toBe(true);
    expect(verifySentrySignature(body, "forged", secret)).toBe(false);
    expect(verifySentrySignature(body, null, secret)).toBe(false);
  });
  it("normalizes to exactly one Incident", () => {
    const [inc] = new SentryDetectAdapter("r/a", "a").normalize(SENTRY_SAMPLE);
    expect(inc.signature.errorType).toContain("TypeError");
    expect(inc.signature.fingerprint).toHaveLength(32);
  });
  it("passes conformance kit", async () => {
    const r = await conformDetect(new SentryDetectAdapter("r/a", "a"), SENTRY_SAMPLE);
    expect(r.pass).toBe(true);
  });
});

describe("P2-T04 other sources", () => {
  it("glitchtip + bugsnag normalize", async () => {
    const [g] = new GlitchTipDetectAdapter("r", "a").normalize({ event: { title: "Boom", culprit: "/x" } });
    expect(g.source).toContain("glitchtip");
    const [b] = new BugsnagDetectAdapter("r", "a").normalize({
      error: { errorClass: "RangeError", message: "bad", stacktrace: [{ file: "f.js", method: "m", lineNumber: 1 }] },
    });
    expect(b.signature.errorType).toContain("RangeError");
    expect((await conformDetect(new GlitchTipDetectAdapter("r", "a"), { event: { title: "t" } })).pass).toBe(true);
    expect((await conformDetect(new BugsnagDetectAdapter("r", "a"), { error: { errorClass: "E" } })).pass).toBe(true);
  });
  it("log scraper finds errors; logpush batch normalizes", async () => {
    const logs = "info ok\nTypeError: boom\n    at f (x.js:1:1)\ninfo done\n";
    const found = new LogScraperAdapter("r", "a").normalize(logs);
    expect(found.length).toBe(1);
    expect(new LogScraperAdapter("r", "a").normalize("all fine, nothing here")).toHaveLength(0);
    const [w] = new WorkersLogpushAdapter("r", "a").normalize([{ exception: "Error: worker blew up", request: { url: "/api" } }]);
    expect(w.signature.route).toBe("/api");
    expect((await conformDetect(new LogScraperAdapter("r", "a"), logs)).pass).toBe(true);
  });
  it("sensors-ingest (live) normalizes sensor events", async () => {
    const [s] = new SensorsIngestAdapter("r").normalize({
      kind: "exception", app: "shop", at: new Date().toISOString(),
      stackTrace: "Error: crash\n    at h (s.js:2:2)",
    });
    expect(s.edition).toBe("live");
    expect((await conformDetect(new SensorsIngestAdapter("r"), { kind: "invariant", app: "a", at: "", invariant: "cart < 0" })).pass).toBe(true);
  });
});
