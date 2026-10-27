// Config schema .aegis/config.yml (D-08). Hand-rolled validation, readable errors.
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { AegisConfig } from "./types.js";

const TARGETS = ["vm", "docker", "kubernetes", "paas", "serverless", "workers", "spa"];
const SOURCES = ["sentry", "glitchtip", "bugsnag", "sensors", "log-scraper", "workers-logpush"];

export function defaultConfig(over: Partial<AegisConfig> = {}): AegisConfig {
  return {
    schemaVersion: 1,
    edition: "agent",
    target: "vm",
    errorSource: "sentry",
    reproAdapter: "direct-boot",
    healAdapter: "pr",
    trustLevel: 0,
    dailyQuota: 10,
    tokenCeilingPerIncident: 200_000,
    patchMaxAttempts: 3,
    patchWallClockMs: 20 * 60 * 1000,
    rollbackWatchMinutes: 15,
    ...over,
  };
}

export function validateConfig(raw: unknown): { ok: true; config: AegisConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["config must be a mapping"] };
  const c = raw as Record<string, unknown>;
  const need = (k: string, pred: (v: unknown) => boolean, msg: string) => {
    if (!pred(c[k])) errors.push(`.${k}: ${msg}`);
  };
  need("schemaVersion", (v) => v === 1, "must be 1");
  need("edition", (v) => v === "agent" || v === "live", 'must be "agent" or "live"');
  need("target", (v) => TARGETS.includes(v as string), `must be one of ${TARGETS.join(", ")}`);
  need("errorSource", (v) => SOURCES.includes(v as string), `must be one of ${SOURCES.join(", ")}`);
  need("reproAdapter", (v) => typeof v === "string" && v.length > 0, "must be a non-empty string");
  need("healAdapter", (v) => typeof v === "string" && v.length > 0, "must be a non-empty string");
  need("trustLevel", (v) => v === 0 || v === 1 || v === 2, "must be 0, 1 or 2");
  need("dailyQuota", (v) => Number.isInteger(v) && (v as number) >= 0, "must be a non-negative integer");
  need("tokenCeilingPerIncident", (v) => Number.isInteger(v) && (v as number) > 0, "must be a positive integer");
  need("patchMaxAttempts", (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5, "must be an integer 1..5");
  need("patchWallClockMs", (v) => Number.isInteger(v) && (v as number) > 0, "must be a positive integer (ms)");
  if (c.testCommand !== undefined && typeof c.testCommand !== "string") errors.push(".testCommand: must be a string");
  if (c.ignore !== undefined && !Array.isArray(c.ignore)) errors.push(".ignore: must be a list of strings");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: c as unknown as AegisConfig };
}

export function loadConfigFile(path: string): AegisConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`AEGIS config not found at ${path}. Run \`aegis init\` first.`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    throw new Error(`AEGIS config at ${path} is not valid YAML: ${(e as Error).message}`);
  }
  const v = validateConfig(raw);
  if (!v.ok) {
    throw new Error(`Invalid AEGIS config at ${path}:\n` + v.errors.map((e) => `  - ${e}`).join("\n"));
  }
  return v.config;
}

export function configToYaml(c: AegisConfig): string {
  const lines = [
    `# AEGIS config (schema v${c.schemaVersion}) — created by \`aegis init\`.`,
    `schemaVersion: ${c.schemaVersion}`,
    `edition: ${c.edition}`,
    `target: ${c.target}`,
    `errorSource: ${c.errorSource}`,
    `reproAdapter: ${c.reproAdapter}`,
    `healAdapter: ${c.healAdapter}`,
    `trustLevel: ${c.trustLevel}`,
    `dailyQuota: ${c.dailyQuota}`,
    `tokenCeilingPerIncident: ${c.tokenCeilingPerIncident}`,
    `patchMaxAttempts: ${c.patchMaxAttempts}`,
    `patchWallClockMs: ${c.patchWallClockMs}`,
    ...(c.testCommand ? [`testCommand: ${JSON.stringify(c.testCommand)}`] : []),
    ...(c.ignore?.length ? [`ignore:`, ...c.ignore.map((s) => `  - ${JSON.stringify(s)}`)] : []),
    ...(c.rollbackWatchMinutes !== undefined ? [`rollbackWatchMinutes: ${c.rollbackWatchMinutes}`] : []),
    ``,
  ];
  return lines.join("\n");
}
