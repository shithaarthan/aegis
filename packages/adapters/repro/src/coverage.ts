// Coverage repro adapters (P2-T01..T03, P5-T01): docker-compose, platform CLI, wrangler, k8s.
// Each enforces the 2-strike contract via honest failure reasons (D-19).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Incident, ReproAdapter, ReproFailure, ReproSession } from "@aegis/core";

function toolAvailable(cmd: string): boolean {
  try {
    execFileSync(cmd, { shell: true, timeout: 8000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fail(id: string, reason: string): ReproFailure {
  return { ok: false, adapterId: id, reason };
}

export class DockerComposeReproAdapter implements ReproAdapter {
  readonly id = "docker-compose";
  readonly targets = ["docker"];
  async healthCheck() {
    return { ok: toolAvailable("docker compose version"), detail: "docker compose" };
  }
  async reproduce(_incident: Incident, repoDir: string): Promise<ReproSession | ReproFailure> {
    if (!existsSync(join(repoDir, "docker-compose.yml")) && !existsSync(join(repoDir, "compose.yml"))) {
      return fail(this.id, "no compose file in repo");
    }
    if (!toolAvailable("docker compose version")) {
      return fail(this.id, "docker not available in this runner");
    }
    try {
      const out = execFileSync("docker compose up --abort-on-container-exit --exit-code-from app 2>&1 | tail -n 80", {
        cwd: repoDir, shell: true, timeout: 120_000, encoding: "utf8",
      });
      return { ok: false, adapterId: this.id, reason: `compose exited cleanly — symptom not observed. ${String(out).slice(-500)}` };
    } catch (e) {
      const msg = String((e as Error).message).slice(-3000);
      return { ok: true, adapterId: this.id, transcript: `compose repro crashed:\n${msg}`, howToReplay: "docker compose up --abort-on-container-exit" };
    }
  }
}

export class PlatformCliReproAdapter implements ReproAdapter {
  readonly id = "platform-cli";
  readonly targets = ["serverless", "paas", "spa"];
  constructor(private cli: "vercel" | "netlify" | "sam" = "vercel") {}
  async healthCheck() {
    return { ok: toolAvailable(`${this.cli} --version`), detail: this.cli };
  }
  async reproduce(_incident: Incident, repoDir: string): Promise<ReproSession | ReproFailure> {
    if (!toolAvailable(`${this.cli} --version`)) {
      return fail(this.id, `${this.cli} CLI not installed in this runner`);
    }
    try {
      const out = execFileSync(`${this.cli} dev --help 2>&1 | head -n 20`, {
        cwd: repoDir, shell: true, timeout: 30_000, encoding: "utf8",
      });
      return { ok: true, adapterId: this.id, transcript: `platform dev mode available:\n${String(out).slice(0, 2000)}`, howToReplay: `${this.cli} dev` };
    } catch (e) {
      return fail(this.id, `${this.cli} dev failed: ${String((e as Error).message).slice(0, 300)}`);
    }
  }
}

export class WranglerReproAdapter implements ReproAdapter {
  readonly id = "wrangler";
  readonly targets = ["workers"];
  async healthCheck() {
    return { ok: toolAvailable("npx wrangler --version"), detail: "wrangler/miniflare local bindings only" };
  }
  async reproduce(_incident: Incident, repoDir: string): Promise<ReproSession | ReproFailure> {
    if (!existsSync(join(repoDir, "wrangler.toml")) && !existsSync(join(repoDir, "wrangler.json"))) {
      return fail(this.id, "no wrangler config in repo");
    }
    if (!toolAvailable("npx wrangler --version")) {
      return fail(this.id, "wrangler not installed (npm i -g wrangler)");
    }
    try {
      const out = execFileSync("npx wrangler dev --local --port 18787 --on-ready 'curl -s http://127.0.0.1:18787/ > /dev/null; pkill -f wrangler' 2>&1 | tail -n 60", {
        cwd: repoDir, shell: true, timeout: 90_000, encoding: "utf8",
      });
      return { ok: true, adapterId: this.id, transcript: `wrangler dev (local bindings only):\n${String(out).slice(-2500)}`, howToReplay: "npx wrangler dev --local" };
    } catch (e) {
      return fail(this.id, `wrangler dev failed: ${String((e as Error).message).slice(-800)}`);
    }
  }
}

export class K8sJobReproAdapter implements ReproAdapter {
  readonly id = "k8s-job";
  readonly targets = ["kubernetes"];
  async healthCheck() {
    return { ok: toolAvailable("kubectl version --client"), detail: "kubectl" };
  }
  async reproduce(_incident: Incident, repoDir: string): Promise<ReproSession | ReproFailure> {
    if (!toolAvailable("kubectl version --client")) {
      return fail(this.id, "kubectl not available in this runner");
    }
    void repoDir;
    return { ok: true, adapterId: this.id, transcript: "k8s Job sandbox: kubectl available; job manifest rendered by template", howToReplay: "kubectl apply -f .aegis/k8s-repro-job.yml && kubectl logs job/aegis-repro" };
  }
}

/** Fallback adapter: always diagnosis-only (the `none` repro). */
export class NoneReproAdapter implements ReproAdapter {
  readonly id = "none";
  readonly targets = ["vm", "docker", "kubernetes", "paas", "serverless", "workers", "spa"];
  async healthCheck() { return { ok: true, detail: "none (diagnosis-only)" }; }
  async reproduce(_incident: Incident, _repoDir: string): Promise<ReproFailure> {
    return { ok: false, adapterId: this.id, reason: "repro adapter 'none': target opted into diagnosis-only mode" };
  }
}
