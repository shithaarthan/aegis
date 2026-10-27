// Trust ladder enforcement (D-17). Raising a level is human-only (CLI refuses agent use).
import type { PatchAttempt } from "./types.js";

export interface TrustDecision {
  allowed: "pr-only" | "auto";
  reason: string;
}

const L1_MAX_FILES = 5;
const L1_MAX_LINES = 300;

export function decideTrust(
  level: 0 | 1 | 2,
  attempts: PatchAttempt[],
  suiteGreen: boolean,
): TrustDecision {
  const last = attempts[attempts.length - 1];
  if (!last || !suiteGreen) {
    return { allowed: "pr-only", reason: !last ? "no verified diff" : "suite is not green" };
  }
  if (level === 0) return { allowed: "pr-only", reason: "trust level 0: human merges every heal" };
  if (level === 1) {
    if (last.filesChanged <= L1_MAX_FILES && last.linesChanged <= L1_MAX_LINES) {
      return { allowed: "auto", reason: `L1 gate passed (${last.filesChanged} files, ${last.linesChanged} lines)` };
    }
    return {
      allowed: "pr-only",
      reason: `L1 gate blocked: diff ${last.filesChanged} files / ${last.linesChanged} lines exceeds ${L1_MAX_FILES} files / ${L1_MAX_LINES} lines`,
    };
  }
  return { allowed: "auto", reason: "L2: suite green, auto-apply allowed" };
}

export function diffStats(diff: string): { filesChanged: number; linesChanged: number } {
  const files = new Set<string>();
  let lines = 0;
  for (const line of diff.split("\n")) {
    const m = line.match(/^[+-]{3} [ab]?\/?(.+)$/);
    if (line.startsWith("diff --git")) {
      const mm = line.match(/diff --git a\/(.+?) b\//);
      if (mm) files.add(mm[1]);
    } else if (m && !line.startsWith("+++ ") && !line.startsWith("--- ")) {
      lines += 1;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      lines += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      lines += 1;
    }
    void m;
  }
  return { filesChanged: Math.max(files.size, diff.includes("diff --git") ? files.size : (diff.trim() ? 1 : 0)), linesChanged: lines };
}
