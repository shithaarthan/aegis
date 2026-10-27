// @aegis/sdk-node: embedded sensors for Node/TS apps (P3-T02).
// Exception hook, invariant checks API, action log (ring buffer, privacy-safe defaults).
export interface SensorEvent {
  kind: "exception" | "invariant" | "action-log";
  app: string;
  at: string;
  stackTrace?: string;
  message?: string;
  invariant?: string;
  route?: string;
  actionLog?: string[];
}

export interface SensorOptions {
  app?: string;
  endpoint?: string;
  actionLogSize?: number;
  captureUncaught?: boolean;
  onEvent?: (e: SensorEvent) => void;
}

const BERNOULLI_SCRUB = [/sk-[A-Za-z0-9-_]{8,}/g, /bearer\s+[A-Za-z0-9-_.~+/=]{8,}/gi];

function scrub(text: string): string {
  let out = text;
  for (const re of BERNOULLI_SCRUB) out = out.replace(re, "[redacted]");
  return out.slice(0, 8000);
}

export class ActionLog {
  private buf: string[] = [];
  constructor(private max = 200) {}
  record(entry: string): void {
    this.buf.push(`${new Date().toISOString()} ${scrub(entry)}`);
    if (this.buf.length > this.max) this.buf.shift();
  }
  snapshot(): string[] {
    return [...this.buf];
  }
}

let installed = false;

export function initSensors(opts: SensorOptions = {}): { actionLog: ActionLog; emit: (e: Omit<SensorEvent, "app" | "at">) => void } {
  const app = opts.app ?? process.env.AEGIS_APP ?? "app";
  const actionLog = new ActionLog(opts.actionLogSize ?? 200);
  const emit = (e: Omit<SensorEvent, "app" | "at">) => {
    const full: SensorEvent = {
      ...e, app, at: new Date().toISOString(),
      stackTrace: e.stackTrace ? scrub(e.stackTrace) : undefined,
      message: e.message ? scrub(e.message) : undefined,
      actionLog: actionLog.snapshot(),
    };
    if (opts.onEvent) {
      opts.onEvent(full);
      return;
    }
    const endpoint = opts.endpoint ?? process.env.AEGIS_DAEMON_URL;
    if (endpoint) {
      void fetch(`${endpoint}/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(full),
      }).catch(() => {});
    }
  };
  if (opts.captureUncaught !== false && !installed) {
    installed = true;
    process.on("uncaughtException", (err) => {
      emit({ kind: "exception", stackTrace: String(err?.stack ?? err) });
    });
    process.on("unhandledRejection", (reason) => {
      emit({ kind: "exception", stackTrace: String((reason as Error)?.stack ?? reason) });
    });
  }
  return { actionLog, emit };
}

/** Invariant check: records a sensor event when `cond` is false. Returns cond. */
export function invariant(emit: (e: Omit<SensorEvent, "app" | "at">) => void, cond: boolean, name: string, detail = ""): boolean {
  if (!cond) {
    emit({ kind: "invariant", invariant: `${name}: ${detail}`.slice(0, 500) });
  }
  return cond;
}

/** Wrap an HTTP handler to capture route + exceptions. Framework-agnostic. */
export function wrapHandler<H extends (req: unknown, res: unknown) => unknown>(
  handler: H,
  emit: (e: Omit<SensorEvent, "app" | "at">) => void,
  routeOf?: (req: unknown) => string,
): H {
  const wrapped = (async (req: unknown, res: unknown) => {
    try {
      return await handler(req, res);
    } catch (err) {
      emit({
        kind: "exception",
        stackTrace: String((err as Error)?.stack ?? err),
        route: routeOf ? routeOf(req) : undefined,
      });
      throw err;
    }
  }) as H;
  return wrapped;
}
export * from "./dom.js";
