import { describe, it, expect } from "vitest";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DirectBootReproAdapter, DockerComposeReproAdapter, PlatformCliReproAdapter,
  WranglerReproAdapter, K8sJobReproAdapter, NoneReproAdapter, SandboxPool, PooledDirectBootAdapter,
} from "../src/index.js";
import { conformRepro } from "@aegis/core";
import type { ReproAdapter } from "@aegis/core";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "..", "examples");

function incident(stack: string): never {
  return {
    id: "inc_m", signature: { fingerprint: "m", errorType: stack.split(":")[0] + ":", topFrames: [], route: "/" },
    evidence: { stackTrace: stack },
  } as never;
}

function copyExample(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mx-${name}-`));
  cpSync(join(examplesDir, name), dir, { recursive: true });
  return dir;
}

describe("P1-T04 direct-boot vs seeded vm-app", () => {
  it("reproduces the seeded crash with fixture fault env", async () => {
    const dir = copyExample("vm-app");
    const adapter = new DirectBootReproAdapter({
      entry: "src/server.js",
      fixtureEnv: { AEGIS_SEED_FAULT: "1", PORT: "18911" },
    });
    const stack = "TypeError: Cannot read properties of undefined (reading 'trim')\n    at getUserName (/app/src/server.js:12:15)";
    const r = await adapter.reproduce(incident(stack), dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transcript).toContain("match=true");
  });
  it("reports honestly when boot is clean", async () => {
    const dir = copyExample("vm-app");
    const r = await new DirectBootReproAdapter({ entry: "src/server.js", bootTimeoutMs: 8000, fixtureEnv: { PORT: "18912" } }).reproduce(
      incident("TypeError: nope"),
      dir,
    );
    expect(r.ok).toBe(false);
  });
  it("passes conformance kit", async () => {
    const r = await conformRepro(
      new DirectBootReproAdapter({ fixtureEnv: { AEGIS_SEED_FAULT: "1", PORT: "18913" } }),
      incident("TypeError: Cannot read properties of undefined (reading 'trim')\n    at getUserName (x.js:1:1)"),
      copyExample("vm-app"),
    );
    expect(r.pass).toBe(true);
  });
});

describe("P2-T09 matrix integration suite", () => {
  it("all repro adapters return session-or-reason (contract)", async () => {
    const cases: [string, ReproAdapter, string][] = [
      ["vm-app", new DirectBootReproAdapter({ entry: "src/server.js", fixtureEnv: { AEGIS_SEED_FAULT: "1", PORT: "18914" } }), "TypeError: x"],
      ["paas-app", new DirectBootReproAdapter({ entry: "server.js", fixtureEnv: { AEGIS_SEED_FAULT: "1", PORT: "18915" } }), "TypeError: x"],
      ["compose-app", new DockerComposeReproAdapter(), "TypeError: x"],
      ["fn-app", new PlatformCliReproAdapter("vercel"), "TypeError: x"],
      ["worker-app", new WranglerReproAdapter(), "Error: worker x"],
      ["spa-app", new NoneReproAdapter(), "Error: x"],
    ];
    for (const [ex, adapter, stack] of cases) {
      const dir = copyExample(ex);
      const r = await adapter.reproduce(incident(stack), dir);
      expect(r.adapterId).toBeTruthy();
      expect(r.ok ? typeof r.transcript === "string" : typeof r.reason === "string").toBe(true);
    }
    const k8s = await new K8sJobReproAdapter().reproduce(incident("Error: x"), mkdtempSync(join(tmpdir(), "k8s-")));
    expect(typeof (k8s.ok ? k8s.transcript : k8s.reason)).toBe("string");
  });
});

describe("P3-T04 sandbox pool", () => {
  it("reuses sandboxes and reports stats", async () => {
    const src = copyExample("vm-app");
    const pool = new SandboxPool(src, 1);
    pool.warm();
    expect(pool.stats()).toEqual({ total: 1, free: 1 });
    const r = await new PooledDirectBootAdapter(pool).reproduce(
      incident("Error: x"),
      src,
    );
    expect(typeof (r.ok ? r.transcript : r.reason)).toBe("string");
    expect(pool.stats().free).toBe(1);
  });
});
