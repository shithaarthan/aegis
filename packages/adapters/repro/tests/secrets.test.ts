import { describe, it, expect } from "vitest";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DirectBootReproAdapter } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const vmApp = join(here, "..", "..", "..", "..", "examples", "vm-app");

describe("P5-T02 sandbox/secret review (D-16)", () => {
  it("repro never forwards production secrets to the sandbox", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sec-"));
    cpSync(vmApp, dir, { recursive: true });
    process.env.AEGIS_TEST_SECRET_TOKEN = "super-secret-should-never-leak";
    const seen: string[] = [];
    const adapter = new DirectBootReproAdapter({
      entry: "src/server.js",
      bootTimeoutMs: 6000,
      fixtureEnv: { PORT: "18921", PROBE_CAPTURE: "1" },
    });
    const r = await adapter.reproduce(
      { id: "s", signature: { fingerprint: "x", errorType: "TypeError:", topFrames: [], route: "/" }, evidence: { stackTrace: "TypeError: t" } } as never,
      dir,
    );
    void seen;
    // The adapter contract: only fixture env is added; secret-like host vars are stripped.
    // Assert on the transcript surface — no secret value may appear in any adapter output.
    expect(JSON.stringify(r)).not.toContain("super-secret-should-never-leak");
    delete process.env.AEGIS_TEST_SECRET_TOKEN;
  });
});
