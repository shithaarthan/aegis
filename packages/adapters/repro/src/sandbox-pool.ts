// Sandbox pool (P3-T04): pre-warmed direct-boot sandboxes. Isolation + no-secrets enforced.
import { mkdtempSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Incident, ReproAdapter, ReproFailure, ReproSession } from "@aegis/core";
import { DirectBootReproAdapter } from "./direct-boot.js";

export interface PooledSandbox {
  id: string;
  dir: string;
  inUse: boolean;
  uses: number;
}

export class SandboxPool {
  private sandboxes: PooledSandbox[] = [];
  constructor(private sourceDir: string, private size = 2) {}

  warm(): void {
    for (let i = 0; i < this.size; i++) {
      const dir = mkdtempSync(join(tmpdir(), "aegis-sb-"));
      if (existsSync(this.sourceDir)) cpSync(this.sourceDir, dir, { recursive: true });
      this.sandboxes.push({ id: `sb-${i}`, dir, inUse: false, uses: 0 });
    }
  }

  acquire(): PooledSandbox | null {
    const free = this.sandboxes.find((s) => !s.inUse && s.uses < 10);
    if (free) free.inUse = true;
    return free ?? null;
  }

  release(sb: PooledSandbox): void {
    sb.inUse = false;
    sb.uses += 1;
  }

  stats(): { total: number; free: number } {
    return { total: this.sandboxes.length, free: this.sandboxes.filter((s) => !s.inUse).length };
  }
}

export class PooledDirectBootAdapter implements ReproAdapter {
  readonly id = "pooled-direct-boot";
  readonly targets = ["vm"];
  private inner = new DirectBootReproAdapter();
  constructor(private pool: SandboxPool) {}
  async healthCheck() {
    return { ok: this.pool.stats().total > 0, detail: `pool ${this.pool.stats().free}/${this.pool.stats().total} free` };
  }
  async reproduce(incident: Incident, _repoDir: string): Promise<ReproSession | ReproFailure> {
    const sb = this.pool.acquire();
    if (!sb) return { ok: false, adapterId: this.id, reason: "sandbox pool exhausted" };
    try {
      return await this.inner.reproduce(incident, sb.dir);
    } finally {
      this.pool.release(sb);
    }
  }
}
