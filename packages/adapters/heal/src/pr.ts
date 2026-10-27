// PR heal adapter (P1-T09): branch + commit (fix + Medical Record) + PR with incident card.
// In CI with `gh` installed it opens a real PR; otherwise it writes the patch + PR body
// to .aegis/heal-patches/ so nothing is lost and the run stays honest.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HealAdapter, Incident, HealResult } from "@aegis/core";

function sh(cmd: string, cwd: string): string {
  return execFileSync(cmd, { cwd, shell: true, timeout: 60_000, encoding: "utf8" });
}

function ghAvailable(): boolean {
  try {
    execFileSync("gh --version", { shell: true, timeout: 10_000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function applyDiffUnified(repoDir: string, diff: string): void {
  // Minimal applier for `diff --git` unified diffs touching existing files.
  const files = new Map<string, string[]>();
  let cur: string | null = null;
  let hunks: string[] = [];
  const flush = () => {
    if (cur) files.set(cur, hunks);
    cur = null; hunks = [];
  };
  for (const line of diff.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) { flush(); cur = m[1]; continue; }
    if (cur && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("@@"))) {
      hunks.push(line);
    }
  }
  flush();
  for (const [file, hunkLines] of files) {
    const abs = join(repoDir, file);
    if (!existsSync(abs)) continue;
    const original = readFileSync(abs, "utf8").split("\n");
    const next: string[] = [];
    let i = 0;
    let h = 0;
    while (h < hunkLines.length) {
      const header = hunkLines[h].match(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/);
      if (header) { h++; continue; }
      const line = hunkLines[h];
      if (line.startsWith(" ")) { next.push(original[i] ?? line.slice(1)); i++; }
      else if (line.startsWith("-")) { i++; }
      else if (line.startsWith("+")) { next.push(line.slice(1)); }
      h++;
    }
    while (i < original.length) { next.push(original[i]); i++; }
    writeFileSync(abs, next.join("\n"));
  }
}

export class PrHealAdapter implements HealAdapter {
  readonly id = "pr";
  constructor(private baseBranch = "main") {}

  async heal(incident: Incident, diff: string, repoDir: string): Promise<HealResult & { rollbackPlan: string }> {
    const branch = `aegis/${incident.id}`;
    const cardPath = join(repoDir, ".aegis", "medical-record", `${incident.id}.md`);
    const card = existsSync(cardPath) ? readFileSync(cardPath, "utf8") : `# Incident ${incident.id}\n\n${incident.diagnosis?.explanation ?? ""}`;
    try {
      applyDiffUnified(repoDir, diff);
    } catch (e) {
      return { kind: "pr", ref: "(patch-apply-failed)", rollbackPlan: "", deployed: false, deployOutcome: `diff application failed: ${(e as Error).message}` };
    }
    const patchDir = join(repoDir, ".aegis", "heal-patches");
    mkdirSync(patchDir, { recursive: true });
    writeFileSync(join(patchDir, `${incident.id}.diff`), diff);
    writeFileSync(join(patchDir, `${incident.id}.pr-body.md`), prBody(incident, card));
    let ref = join(patchDir, `${incident.id}.diff`);
    try {
      sh(`git checkout -b ${branch}`, repoDir);
      sh(`git add -A`, repoDir);
      sh(`git commit -m "aegis: heal ${incident.id} (${incident.signature.fingerprint})" -m "${incident.diagnosis?.rootCause ?? "automated fix"}"`, repoDir);
      if (ghAvailable()) {
        const url = sh(`gh pr create --base ${this.baseBranch} --head ${branch} --title "AEGIS heal ${incident.id}" --body-file ${join(patchDir, `${incident.id}.pr-body.md`)}`, repoDir).trim();
        ref = url.split("\n").pop() ?? ref;
      } else {
        ref = `local-branch:${branch} (gh not installed — push and open a PR manually)`;
      }
    } catch (e) {
      ref = `${ref} (git step skipped: ${String((e as Error).message).slice(0, 200)})`;
    }
    return { kind: "pr", ref, rollbackPlan: `git revert <merge-commit-of-${branch}>`, deployed: false, deployOutcome: "awaiting human merge (trust 0/1)" };
  }

  async rollback(plan: string, _repoDir: string) {
    void plan;
    return { fired: false, restored: false, reason: "PR heal rolls back by closing/reverting the PR — no auto action" };
  }
}

export function prBody(incident: Incident, card: string): string {
  const last = incident.patchAttempts[incident.patchAttempts.length - 1];
  return [
    `## AEGIS heal for incident ${incident.id}`,
    ``,
    `- Root cause: ${incident.diagnosis?.rootCause ?? "unknown"}`,
    `- Locked test: ${incident.lockedTest ? `\`${incident.lockedTest.path}\` (verified green)` : "n/a"}`,
    `- Suite: ${incident.verification?.suiteGreen ? "green" : "see card"} (\`${incident.verification?.suiteCommand ?? "n/a"}\`)`,
    `- Diff: ${last?.filesChanged ?? 0} files, ${last?.linesChanged ?? 0} lines · tokens ${incident.tokens} · cost $${incident.costUsd.toFixed(4)}`,
    `- Trust level: ${incident.trustLevelApplied}`,
    ``,
    `<details><summary>Medical Record card</summary>`,
    ``,
    card.slice(0, 8000),
    ``,
    `</details>`,
  ].join("\n");
}
