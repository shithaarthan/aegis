import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { decideDispatch, fingerprintForDedupe, hostedDispatchRequest } from "../src/index.js";
import handler from "../src/index.js";
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

describe("P5-T04 hosted dispatcher (opt-in)", () => {
  it("posts the same normalized incident to the managed endpoint", async () => {
    const seen: { url: string; body: string }[] = [];
    const srv = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        seen.push({ url: req.url ?? "", body: data });
        res.writeHead(202).end("{}");
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      const body = JSON.stringify({ event: { event_id: "hosted-1" } });
      const secret = "whsec";
      const d = await decideDispatch({ rawBody: body, signatureHeader: sign(body, secret), secret });
      expect(d.dispatched).toBe(true);
      // Same integration contract as self-hosted: signed + novel dispatches.
      const { url, init } = hostedDispatchRequest(`http://127.0.0.1:${port}`, {
        fingerprint: d.incidentFingerprint,
        raw: body,
      });
      const res = await fetch(url, init);
      expect(res.status).toBe(202);
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe("/v1/incidents");
      expect(JSON.parse(seen[0].body).fingerprint).toBe(d.incidentFingerprint);
      void handler;
    } finally {
      srv.close();
    }
  });
});
