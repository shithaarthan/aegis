// Generic log-scraper + Cloudflare Workers logpush detect adapters (P2-T04).
import type { DetectAdapter, Incident } from "@aegis/core";
import { makeIncident } from "./common.js";

const ERROR_LINE = /(Error|Exception|FATAL|panic|UnhandledPromiseRejection|Traceback)(:|\s)/;

export function scrapeLogText(logs: string, contextLines = 6): { stack: string; route: string }[] {
  const lines = logs.split("\n");
  const hits: { stack: string; route: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (ERROR_LINE.test(lines[i])) {
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length, i + contextLines);
      const chunk = lines.slice(start, end).join("\n").slice(0, 4000);
      const route = (chunk.match(/(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/) ?? [])[2] ?? "";
      hits.push({ stack: chunk, route });
      i = end;
    }
  }
  return hits.slice(0, 10);
}

export class LogScraperAdapter implements DetectAdapter {
  readonly id = "log-scraper";
  readonly sourceType = "logs";
  constructor(private repo: string, private app: string) {}
  async healthCheck() { return { ok: true, detail: "log scraper: stateless" }; }
  normalize(raw: unknown): Incident[] {
    const logs = typeof raw === "string" ? raw : String((raw as { logs?: string }).logs ?? "");
    return scrapeLogText(logs).map((h) => makeIncident({
      source: this.id, edition: "agent", repo: this.repo, app: this.app,
      stackTrace: h.stack, route: h.route, logs: logs.slice(0, 8000),
    }));
  }
}

export class WorkersLogpushAdapter implements DetectAdapter {
  readonly id = "workers-logpush";
  readonly sourceType = "workers";
  constructor(private repo: string, private app: string) {}
  async healthCheck() { return { ok: true, detail: "workers logpush: normalize" }; }
  normalize(raw: unknown): Incident[] {
    // Wrangler tail / logpush event batch.
    const batch = Array.isArray(raw) ? raw : [raw];
    return (batch as { message?: string; exception?: string; request?: { url?: string } }[])
      .filter((e) => e.message || e.exception)
      .slice(0, 10)
      .map((e) => makeIncident({
        source: this.id, edition: "agent", repo: this.repo, app: this.app,
        stackTrace: e.exception ?? e.message ?? "worker error", route: e.request?.url ?? "",
      }));
  }
}
