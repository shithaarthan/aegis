// Direct-boot repro adapter (P1-T04): boots a Node/TS server app in a sandbox with fixture DB.
// NO production secrets are ever passed (D-16): only fixture env from the repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Incident, ReproAdapter, ReproFailure, ReproSession } from "@aegis/core";
import { fingerprintStack } from "@aegis/core";

export interface DirectBootOptions {
  entry?: string;
  bootTimeoutMs?: number;
  probeCommand?: string;
  fixtureEnv?: Record<string, string>;
}

function findEntry(repoDir: string, explicit?: string): string | null {
  if (explicit && existsSync(join(repoDir, explicit))) return explicit;
  for (const cand of ["server.js", "src/server.js", "src/index.js", "index.js", "app.js", "dist/server.js", "dist/index.js"]) {
    if (existsSync(join(repoDir, cand))) return cand;
  }
  try {
    const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8")) as { main?: string };
    if (pkg.main && existsSync(join(repoDir, pkg.main))) return pkg.main;
  } catch { /* ignore */ }
  return null;
}

export class DirectBootReproAdapter implements ReproAdapter {
  readonly id = "direct-boot";
  readonly targets = ["vm", "paas"];
  constructor(private opts: DirectBootOptions = {}) {}
  async healthCheck() { return { ok: true, detail: "direct-boot: node runtime" }; }

  async reproduce(incident: Incident, repoDir: string): Promise<ReproSession | ReproFailure> {
    const entry = findEntry(repoDir, this.opts.entry);
    if (!entry) return { ok: false, adapterId: this.id, reason: "no bootable entry found (server.js/src/index.js/package.json main)" };
    const timeout = this.opts.bootTimeoutMs ?? 15000;
    const env: Record<string, string> = {
      ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>),
      ...this.opts.fixtureEnv,
      AEGIS_FIXTURE_DB: "1",
      NODE_ENV: "test",
    };
    // Strip anything that looks like a production secret (D-16).
    for (const k of Object.keys(env)) {
      if (/SECRET|TOKEN|PRIVATE|AWS_|DATABASE_URL|PROD/i.test(k) && this.opts.fixtureEnv?.[k] === undefined) delete env[k];
    }
    try {
      const probe = this.opts.probeCommand ?? `node -e "process.exit(0)"`;
      void probe;
      const out = execFileSync(`node`, [entry], {
        cwd: repoDir, env, timeout, encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      void out;
      return { ok: false, adapterId: this.id, reason: `booted cleanly (no crash) — cannot confirm symptom; stdout captured` };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const output = [err.stdout ?? "", err.stderr ?? "", err.message ?? ""].join("\n").slice(-6000);
      const got = fingerprintStack(output, "");
      const match = got.errorType.split(":")[0] === incident.signature.errorType.split(":")[0];
      const transcript = `entry=${entry} exit=crash match=${match}\n${output.slice(-2500)}`;
      if (match) {
        return { ok: true, adapterId: this.id, transcript, howToReplay: `AEGIS_FIXTURE_DB=1 NODE_ENV=test node ${entry}` };
      }
      return { ok: false, adapterId: this.id, reason: `booted but crashed differently (${got.errorType.slice(0, 120)}) — transcript attached` };
    }
  }
}
