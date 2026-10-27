import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sdkPy = join(here, "..", "aegis_sdk.py");

function findPython(): string | null {
  for (const bin of ["python", "python3", "py"]) {
    try {
      execFileSync(`${bin} --version`, { stdio: "ignore", shell: true });
      return bin;
    } catch { /* try next */ }
  }
  return null;
}

describe("P4-T03 sdk-python (same event contract)", () => {
  it("emits exception + invariant events via the python interpreter", () => {
    const python = findPython();
    if (!python) {
      console.log("SKIP: no python interpreter");
      return;
    }
    expect(existsSync(sdkPy)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "pysdk-"));
    const script = join(dir, "probe.py");
    writeFileSync(
      script,
      [
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(join(here, ".."))})`,
        "from aegis_sdk import init_sensors, invariant",
        "seen = []",
        "api = init_sensors(app='py-shop', on_event=seen.append)",
        "api['emit']('exception', stack_trace='ValueError: bad\\n  File x.py line 1', message='sk-abcdefghijklmnop')",
        "invariant(api['emit'], False, 'stock', 'expected >= 0')",
        "print(len(seen))",
        "print('REDACTED' if 'sk-abcdefghijklmnop' not in str(seen) else 'LEAK')",
        "",
      ].join("\n"),
    );
    const out = execFileSync(`${python} ${JSON.stringify(script)}`, { shell: true, encoding: "utf8", cwd: dir });
    expect(out).toContain("2");
    expect(out).toContain("REDACTED");
  });
});
