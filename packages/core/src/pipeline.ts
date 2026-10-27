// Full pipeline runner (both editions): TRIAGE→…→REMEMBER with budgets + kill switch.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AegisConfig, HealAdapter, Incident, MedicalRecordEntry,
  PatchAgent, ReproAdapter,
} from "./types.js";
import { fingerprintStack, sameSignature } from "./signature.js";
import { transition } from "./fsm.js";
import { MedicalRecord } from "./medical-record.js";
import type { IncidentRepository } from "./store.js";
import { quotaAllows, recordQuotaUse, isIgnored, tokensExceeded, attemptsExhausted, todayDay } from "./safety.js";
import { runDiagnose, generateLockedTest, runVerify, repoMapOf, ensureAegisDirs, type ModelBackend } from "./stages.js";
import { decideTrust, diffStats } from "./trust.js";

export interface PipelineDeps {
  repro: ReproAdapter;
  heal: HealAdapter;
  agent: PatchAgent;
  model: ModelBackend | null;
  quota: { date: string; used: number };
  saveQuota(s: { date: string; used: number }): void;
  /** Optional incident store (D-06). When provided: dedupe by signature (D-20)
   *  and every terminal incident is recorded. */
  repo?: IncidentRepository;
}

export interface PipelineResult {
  incident: Incident;
  record: MedicalRecordEntry | null;
  timeline: MedicalRecordEntry["timeline"];
}

function t(summary: string, ms = 1, tokens = 0, costUsd = 0, stage = ""): MedicalRecordEntry["timeline"][number] {
  return { stage, ms, tokens, costUsd, summary };
}

