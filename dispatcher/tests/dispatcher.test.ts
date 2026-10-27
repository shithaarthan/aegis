import { describe, it, expect } from "vitest";
import { decideDispatch, fingerprintForDedupe } from "../src/index.js";
import { createHmac } from "node:crypto";

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("P1-T01 dispatcher", () => {
  it("rejects forged webhooks; accepts valid; dedupes repeats; manual bypasses", async () => {
    const body = JSON.stringify({ event: { event_id: "x1" } });
    const secret = "whsec";
    const forged = await decideDispatch({ rawBody: body, signatureHeader: "nope", secret });
    expect(forged.dispatched).toBe(false);
    expect(forged.reason).toContain("signature");

    const valid = await decideDispatch({ rawBody: body, signatureHeader: sign(body, secret), secret });
    expect(valid.dispatched).toBe(true);

    const dupe = await decideDispatch({ rawBody: body, signatureHeader: sign(body, secret), secret });
    expect(dupe.dispatched).toBe(false);
    expect(dupe.reason).toContain("dedupe");

    const manual = await decideDispatch({ rawBody: "{}", signatureHeader: null, secret: "", manualTrigger: true });
    expect(manual.dispatched).toBe(true);
    expect(fingerprintForDedupe(body)).toHaveLength(16);
  });
});
