import { describe, it, expect } from "vitest";
import { DatadogDetectAdapter } from "./datadog.js";
import { conformDetect } from "@aegis/core";

describe("third-party datadog adapter (P5-T07)", () => {
  it("passes the conformance kit from docs alone", async () => {
    const r = await conformDetect(
      new DatadogDetectAdapter("acme/shop", "shop"),
      { title: "High error rate", text: "TypeError: x is not a function", alert_type: "error", tags: ["route:/pay"] },
    );
    expect(r.pass).toBe(true);
    const [inc] = new DatadogDetectAdapter("acme/shop", "shop").normalize({ title: "t", alert_type: "error" });
    expect(inc.signature.fingerprint).toHaveLength(32);
  });
});