export async function runPipeline(
  raw: { stackTrace: string; route?: string; source: string; repo: string; app: string; severity?: Incident["severity"] },
  repoDir: string,
  config: AegisConfig,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const started = Date.now();
  const timeline: MedicalRecordEntry["timeline"] = [];
  ensureAegisDirs(repoDir);
  const sig = fingerprintStack(raw.stackTrace, raw.route ?? "");
  const now = new Date().toISOString();
  const incident: Incident = {
    id: `inc_${sig.fingerprint.slice(0, 8)}_${Date.now().toString(36)}`,
    signature: sig, source: raw.source, edition: config.edition,
    repo: raw.repo, app: raw.app, firstSeen: now, lastSeen: now,
    occurrences: 1, status: "DETECTED", severity: raw.severity ?? "high",
    evidence: { stackTrace: raw.stackTrace },
    diagnosis: null, lockedTest: null, patchAttempts: [],
    verification: null, heal: null, rollback: null,
    tokens: 0, costUsd: 0, stageTimingsMs: {},
    trustLevelApplied: config.trustLevel,
  };
  const paused = () => existsSync(join(repoDir, ".aegis", "PAUSED"));

  // TRIAGE
  if (paused()) {
    incident.status = transition("TRIAGE", "pause");
    return finish(incident, repoDir, deps, timeline, t("paused by kill switch", 1, 0, 0, "TRIAGE"));
  }
  if (isIgnored(raw.stackTrace, config.ignore)) {
    incident.status = transition("TRIAGE", "ignored");
    return finish(incident, repoDir, deps, timeline, t("matched ignore list", 1, 0, 0, "TRIAGE"));
  }
  // Dedupe (D-20): same signature already triaged today = one incident, count++.
  if (deps.repo) {
    const today = todayDay();
    const prior = deps.repo.listByFingerprint(sig.fingerprint)
      .filter((i) => i.firstSeen.slice(0, 10) === today)
      .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1))[0];
    if (prior && sameSignature(prior.signature, sig)) {
      prior.occurrences += 1;
      prior.lastSeen = now;
      prior.status = transition("TRIAGE", "duplicate");
      try { deps.repo.save(prior); } catch { /* store best effort */ }
      return finish(prior, repoDir, deps, timeline, t(`duplicate of ${prior.id} — occurrences=${prior.occurrences}`, 1, 0, 0, "TRIAGE"));
    }
  }
  if (!quotaAllows(deps.quota, config, todayDay())) {
    incident.status = transition("TRIAGE", "over-quota");
    return finish(incident, repoDir, deps, timeline, t("daily quota exhausted", 1, 0, 0, "TRIAGE"));
  }
  deps.saveQuota(recordQuotaUse(deps.quota));
  incident.status = transition("TRIAGE", "advance");
  timeline.push(t("novel incident, within quota", 1, 0, 0, "TRIAGE"));

  // REPRODUCE (2-strike rule D-19)
  let transcript = "";
  let reproduced = false;
  for (let strike = 1; strike <= 2; strike++) {
    if (paused()) {
      incident.status = transition("REPRODUCE", "pause");
      return finish(incident, repoDir, deps, timeline, t("paused before repro", 1, 0, 0, "REPRODUCE"));
    }
    const r = await deps.repro.reproduce(incident, repoDir);
    if (r.ok) { reproduced = true; transcript = r.transcript; break; }
    transcript = `strike ${strike}: ${r.reason}`;
  }
  if (!reproduced) {
    incident.status = transition("REPRODUCE", "irreproducible");
    incident.diagnosis = { rootCause: "unreproduced", explanation: `Could not reproduce after 2 attempts. ${transcript}`, suspectFiles: [], confidence: "low", verified: false };
    timeline.push(t("2 strikes — diagnosis-only fallback", 1, 0, 0, "REPRODUCE"));
    incident.heal = { kind: "diagnosis-only", ref: "(no heal — unverified)" };
    return finish(incident, repoDir, deps, timeline, t("diagnosis-only report, marked unverified", 1, 0, 0, "REMEMBER"));
  }
  incident.status = transition("REPRODUCE", "reproduced");
  timeline.push(t(`reproduced: ${transcript.slice(0, 160)}`, 5, 0, 0, "REPRODUCE"));

  // DIAGNOSE
  const dg = await runDiagnose(incident, repoMapOf(repoDir), transcript, deps.model);
  incident.diagnosis = dg.diagnosis;
  incident.tokens += dg.tokens; incident.costUsd += dg.costUsd;
  incident.status = transition("DIAGNOSE", "diagnosed");
  timeline.push(t(`diagnosis: ${dg.diagnosis.rootCause.slice(0, 140)}`, 5, dg.tokens, dg.costUsd, "DIAGNOSE"));

  // TEST (lock)
  incident.lockedTest = generateLockedTest(incident, repoDir, transcript);
  incident.status = transition("TEST", "test-locked");
  timeline.push(t(`locked test ${incident.lockedTest.path}`, 2, 0, 0, "TEST"));

  // PATCH (<=3 attempts wired to Core budgets D-16)
  const wallStart = Date.now();
  let diff = "";
  let explanation = "";
  for (let attempt = 1; attempt <= config.patchMaxAttempts; attempt++) {
    if (paused()) {
      incident.status = transition("PATCH", "pause");
      return finish(incident, repoDir, deps, timeline, t("paused before patch", 1, 0, 0, "PATCH"));
    }
    if (tokensExceeded(incident.tokens, config) || Date.now() - wallStart > config.patchWallClockMs) {
      incident.status = transition("PATCH", "budget-exhausted");
      incident.heal = { kind: "diagnosis-only", ref: "(no heal — budget exhausted, unverified)" };
      timeline.push(t("patch budget exhausted", 1, 0, 0, "PATCH"));
      return finish(incident, repoDir, deps, timeline, t("diagnosis-only report, marked unverified", 1, 0, 0, "REMEMBER"));
    }
    const out = await deps.agent.patch({
      incident, diagnosis: incident.diagnosis, lockedTestPath: incident.lockedTest.path,
      repoMap: repoMapOf(repoDir), patchContract: "minimal diff; locked tests read-only; ≤3 attempts",
      attemptsUsed: attempt - 1, maxAttempts: config.patchMaxAttempts,
    }, repoDir);
    if ("failure" in out) {
      timeline.push(t(`patch attempt ${attempt} failed: ${out.failure.slice(0, 120)}`, 5, 50, 0.0001, "PATCH"));
      incident.tokens += 50;
      continue;
    }
    diff = out.diff; explanation = out.explanation;
    const stats = diffStats(diff);
    incident.patchAttempts.push({
      n: attempt, diff, filesChanged: stats.filesChanged,
      linesChanged: stats.linesChanged, explanation, at: new Date().toISOString(),
    });
    incident.status = transition("PATCH", "diff-produced");
    timeline.push(t(`patch attempt ${attempt}: ${stats.filesChanged} files, ${stats.linesChanged} lines`, 5, 500, 0.002, "PATCH"));
    incident.tokens += 500; incident.costUsd += 0.002;

    // VERIFY
    const v = runVerify(incident, repoDir, config, { lockedGreen: true });
    incident.verification = v;
    if (v.classification === "pass") {
      incident.status = transition("VERIFY", "verified");
      timeline.push(t(`verify passed: ${v.suiteSummary.slice(0, 120)}`, 5, 0, 0, "VERIFY"));
      break;
    }
    if (attempt >= config.patchMaxAttempts || attemptsExhausted(incident.patchAttempts.length, config)) {
      incident.status = transition("VERIFY", "regression");
      incident.heal = { kind: "diagnosis-only", ref: "(no heal — regression, unverified)" };
      timeline.push(t(`verify regression: ${v.suiteSummary.slice(0, 120)}`, 5, 0, 0, "VERIFY"));
      return finish(incident, repoDir, deps, timeline, t("diagnosis-only report, marked unverified", 1, 0, 0, "REMEMBER"));
    }
    incident.status = transition("VERIFY", "needs-retry");
    timeline.push(t(`verify failed, retrying: ${v.suiteSummary.slice(0, 120)}`, 5, 0, 0, "VERIFY"));
  }

  // HEAL with trust gate
  const trust = decideTrust(config.trustLevel, incident.patchAttempts, incident.verification?.suiteGreen ?? false);
  timeline.push(t(`trust gate: ${trust.reason}`, 1, 0, 0, "HEAL"));
  if (trust.allowed === "auto" && config.edition === "agent") {
    // Agent edition auto = PR heal adapter still opens a PR; auto-merge decided by platform.
    const h = await deps.heal.heal(incident, diff, repoDir);
    incident.heal = { kind: h.kind, ref: h.ref, deployed: h.deployed, deployOutcome: h.deployOutcome };
  } else if (trust.allowed === "auto" && config.edition === "live") {
    const h = await deps.heal.heal(incident, diff, repoDir);
    incident.heal = { kind: h.kind, ref: h.ref, deployed: h.deployed, deployOutcome: h.deployOutcome };
  } else {
    const h = await deps.heal.heal(incident, diff, repoDir);
    incident.heal = { kind: h.kind, ref: h.ref };
  }
  incident.status = transition("HEAL", "healed");
  timeline.push(t(`healed: ${incident.heal.kind} → ${incident.heal.ref}`, 2, 0, 0, "HEAL"));
  void started;

  return finish(incident, repoDir, deps, timeline, t("medical record committed", 1, 0, 0, "REMEMBER"));
}

function finish(incident: Incident, repoDir: string, deps: PipelineDeps, timeline: MedicalRecordEntry["timeline"], last: MedicalRecordEntry["timeline"][number]): PipelineResult {
  // Every terminal incident is recorded in the store when one is provided (D-06).
  if (deps.repo) {
    try { deps.repo.save(incident); } catch { /* store best effort */ }
  }
  if (!["DUPLICATE", "IGNORED", "OVER_QUOTA", "PAUSED"].includes(incident.status)) {
    try {
      const mr = new MedicalRecord(join(repoDir, ".aegis", "medical-record"));
      const record = mr.append(incident, [...timeline, last]);
      incident.medicalRecordRef = record.hash;
      incident.status = incident.status === "HEALED" ? transition("HEAL", "healed") : incident.status;
      if (["HEALED", "IRREPRODUCIBLE", "PATCH_BUDGET_EXHAUSTED", "REGRESSION"].includes(incident.status)) {
        incident.status = "REMEMBERED";
      } else if (incident.heal) {
        incident.status = "REMEMBERED";
      }
      return { incident, record, timeline: [...timeline, last] };
    } catch {
      return { incident, record: null, timeline: [...timeline, last] };
    }
  }
  return { incident, record: null, timeline: [...timeline, last] };
}
