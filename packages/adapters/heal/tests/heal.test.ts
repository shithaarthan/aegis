import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrHealAdapter, HotReloadHealAdapter, ProposedCommandHealAdapter, verifyDeploy } from "../src/index.js";
import { conformHeal } from "@aegis/core";

function incident(): never {
  return {
    id: "inc_test1", signature: { fingerprint: "f".repeat(32), errorType: "E", topFrames: [], route: "/" },
    diagnosis: { rootCause: "r", explanation: "e", suspectFiles: [], confidence: "high", verified: true },
    patchAttempts: [], lockedTest: null, verification: { lockedTestGreen: true, suiteGreen: true, suiteCommand: "x", suiteSummary: "ok", classification: "pass" },
    trustLevelApplied: 0, tokens: 0, costUsd: 0,
  } as never;
}

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "heal-"));
  execFileSync("git init -b main && git config user.email t@t && git config user.name t && echo hi > a.txt && git add -A && git commit -m init", { cwd: dir, shell: true, stdio: "ignore" });
  return dir;
}

describe("P1-T09 PR heal", () => {
  it("writes patch + PR body, always with a rollback plan", async () => {
    const dir = gitRepo();
    writeFileSync(join(dir, "a.txt"), "hi\n");
    const h = await new PrHealAdapter().heal(incident(), "diff --git a/a.txt b/a.txt\n+line\n", dir);
    expect(h.kind).toBe("pr");
    expect(h.rollbackPlan.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, ".aegis", "heal-patches", "inc_test1.pr-body.md"), "utf8")).toContain("AEGIS heal");
  });
  it("passes conformance kit", async () => {
    const r = await conformHeal(new PrHealAdapter(), incident(), gitRepo());
    expect(r.pass).toBe(true);
  });
});

describe("P3-T05 in-place heals", () => {
  it("hot-reload heals and rolls back", async () => {
    const dir = gitRepo();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "x.txt"), "v1");
    const a = new HotReloadHealAdapter();
    const h = await a.heal({}, "diff --git a/src/x.txt b/src/x.txt\n", dir);
    expect(h.kind).toBe("in-place");
    const rb = await a.rollback(h.rollbackPlan, dir);
    expect(rb.restored).toBe(true);
  });
  it("trust-0 proposes a command, never applies", async () => {
    const dir = gitRepo();
    const h = await new ProposedCommandHealAdapter().heal({}, "+x", dir);
    expect(h.kind).toBe("proposed-command");
    expect(h.ref).toContain("git apply");
  });
});

describe("P2-T06 deploy verify", () => {
  it("reports unverified when unconfigured; honors check command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dep-"));
    expect((await verifyDeploy({ repoDir: dir })).outcome).toContain("unverified");
    expect((await verifyDeploy({ repoDir: dir, checkCommand: "echo ok" })).ok).toBe(true);
    expect((await verifyDeploy({ repoDir: dir, checkCommand: "exit 3" })).ok).toBe(false);
  });
});
