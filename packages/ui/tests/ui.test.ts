import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUiServer } from "../src/index.js";

function seedRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ui-"));
  mkdirSync(join(dir, ".aegis", "medical-record"), { recursive: true });
  writeFileSync(join(dir, ".aegis", "medical-record", "inc_1.md"), "# Incident inc_1\n\n- **Status:** REMEMBERED\n\n- **Tokens:** 10 · **Cost:** $0.0010\n");
  return dir;
}

describe("P3-T08 live UI", () => {
  it("serves incident list, card, and JSON api", async () => {
    const ui = createUiServer({ repoDir: seedRepo() });
    const port = await ui.listen(0);
    try {
      const index = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      expect(index).toContain("inc_1");
      const card = await (await fetch(`http://127.0.0.1:${port}/incident/inc_1`)).text();
      expect(card).toContain("REMEMBERED");
      const api = await (await fetch(`http://127.0.0.1:${port}/api/incidents`)).json() as { id: string }[];
      expect(api[0].id).toBe("inc_1");
    } finally {
      await ui.close();
    }
  });
});
