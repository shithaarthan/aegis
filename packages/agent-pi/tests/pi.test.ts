import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedPatchAgent, PiPatchAgent, splitDiffAndExplanation } from "../src/index.js";

describe("P1-T05 patch agent", () => {
  it("scripted agent returns the diff; refuses missing locked test", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-"));
    const locked = join(dir, "locked.ts");
    writeFileSync(locked, "test");
    const a = new ScriptedPatchAgent("diff --git a/x b/x\n+x", "fixes x");
    const ok = await a.patch({ lockedTestPath: locked } as never, dir);
    expect("diff" in ok && ok.diff).toBeTruthy();
    const bad = await a.patch({ lockedTestPath: join(dir, "nope.ts") } as never, dir);
    expect("failure" in bad).toBe(true);
  });
  it("splits pi output into diff + explanation", () => {
    const { diff, explanation } = splitDiffAndExplanation("diff --git a/x b/x\n+x\n\nFixed the null.\n");
    expect(diff).toContain("+x");
    expect(explanation).toContain("Fixed");
  });
  it("pi agent fails honestly when pi is not installed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi2-"));
    const locked = join(dir, "locked.ts");
    writeFileSync(locked, "test");
    const a = new PiPatchAgent({ binary: "pi-binary-that-does-not-exist-xyz", timeoutMs: 5000 });
    const out = await a.patch({ lockedTestPath: locked, attemptsUsed: 0, diagnosis: { rootCause: "r" }, repoMap: "m" } as never, dir);
    expect("failure" in out).toBe(true);
  });
});
