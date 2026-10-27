// Deploy verification after merged heals (P2-T06): confirm the platform deployed the merge.
import { execFileSync } from "node:child_process";

export interface DeployCheck {
  ok: boolean;
  outcome: string;
}

export async function verifyDeploy(opts: {
  repoDir: string;
  healthUrl?: string;
  checkCommand?: string;
  timeoutMs?: number;
}): Promise<DeployCheck> {
  if (opts.checkCommand) {
    try {
      execFileSync(opts.checkCommand, { cwd: opts.repoDir, shell: true, timeout: opts.timeoutMs ?? 60_000, encoding: "utf8" });
      return { ok: true, outcome: "deploy check command passed" };
    } catch (e) {
      return { ok: false, outcome: `deploy check failed: ${String((e as Error).message).slice(0, 300)}` };
    }
  }
  if (opts.healthUrl) {
    try {
      const res = await fetch(opts.healthUrl, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
      return res.ok
        ? { ok: true, outcome: `health ${opts.healthUrl} → ${res.status}` }
        : { ok: false, outcome: `health ${opts.healthUrl} → ${res.status} — escalated` };
    } catch (e) {
      return { ok: false, outcome: `health unreachable: ${String((e as Error).message).slice(0, 200)} — escalated` };
    }
  }
  return { ok: true, outcome: "no deploy check configured — merge recorded, deploy unverified (see card)" };
}
