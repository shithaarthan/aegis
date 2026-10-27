// Safety rails (D-16, D-20): quota, token ceiling, attempts, kill switch, ignore lists.
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { AegisConfig } from "./types.js";

export interface QuotaState { date: string; used: number; }

export function todayDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function quotaAllows(state: QuotaState, config: AegisConfig, today = todayDay()): boolean {
  const used = state.date === today ? state.used : 0;
  return used < config.dailyQuota;
}

export function recordQuotaUse(state: QuotaState, today = todayDay()): QuotaState {
  if (state.date !== today) return { date: today, used: 1 };
  return { date: state.date, used: state.used + 1 };
}

export function isIgnored(text: string, patterns: string[] = []): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p).test(text);
    } catch {
      return text.includes(p);
    }
  });
}

export function tokensExceeded(tokensUsed: number, config: AegisConfig): boolean {
  return tokensUsed >= config.tokenCeilingPerIncident;
}

export function attemptsExhausted(attempts: number, config: AegisConfig): boolean {
  return attempts >= config.patchMaxAttempts;
}

// Kill switch: `.aegis/PAUSED` file. `aegis pause` creates it; stages check it.
export function isPaused(repoDir: string): boolean {
  return existsSync(`${repoDir}/.aegis/PAUSED`);
}

export function setPaused(repoDir: string, paused: boolean, reason = ""): void {
  mkdirSync(`${repoDir}/.aegis`, { recursive: true });
  const p = `${repoDir}/.aegis/PAUSED`;
  if (paused) {
    writeFileSync(p, JSON.stringify({ at: new Date().toISOString(), reason }));
  } else {
    try {
      unlinkSync(p);
    } catch { /* already unpaused */ }
  }
}

export function readPausedReason(repoDir: string): string {
  try {
    return readFileSync(`${repoDir}/.aegis/PAUSED`, "utf8");
  } catch {
    return "";
  }
}
