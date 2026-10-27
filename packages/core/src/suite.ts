// Test-suite detection order (D-15): explicit config > auto-detect > locked-test-only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SuitePlan {
  command: string;
  mode: "configured" | "auto-detected" | "locked-only";
  note: string;
}

export function detectTestSuite(repoDir: string, configured?: string): SuitePlan {
  if (configured && configured.trim()) {
    return { command: configured.trim(), mode: "configured", note: "explicit command from .aegis/config.yml" };
  }
  const pkgPath = join(repoDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.test) {
        return { command: "npm test -- --run", mode: "auto-detected", note: "package.json test script" };
      }
    } catch { /* fall through */ }
  }
  if (existsSync(join(repoDir, "pytest.ini")) || existsSync(join(repoDir, "pyproject.toml"))) {
    return { command: "pytest -q", mode: "auto-detected", note: "python project" };
  }
  return {
    command: "__locked_only__",
    mode: "locked-only",
    note: "full suite not run — not configured",
  };
}
