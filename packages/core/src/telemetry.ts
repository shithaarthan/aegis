// Opt-in anonymous telemetry (P5-T05): off by default; on = only documented fields.
export interface TelemetryEvent {
  event: "heal" | "terminal" | "install";
  edition: "agent" | "live";
  target: string;
  outcome: string;
  durationMs: number;
  tokens: number;
  aegisVersion: string;
}

let enabled = false;

export function setTelemetryEnabled(v: boolean): void { enabled = v; }
export function isTelemetryEnabled(): boolean { return enabled; }

/** Returns the payload that WOULD be sent, or null when disabled (zero calls). */
export function captureTelemetry(e: TelemetryEvent): Record<string, unknown> | null {
  if (!enabled) return null;
  const { event, edition, target, outcome, durationMs, tokens, aegisVersion } = e;
  return { event, edition, target, outcome, durationMs, tokens, aegisVersion };
}
