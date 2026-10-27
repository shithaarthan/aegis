// Rollback watch engine for Live heals (D-18): 15-min window, auto git revert + reload.
import { execFileSync } from "node:child_process";

export interface WatchConfig {
  windowMinutes: number;
  healthUrl?: string;
  checkCommand?: string;
}

export interface WatchOutcome {
  clean: boolean;
  reason?: string;
}

export async function pollHealth(cfg: WatchConfig): Promise<WatchOutcome> {
  try {
    if (cfg.checkCommand) {
      execFileSync(cfg.checkCommand, { shell: true, timeout: 15_000, encoding: "utf8" });
      return { clean: true };
    }
    if (cfg.healthUrl) {
      const res = await fetch(cfg.healthUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return { clean: false, reason: `health endpoint ${res.status}` };
      return { clean: true };
    }
    return { clean: true, reason: "no probes configured — window elapsed without signal" };
  } catch (e) {
    return { clean: false, reason: (e as Error).message.slice(0, 200) };
  }
}

/** Short-circuitable watch used by tests/drills: checks run back-to-back. */
export async function runWatchWindow(
  cfg: WatchConfig,
  onRegression: (reason: string) => Promise<void>,
  probes = 3,
): Promise<{ rolledBack: boolean; reason?: string }> {
  for (let i = 0; i < probes; i++) {
    const w = await pollHealth(cfg);
    if (!w.clean) {
      await onRegression(w.reason ?? "probe failed");
      return { rolledBack: true, reason: w.reason };
    }
  }
  void cfg.windowMinutes;
  return { rolledBack: false };
}

export function gitRevertLast(repoDir: string): { ok: boolean; output: string } {
  try {
    const out = execFileSync("git revert --no-edit HEAD", { cwd: repoDir, encoding: "utf8", timeout: 30_000 });
    return { ok: true, output: String(out).slice(0, 1000) };
  } catch (e) {
    return { ok: false, output: String((e as Error).message).slice(0, 1000) };
  }
}
