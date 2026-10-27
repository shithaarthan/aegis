// Phase-0 exit demo (P0): a fake incident flows DETECT→REMEMBER on stubs,
// producing a valid Medical Record entry + incident card, honoring pause + quota.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MedicalRecord } from "../src/medical-record.js";
import { runPipeline } from "../src/pipeline.js";
import { defaultConfig } from "../src/config.js";
import { StubRepro, StubHeal, StubAgent } from "../src/stubs.js";

const dir = mkdtempSync(join(tmpdir(), "aegis-phase0-"));
const res = await runPipeline(
  {
    stackTrace: "TypeError: Cannot read properties of undefined (reading 'name')\n    at getUserName (/app/src/user.ts:12:15)",
    route: "/user",
    source: "stub",
    repo: "demo/repo",
    app: "demo",
  },
  dir,
  defaultConfig({ testCommand: "__locked_only__" }),
  {
    repro: new StubRepro(true),
    heal: new StubHeal(),
    agent: new StubAgent(),
    model: null,
    quota: { date: "2099-01-01", used: 0 },
    saveQuota() {},
  },
);
console.log(`status: ${res.incident.status}`);
console.log(`record: ${res.record?.hash.slice(0, 16)}…`);
console.log(`card: ${join(dir, ".aegis", "medical-record", res.incident.id + ".md")}`);
const mr = new MedicalRecord(join(dir, ".aegis", "medical-record"));
console.log(`chain valid: ${mr.verify().ok}`);
if (res.incident.status !== "REMEMBERED" || !mr.verify().ok) process.exit(1);
console.log("PHASE-0 EXIT DEMO: PASS");
