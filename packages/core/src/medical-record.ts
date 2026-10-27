// Medical Record: append-only, hash-chained JSONL + human-readable card (D-07).
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Incident, MedicalRecordEntry } from "./types.js";

export function entryHash(prevHash: string, body: Omit<MedicalRecordEntry, "hash" | "prevHash">): string {
  return createHash("sha256").update(prevHash + JSON.stringify(body)).digest("hex");
}

export class MedicalRecord {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  get jsonlPath(): string { return join(this.dir, "record.jsonl"); }

  private prevHash(): string {
    if (!existsSync(this.jsonlPath)) return "GENESIS";
    const lines = readFileSync(this.jsonlPath, "utf8").split("\n").filter(Boolean);
    if (lines.length === 0) return "GENESIS";
    return (JSON.parse(lines[lines.length - 1]) as MedicalRecordEntry).hash;
  }

  private seq(): number {
    if (!existsSync(this.jsonlPath)) return 1;
    return readFileSync(this.jsonlPath, "utf8").split("\n").filter(Boolean).length + 1;
  }

  append(incident: Incident, timeline: MedicalRecordEntry["timeline"]): MedicalRecordEntry {
    const prevHash = this.prevHash();
    const body = {
      seq: this.seq(),
      incidentId: incident.id,
      at: new Date().toISOString(),
      incident: structuredClone(incident),
      timeline,
    };
    const hash = entryHash(prevHash, body);
    const entry: MedicalRecordEntry = { ...body, prevHash, hash };
    appendFileSync(this.jsonlPath, JSON.stringify(entry) + "\n");
    const card = renderIncidentCard(entry);
    writeFileSync(join(this.dir, `${incident.id}.md`), card);
    return entry;
  }

  verify(): { ok: boolean; badSeq?: number } {
    if (!existsSync(this.jsonlPath)) return { ok: true };
    const lines = readFileSync(this.jsonlPath, "utf8").split("\n").filter(Boolean);
    let prev = "GENESIS";
    for (const [idx, line] of lines.entries()) {
      const e = JSON.parse(line) as MedicalRecordEntry;
      const { hash, prevHash, ...body } = e;
      if (prevHash !== prev) return { ok: false, badSeq: idx + 1 };
      if (entryHash(prev, body) !== hash) return { ok: false, badSeq: idx + 1 };
      prev = hash;
    }
    return { ok: true };
  }
}

export function renderIncidentCard(entry: MedicalRecordEntry): string {
  const i = entry.incident;
  const lines: string[] = [];
  lines.push(`# Incident ${i.id}`);
  lines.push(``);
  lines.push(`> AEGIS Medical Record #${entry.seq} — written for a non-expert owner. All times UTC.`);
  lines.push(``);
  lines.push(`- **Status:** ${i.status}${i.diagnosis && !i.diagnosis.verified ? " (diagnosis UNVERIFIED — no heal was applied)" : ""}`);
  lines.push(`- **App:** ${i.app} (${i.repo}) · **Source:** ${i.source} · **Edition:** ${i.edition}`);
  lines.push(`- **First seen:** ${i.firstSeen} · **Occurrences:** ${i.occurrences}`);
  lines.push(`- **Trust level:** ${i.trustLevelApplied} · **Tokens:** ${i.tokens} · **Cost:** $${i.costUsd.toFixed(4)}`);
  lines.push(``);
  lines.push(`## What failed`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(i.evidence.stackTrace ?? "(no stack trace captured)");
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`## Diagnosis`);
  lines.push(``);
  lines.push(i.diagnosis ? `${i.diagnosis.explanation} **Root cause:** ${i.diagnosis.rootCause}` : `No diagnosis — incident is still being processed.`);
  lines.push(``);
  lines.push(`## Locked test`);
  lines.push(``);
  lines.push(i.lockedTest ? `\`${i.lockedTest.path}\` (sha256:${i.lockedTest.hash.slice(0, 12)}…) — read-only, agent could not modify it.` : `No locked test was produced.`);
  lines.push(``);
  lines.push(`## Fix`);
  lines.push(``);
  const last = i.patchAttempts[i.patchAttempts.length - 1];
  if (last) {
    lines.push(`${last.explanation}`);
    lines.push(``);
    lines.push(`<details><summary>Diff (${last.filesChanged} files, ${last.linesChanged} lines)</summary>`);
    lines.push(``);
    lines.push("```diff");
    lines.push(last.diff.slice(0, 6000));
    lines.push("```");
    lines.push(`</details>`);
  } else {
    lines.push(`No patch was applied.`);
  }
  lines.push(``);
  lines.push(`## Verification`);
  lines.push(``);
  lines.push(i.verification ? `- Locked test green: **${i.verification.lockedTestGreen}** · Suite green: **${i.verification.suiteGreen}** (\`${i.verification.suiteCommand}\`) · ${i.verification.suiteSummary}` : `- Not verified.`);
  lines.push(``);
  lines.push(`## Heal & rollback`);
  lines.push(``);
  lines.push(i.heal ? `- Heal: ${i.heal.kind} → ${i.heal.ref}${i.heal.deployOutcome ? ` · deploy: ${i.heal.deployOutcome}` : ""}` : `- No heal performed.`);
  if (i.rollback?.fired) lines.push(`- Rollback fired (${i.rollback.reason}) — restored: **${i.rollback.restored}**`);
  lines.push(``);
  lines.push(`## Timeline & cost`);
  lines.push(``);
  for (const t of entry.timeline) {
    lines.push(`- ${t.stage}: ${t.ms}ms · ${t.tokens} tokens · $${t.costUsd.toFixed(4)} — ${t.summary}`);
  }
  lines.push(``);
  lines.push(`*Record hash ${entry.hash.slice(0, 16)}… chained from ${entry.prevHash.slice(0, 16)}… (tamper-evident).*`);
  lines.push(``);
  void dirname;
  return lines.join("\n");
}
