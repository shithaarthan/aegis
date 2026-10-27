// Real stage implementations owned by Core: DIAGNOSE, TEST (lock), VERIFY.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import type { AegisConfig, Diagnosis, Incident, LockedTest, VerificationResult } from "./types.js";
import { buildDiagnosePrompt, quarantineAppText } from "./quarantine.js";
import { detectTestSuite } from "./suite.js";

export interface ModelBackend {
  complete(prompt: string, opts: { slot: "cheap" | "strong"; maxTokens: number }): Promise<{ text: string; tokens: number; costUsd: number }>;
}

/** Heuristic fallback used when no model key is configured (self-test / CI without keys). */
export function heuristicDiagnose(stack: string, repoMap: string): Diagnosis {
  const first = stack.split("\n")[0]?.slice(0, 200) ?? "unknown error";
  const fileHit = stack.match(/([a-zA-Z0-9_./-]+\.(ts|js|py|go|rs))(:\d+)?/);
  const suspect = fileHit ? [fileHit[1]] : [];
  void repoMap;
  return {
    rootCause: first,
    explanation: `Heuristic diagnosis (no model key): the stack points at ${suspect[0] ?? "an unknown location"}. Treat as UNVERIFIED until the locked test proves it.`,
    suspectFiles: suspect,
    confidence: suspect.length > 0 ? "medium" : "low",
    verified: false,
  };
}

export async function runDiagnose(
  incident: Incident,
  repoMap: string,
  reproTranscript: string,
  model: ModelBackend | null,
): Promise<{ diagnosis: Diagnosis; tokens: number; costUsd: number; prompt: string }> {
  const prompt = buildDiagnosePrompt({
    stackTrace: incident.evidence.stackTrace ?? "",
    repoMap,
    reproTranscript,
  });
  if (!model) {
    const d = heuristicDiagnose(quarantineAppText(incident.evidence.stackTrace ?? ""), repoMap);
    return { diagnosis: d, tokens: 0, costUsd: 0, prompt };
  }
  const res = await model.complete(prompt, { slot: "cheap", maxTokens: 2000 });
  try {
    const parsed = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Diagnosis;
    if (!parsed.rootCause) throw new Error("empty");
    return { diagnosis: { verified: false, confidence: parsed.confidence ?? "medium", suspectFiles: parsed.suspectFiles ?? [], explanation: parsed.explanation ?? "", rootCause: parsed.rootCause }, tokens: res.tokens, costUsd: res.costUsd, prompt };
  } catch {
    return { diagnosis: { ...heuristicDiagnose(incident.evidence.stackTrace ?? "", repoMap), explanation: `Model output unparseable; fallback. Raw: ${res.text.slice(0, 300)}` }, tokens: res.tokens, costUsd: res.costUsd, prompt };
  }
}

export function symptomTestName(incident: Incident): string {
  return `aegis-${incident.signature.fingerprint}.test`;
}

/** TEST stage: generate a symptom-derived failing test, hash it, lock it read-only. */
export function generateLockedTest(incident: Incident, repoDir: string, reproTranscript: string): LockedTest {
  const stack = incident.evidence.stackTrace ?? "";
  const firstLine = stack.split("\n")[0] ?? "failure";
  const content = [
    `// AEGIS locked symptom test for incident ${incident.id} — DO NOT EDIT (read-only).`,
    `// Symptom fingerprint: ${incident.signature.fingerprint}`,
    `import { describe, it, expect } from "vitest";`,
    ``,
    `describe("aegis symptom ${incident.id}", () => {`,
    `  it("reproduces the reported symptom", async () => {`,
    `    const { checkSymptom } = await import("./symptom-check.js");`,
    `    const result = await checkSymptom(${JSON.stringify({ stack: firstLine.slice(0, 200), transcript: reproTranscript.slice(0, 500) })});`,
    `    expect(result.reproduced, "symptom should reproduce before the fix").toBe(true);`,
    `  });`,
    `});`,
    ``,
  ].join("\n");
  const dir = join(repoDir, ".aegis", "locked-tests");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, symptomTestName(incident) + ".ts");
  const hash = createHash("sha256").update(content).digest("hex");
  try {
    // Idempotent re-lock: a previous run left this path read-only (D-14).
    chmodSync(path, 0o666);
  } catch { /* fresh file — nothing to unlock */ }
  writeFileSync(path, content);
  try { chmodSync(path, 0o444); } catch { /* windows best effort */ }
  return { path, hash, content };
}

export function verifyLockedTestIntact(locked: LockedTest): boolean {
  try {
    const onDisk = readFileSync(locked.path, "utf8");
    return createHash("sha256").update(onDisk).digest("hex") === locked.hash;
  } catch {
    return false;
  }
}

export function runCommand(cmd: string, cwd: string, timeoutMs: number): { ok: boolean; output: string } {
  if (cmd === "__locked_only__") return { ok: true, output: "locked-only mode: full suite not run — not configured" };
  try {
    const out = execFileSync(cmd, { cwd, timeout: timeoutMs, shell: true, encoding: "utf8" });
    return { ok: true, output: String(out).slice(-4000) };
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return { ok: false, output: String(err.stdout ?? err.message ?? e).slice(-4000) };
  }
}

/** VERIFY: locked test green AND suite green (D-15). Refuses unlocked/modified tests. */
export function runVerify(
  incident: Incident,
  repoDir: string,
  config: AegisConfig,
  opts: { lockedGreen: boolean; suiteTimeoutMs?: number } = { lockedGreen: false },
): VerificationResult {
  const locked = incident.lockedTest;
  const intact = locked ? verifyLockedTestIntact(locked) : false;
  if (!locked || !intact) {
    return {
      lockedTestGreen: false, suiteGreen: false,
      suiteCommand: "(locked test missing or modified)",
      suiteSummary: "VERIFY rejected: locked test missing or hash mismatch — heal invalid (D-14).",
      classification: "locked-failed",
    };
  }
  if (!opts.lockedGreen) {
    return {
      lockedTestGreen: false, suiteGreen: false,
      suiteCommand: "(locked test)",
      suiteSummary: "locked symptom test still failing — patch does not fix the symptom.",
      classification: "locked-failed",
    };
  }
  const plan = detectTestSuite(repoDir, config.testCommand);
  const suite = runCommand(plan.command, repoDir, opts.suiteTimeoutMs ?? 120_000);
  const suiteSummary = plan.mode === "locked-only"
    ? "full suite not run — not configured"
    : suite.output.slice(0, 500);
  if (!suite.ok) {
    return { lockedTestGreen: true, suiteGreen: false, suiteCommand: plan.command, suiteSummary, classification: "regression" };
  }
  return { lockedTestGreen: true, suiteGreen: true, suiteCommand: plan.command, suiteSummary, classification: "pass" };
}

export function newIncidentId(): string {
  return `inc_${randomUUID().slice(0, 8)}`;
}

export function repoMapOf(repoDir: string): string {
  void repoDir;
  return "(repo map: top-level files + suspect modules — full walker in agent-pi)";
}

export function ensureAegisDirs(repoDir: string): void {
  mkdirSync(join(repoDir, ".aegis", "locked-tests"), { recursive: true });
  mkdirSync(join(repoDir, ".aegis", "medical-record"), { recursive: true });
  void dirname;
}
