// Pi integration (P1-T05): headless Pi invocation behind the pluggable PatchAgent interface.
// Kernel never imports Pi directly (D-12) — only this package does.
// ADR-002 records the resolved package name/version at install time.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { PatchAgent, PatchAgentContext } from "@aegis/core";
import { buildPatchPrompt } from "@aegis/core";

export const PI_PACKAGE = "@mariozechner/pi-coding-agent";

export interface PiInvokeOptions {
  binary?: string;
  timeoutMs?: number;
  model?: string;
  workDir?: string;
}

/** Result parsing: Pi prints a unified diff followed by an explanation. */
export function splitDiffAndExplanation(output: string): { diff: string; explanation: string } {
  const lines = output.split("\n");
  const diffLines: string[] = [];
  let explanation: string[] = [];
  let inDiff = false;
  for (const line of lines) {
    if (line.startsWith("diff --git")) inDiff = true;
    if (inDiff && (line.startsWith("diff --git") || line.startsWith("@@") || /^[+-]/.test(line) || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ "))) {
      diffLines.push(line);
      continue;
    }
    if (inDiff && line.trim() === "") continue;
    if (inDiff && diffLines.length > 0) { explanation.push(line); continue; }
    if (!inDiff) explanation = [...explanation, line];
  }
  return {
    diff: diffLines.join("\n").trim(),
    explanation: explanation.join("\n").trim() || "Pi produced a diff (no explanation captured).",
  };
}

export class PiPatchAgent implements PatchAgent {
  readonly id = "pi";
  constructor(private opts: PiInvokeOptions = {}) {}
  async patch(ctx: PatchAgentContext, repoDir: string): Promise<{ diff: string; explanation: string } | { failure: string }> {
    const preHash = hashLockedTest(ctx.lockedTestPath);
    const prompt = buildPatchPrompt({
      diagnosis: ctx.diagnosis.rootCause,
      repoMap: ctx.repoMap,
      lockedTestPath: ctx.lockedTestPath,
    });
    const workDir = this.opts.workDir ?? repoDir;
    mkdirSync(join(workDir, ".aegis", "pi-runs"), { recursive: true });
    const promptFile = join(workDir, ".aegis", "pi-runs", `prompt-${ctx.attemptsUsed + 1}.md`);
    writeFileSync(promptFile, prompt);
    const binary = this.opts.binary ?? process.env.AEGIS_PI_BINARY ?? "pi";
    const modelFlag = this.opts.model ?? process.env.AEGIS_PI_MODEL;
    try {
      const out = execFileSync(
        `${binary} --headless --no-interactive ${modelFlag ? `--model ${modelFlag}` : ""} < ${JSON.stringify(promptFile)}`,
        { cwd: repoDir, shell: true, timeout: this.opts.timeoutMs ?? 18 * 60 * 1000, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      const { diff, explanation } = splitDiffAndExplanation(String(out));
      if (!diff) return { failure: "pi returned no diff" };
      if (hashLockedTest(ctx.lockedTestPath) !== preHash) {
        return { failure: "locked test was modified during patch — rejected (D-14)" };
      }
      return { diff, explanation };
    } catch (e) {
      return { failure: `pi invocation failed: ${String((e as Error).message).slice(0, 400)}` };
    }
  }
}

function hashLockedTest(path: string): string {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return "missing";
  }
}

export function piAvailable(binary?: string): boolean {
  try {
    execFileSync(`${binary ?? process.env.AEGIS_PI_BINARY ?? "pi"} --version`, { shell: true, timeout: 10_000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic patch agent for tests, examples, and Pi-less environments.
 * Applies a caller-supplied diff verbatim — used by contract/integration tests
 * and the seeded example apps where the "model" output is known.
 */
export class ScriptedPatchAgent implements PatchAgent {
  readonly id = "scripted";
  constructor(private diff: string, private explanation: string) {}
  async patch(ctx: PatchAgentContext, _repoDir: string) {
    if (!existsSync(ctx.lockedTestPath)) return { failure: "locked test missing" } as const;
    return { diff: this.diff, explanation: this.explanation };
  }
}

export { buildPatchPrompt };
