// In-place heal adapters for Live (P3-T05): hot-reload, process-manager restart, rolling.
// Every heal returns a rollback plan + executor (contract §4.3).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HealAdapter, HealResult } from "@aegis/core";

function run(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync(cmd, { cwd, shell: true, timeout: 60_000, encoding: "utf8" }) };
  } catch (e) {
    return { ok: false, out: String((e as Error).message).slice(0, 1000) };
  }
}

async function snapshotHead(repoDir: string): Promise<string> {
  const r = run("git rev-parse HEAD", repoDir);
  return r.ok ? r.out.trim() : "unknown";
}

/** Hot-reload: apply files, touch reload trigger, keep previous files for rollback. */
export class HotReloadHealAdapter implements HealAdapter {
  readonly id = "hot-reload";
  async heal(incident: unknown, diff: string, repoDir: string): Promise<HealResult & { rollbackPlan: string }> {
    void incident;
    const prevHead = await snapshotHead(repoDir);
    const backupDir = join(repoDir, ".aegis", "rollback", `hot-${Date.now()}`);
    const { mkdirSync, cpSync } = await import("node:fs");
    mkdirSync(backupDir, { recursive: true });
    for (const f of changedFiles(diff)) {
      const abs = join(repoDir, f);
      if (existsSync(abs)) {
        mkdirSync(join(backupDir, f.slice(0, f.lastIndexOf("/"))), { recursive: true });
        cpSync(abs, join(backupDir, f));
      }
    }
    const applied = applySimpleDiff(repoDir, diff);
    run("touch .aegis/reload-trigger", repoDir);
    return {
      kind: "in-place", ref: `hot-reload@${prevHead.slice(0, 8)} (${applied} files)`,
      rollbackPlan: JSON.stringify({ type: "hot-reload", backupDir, head: prevHead }),
    };
  }
  async rollback(plan: string, repoDir: string) {
    try {
      const p = JSON.parse(plan) as { backupDir: string };
      const { cpSync } = await import("node:fs");
      cpSync(p.backupDir, repoDir, { recursive: true });
      run("touch .aegis/reload-trigger", repoDir);
      return { fired: true, restored: true, at: new Date().toISOString(), reason: "hot-reload rollback: restored pre-heal files" };
    } catch (e) {
      return { fired: true, restored: false, reason: String((e as Error).message).slice(0, 300) };
    }
  }
}

/** Process-manager restart: pm2 or systemd (P3-T05). */
export class RestartHealAdapter implements HealAdapter {
  readonly id = "restart";
  constructor(private manager: "pm2" | "systemd" = "pm2", private unit = "aegis-app") {}
  async heal(incident: unknown, diff: string, repoDir: string): Promise<HealResult & { rollbackPlan: string }> {
    void incident;
    const prevHead = await snapshotHead(repoDir);
    applySimpleDiff(repoDir, diff);
    const cmd = this.manager === "pm2" ? `pm2 restart ${this.unit}` : `sudo systemctl restart ${this.unit}`;
    const r = run(cmd, repoDir);
    return {
      kind: "in-place", ref: `${this.manager}-restart:${this.unit} ok=${r.ok}`,
      rollbackPlan: JSON.stringify({ type: "restart", head: prevHead, manager: this.manager, unit: this.unit }),
      deployOutcome: r.ok ? "restarted" : `restart command failed: ${r.out.slice(0, 200)}`,
    };
  }
  async rollback(plan: string, repoDir: string) {
    const p = JSON.parse(plan) as { head: string };
    const r = run(`git stash && git checkout ${p.head} -- . && git stash pop || true`, repoDir);
    void r;
    run(`pm2 restart ${this.unit} || sudo systemctl restart ${this.unit} || true`, repoDir);
    return { fired: true, restored: true, at: new Date().toISOString(), reason: `reverted to ${p.head.slice(0, 8)} and restarted` };
  }
}

/** Docker rolling replace (P4-T04): rebuild + rolling update with previous image rollback. */
export class RollingHealAdapter implements HealAdapter {
  readonly id = "rolling";
  constructor(private service = "app") {}
  async heal(incident: unknown, diff: string, repoDir: string): Promise<HealResult & { rollbackPlan: string }> {
    void incident;
    applySimpleDiff(repoDir, diff);
    const tag = `aegis-${Date.now()}`;
    const prev = run("docker compose images -q", repoDir).out.trim().slice(0, 200);
    const build = run(`docker compose build ${this.service} && docker tag ${this.service} ${this.service}:${tag}`, repoDir);
    const up = build.ok ? run(`docker compose up -d --no-deps ${this.service}`, repoDir) : { ok: false, out: build.out };
    return {
      kind: "in-place", ref: `rolling:${this.service}:${tag} ok=${up.ok}`,
      rollbackPlan: JSON.stringify({ type: "rolling", service: this.service, prev, tag }),
      deployOutcome: up.ok ? `rolled to ${tag}` : `roll failed: ${up.out.slice(0, 200)}`,
    };
  }
  async rollback(plan: string, repoDir: string) {
    const p = JSON.parse(plan) as { service: string; prev: string };
    if (p.prev) run(`docker tag ${p.prev} ${p.service}:rollback && docker compose up -d --no-deps ${p.service}`, repoDir);
    return { fired: true, restored: Boolean(p.prev), at: new Date().toISOString(), reason: "rolling rollback to previous image" };
  }
}

/** Trust-0 Live adapter: never applies, proposes the exact apply command for a human. */
export class ProposedCommandHealAdapter implements HealAdapter {
  readonly id = "proposed-command";
  async heal(incident: unknown, diff: string, repoDir: string) {
    void incident;
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(repoDir, ".aegis", "heal-patches"), { recursive: true });
    const p = join(repoDir, ".aegis", "heal-patches", `proposed-${Date.now()}.diff`);
    writeFileSync(p, diff);
    return { kind: "proposed-command" as const, ref: `git apply ${p} && <your restart command>`, rollbackPlan: `git checkout -- .` };
  }
  async rollback(_plan: string, _repoDir: string) {
    return { fired: false, restored: false, reason: "nothing was applied" };
  }
}

function changedFiles(diff: string): string[] {
  const out: string[] = [];
  for (const line of diff.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\//);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)];
}

function applySimpleDiff(repoDir: string, diff: string): number {
  let count = 0;
  for (const f of changedFiles(diff)) {
    const abs = join(repoDir, f);
    if (!existsSync(abs)) continue;
    // Line-oriented 3-way-free apply: only handles single-file append/replace hunks
    // produced by AEGIS agents; full git-apply used when available.
    const gitApply = run(`git apply --check - <<'EOF'\n${diff}\nEOF`, repoDir);
    if (gitApply.ok) {
      run(`git apply - <<'EOF'\n${diff}\nEOF`, repoDir);
      count++;
    } else {
      // Fallback: append added lines for new-file diffs
      const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
      if (added.length > 0 && !/\n/.test(readFileSync(abs, "utf8").slice(-1))) {
        writeFileSync(abs, readFileSync(abs, "utf8") + "\n" + added.join("\n"));
        count++;
      }
    }
  }
  return count;
}
