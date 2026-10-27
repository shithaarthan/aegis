// Daemon runner (P3-T01, P4-T06): always-on process, ingest queue, stateless stage
// execution against the queue, `pause` honored instantly at stage boundaries.
// Multi-app: one daemon, per-app config/quota/trust (P4-T06).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AegisConfig, ReproAdapter, HealAdapter, PatchAgent } from "./types.js";
import { loadConfigFile } from "./config.js";
import { isPaused } from "./safety.js";
import { fingerprintStack } from "./signature.js";
import { IngestQueue, type QueuedEvent } from "./daemon.js";
import { runPipeline } from "./pipeline.js";

export interface SensorPayload {
  kind: string;
  app?: string;
  stackTrace?: string;
  message?: string;
  invariant?: string;
  route?: string;
  repoDir?: string;
  actionLog?: string[];
}

export interface AppSlot {
  name: string;
  repoDir: string;
  config: AegisConfig;
  repro: ReproAdapter;
  heal: HealAdapter;
}

export interface DaemonOptions {
  slots: AppSlot[];
  agent: PatchAgent;
  model: import("./stages.js").ModelBackend | null;
  onIncident?: (slot: string, status: string) => void;
  pollMs?: number;
}

export function loadDaemonSlots(appDirs: string[], deps: { repro: ReproAdapter; heal: HealAdapter }): AppSlot[] {
  return appDirs.map((repoDir) => {
    const cfgPath = join(repoDir, ".aegis", "config.yml");
    const config = existsSync(cfgPath) ? loadConfigFile(cfgPath) : fallbackConfig();
    return { name: repoDir, repoDir, config, repro: deps.repro, heal: deps.heal };
  });
}

function fallbackConfig(): AegisConfig {
  return {
    schemaVersion: 1, edition: "live", target: "vm", errorSource: "sensors",
    reproAdapter: "pooled-direct-boot", healAdapter: "hot-reload",
    trustLevel: 0, dailyQuota: 10, tokenCeilingPerIncident: 200_000,
    patchMaxAttempts: 3, patchWallClockMs: 20 * 60 * 1000, rollbackWatchMinutes: 15,
  };
}

export class Daemon {
  readonly queue = new IngestQueue();
  private stopped = false;
  private quotas = new Map<string, { date: string; used: number }>();

  constructor(private opts: DaemonOptions) {}

  ingest(event: Omit<QueuedEvent, "attempts" | "at"> & { at?: string }): void {
    this.queue.enqueue({ id: event.id, kind: event.kind, payload: event.payload, at: event.at ?? new Date().toISOString() });
  }

  stop(): void {
    this.stopped = true;
  }

  /** Single pump step: dequeue one event, run stateless pipeline for its app slot. */
  async pumpOnce(): Promise<boolean> {
    const e = this.queue.dequeue();
    if (!e) return false;
    const payload = e.payload as SensorPayload;
    const slot = this.pickSlot(payload);
    if (!slot) {
      this.queue.requeue(e);
      return true;
    }
    if (isPaused(slot.repoDir)) {
      // Pause honored instantly at the stage boundary: requeue without side effects.
      return true;
    }
    const stack = payload.stackTrace ?? `${payload.kind === "invariant" ? "InvariantViolation" : "SensorError"}: ${payload.invariant ?? payload.message ?? "sensor event"}`;
    const quota = this.quotas.get(slot.name) ?? { date: new Date().toISOString().slice(0, 10), used: 0 };
    const saveQuota = (s: { date: string; used: number }) => this.quotas.set(slot.name, s);
    const res = await runPipeline(
      { stackTrace: stack, route: payload.route ?? "", source: "sensors-ingest", repo: slot.repoDir, app: slot.name },
      slot.repoDir, slot.config,
      { repro: slot.repro, heal: slot.heal, agent: this.opts.agent, model: this.opts.model, quota, saveQuota },
    );
    this.opts.onIncident?.(slot.name, res.incident.status);
    return true;
  }

  private pickSlot(payload: SensorPayload): AppSlot | null {
    if (payload.repoDir) return this.opts.slots.find((s) => s.repoDir === payload.repoDir) ?? null;
    if (this.opts.slots.length === 1) return this.opts.slots[0];
    return this.opts.slots.find((s) => s.name === (payload.app ?? "")) ?? null;
  }

  async serve(signal: AbortSignal): Promise<void> {
    const pollMs = this.opts.pollMs ?? 1000;
    while (!this.stopped && !signal.aborted) {
      const worked = await this.pumpOnce().catch(() => false);
      if (!worked) await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}

export function readJsonBody(req: { on(e: string, cb: (c: Buffer) => void): void }, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) reject(new Error("body too large"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
  });
}

export { IngestQueue };
export type { QueuedEvent };
void readFileSync;
