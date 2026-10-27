#!/usr/bin/env node
// `aegis` CLI skeleton (P0-T08, P1-T10, P3-T09): init, run, pause, status, attach.
import { Command } from "commander";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configToYaml, defaultConfig, loadConfigFile } from "./index.js";
import { setPaused, isPaused } from "./index.js";
import type { AegisConfig } from "./index.js";

const program = new Command();
program.name("aegis").description("AEGIS — self-healing software").version("1.0.0");

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((res) => {
    // Piped/closed stdin (CI, answer files): fall back to "" (caller applies
    // the documented default) instead of throwing ERR_USE_AFTER_CLOSE.
    const closed = (rl as unknown as { closed?: boolean }).closed === true;
    if (closed) {
      res("");
      return;
    }
    try {
      rl.question(q, res);
    } catch {
      res("");
      return;
    }
    rl.once("close", () => res(""));
  });
}

program.command("init").description("3-question wizard → config + workflow").action(async () => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = process.cwd();
  console.log("AEGIS init — 3 questions.");
  const where = (await ask(rl, "Where does the app run? [vm/docker/kubernetes/paas/serverless/workers/spa] (vm): ")) || "vm";
  const source = (await ask(rl, "Error source? [sentry/glitchtip/bugsnag/sensors/log-scraper] (sentry): ")) || "sentry";
  const trust = (await ask(rl, "Trust level? [0=PR-only, 1=auto-small, 2=auto] (0): ")) || "0";
  rl.close();
  const edition = source === "sensors" ? "live" : "agent";
  const cfg: AegisConfig = defaultConfig({
    edition,
    target: where as AegisConfig["target"],
    errorSource: source as AegisConfig["errorSource"],
    reproAdapter: where === "workers" ? "wrangler" : where === "docker" ? "docker-compose" : where === "serverless" ? "platform-cli" : "direct-boot",
    healAdapter: edition === "live" ? "hot-reload" : "pr",
    trustLevel: Number(trust) as 0 | 1 | 2,
  });
  mkdirSync(join(cwd, ".aegis"), { recursive: true });
  writeFileSync(join(cwd, ".aegis", "config.yml"), configToYaml(cfg));
  console.log("Wrote .aegis/config.yml");
  console.log("Synthetic self-test: run `aegis run --self-test` to prove the wiring.");
});

program.command("run").description("run the pipeline on an incident file or self-test")
  .option("--self-test", "run a synthetic incident through stubs")
  .option("--stack <file>", "file containing a stack trace")
  .action(async (opts) => {
    const cwd = process.cwd();
    const cfg = existsSync(join(cwd, ".aegis", "config.yml")) ? loadConfigFile(join(cwd, ".aegis", "config.yml")) : defaultConfig();
    const { runPipeline } = await import("./index.js");
    const { StubRepro, StubHeal, StubAgent } = await import("./stubs.js");
    const stack = opts.stack ? readFileSync(opts.stack, "utf8") : "TypeError: Cannot read properties of undefined (reading 'name')\n    at getUserName (/app/src/user.ts:12:15)";
    const repo = "self-test/repo";
    const quota = { date: new Date().toISOString().slice(0, 10), used: 0 };
    const res = await runPipeline(
      { stackTrace: stack, source: cfg.errorSource, repo, app: "self-test" },
      cwd, cfg,
      { repro: new StubRepro(true), heal: new StubHeal(), agent: new StubAgent(), model: null, quota, saveQuota() {} },
    );
    console.log(`incident ${res.incident.id} → ${res.incident.status}`);
    if (res.record) console.log(`medical record: ${res.record.hash.slice(0, 16)}…`);
  });

program.command("pause").description("pause/resume the pipeline (kill switch)")
  .option("--off", "resume")
  .option("--reason <r>", "reason", "")
  .action((opts) => {
    const cwd = process.cwd();
    setPaused(cwd, !opts.off, opts.reason);
    console.log(opts.off ? "resumed" : "paused — takes effect at the next stage boundary");
  });

program.command("status").description("show config + pause + recent incidents").action(() => {
  const cwd = process.cwd();
  const cfgPath = join(cwd, ".aegis", "config.yml");
  console.log(existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "(no .aegis/config.yml — run `aegis init`)");
  console.log(`paused: ${isPaused(cwd)}`);
});

program.command("attach").description("[live] instrument the app with the sensor SDK")
  .argument("<app>", "app directory")
  .action((app) => {
    console.log(`Attaching to ${app}: install @aegis/sdk-node, wrap your entrypoint (see docs/live-install.md).`);
    console.log(`Synthetic seeded fault will prove detect→report with no auto-heal until trust is set.`);
  });

program.parse();
