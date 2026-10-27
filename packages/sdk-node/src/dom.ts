// DOM observer sensor for SPA targets (P4-T01): captures client-side error state.
// Framework-agnostic; runs in the browser. Emits sensor-compatible events.
export interface DomSnapshot {
  url: string;
  at: string;
  readyState: string;
  errorCount: number;
  lastError?: string;
  bodyTextLength: number;
  markers: Record<string, boolean>;
}

export interface DomObserverOptions {
  app?: string;
  markers?: string[];
  onEvent?: (e: { kind: "dom"; snapshot: DomSnapshot }) => void;
  pollMs?: number;
}

export function snapshotDom(doc: Document, loc: Location, markers: string[] = []): DomSnapshot {
  const found: Record<string, boolean> = {};
  for (const m of markers) {
    found[m] = doc.querySelector(m) !== null;
  }
  const errors = (doc.querySelectorAll("[data-aegis-error]").length) +
    (loc.href.includes("error") ? 1 : 0);
  return {
    url: loc.href,
    at: new Date().toISOString(),
    readyState: doc.readyState,
    errorCount: errors,
    bodyTextLength: (doc.body?.textContent ?? "").length,
    markers: found,
  };
}

export function startDomObserver(
  doc: Document,
  loc: Location,
  opts: DomObserverOptions = {},
): { stop: () => void; snapshot: () => DomSnapshot } {
  let last: DomSnapshot | null = null;
  const errors: string[] = [];
  const onError = (e: ErrorEvent) => {
    errors.push(String(e.message ?? e.error));
  };
  doc.defaultView?.addEventListener("error", onError as EventListener);
  const tick = () => {
    const snap = snapshotDom(doc, loc, opts.markers ?? []);
    snap.errorCount += errors.length;
    if (errors.length > 0) snap.lastError = errors[errors.length - 1];
    if (opts.onEvent && (!last || snap.errorCount !== last.errorCount)) {
      opts.onEvent({ kind: "dom", snapshot: snap });
    }
    last = snap;
  };
  const timer = setInterval(tick, opts.pollMs ?? 2000);
  if (typeof (timer as unknown as { unref?: () => void }).unref === "function") {
    (timer as unknown as { unref: () => void }).unref();
  }
  return {
    stop: () => {
      clearInterval(timer);
      doc.defaultView?.removeEventListener("error", onError as EventListener);
    },
    snapshot: () => snapshotDom(doc, loc, opts.markers ?? []),
  };
}

/** Non-crash detector: HTTP 200 body that represents a failure state. */
export function isBadStateBody(body: unknown): boolean {
  if (body === null || body === undefined) return false;
  if (typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.loaded === true && (b.cart === null || b.error === true || b.ok === false);
}
