// @aegis/core — frozen contracts (Phase 0, D-05). Do not change without an ADR.
export type Edition = "agent" | "live";
export type IncidentStatus =
  | "DETECTED" | "TRIAGED" | "REPRODUCED" | "DIAGNOSED" | "TEST_LOCKED"
  | "PATCHED" | "VERIFIED" | "HEALED" | "REMEMBERED"
  | "IRREPRODUCIBLE" | "PATCH_BUDGET_EXHAUSTED" | "REGRESSION"
  | "DUPLICATE" | "IGNORED" | "OVER_QUOTA" | "PAUSED";

export type PipelineStage =
  | "DETECT" | "TRIAGE" | "REPRODUCE" | "DIAGNOSE" | "TEST"
  | "PATCH" | "VERIFY" | "HEAL" | "REMEMBER";

export interface IncidentSignature {
  fingerprint: string;
  errorType: string;
  topFrames: string[];
  route: string;
}

export interface Incident {
  id: string;
  signature: IncidentSignature;
  source: string;
  edition: Edition;
  repo: string;
  app: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  status: IncidentStatus;
  severity: "critical" | "high" | "medium" | "low";
  evidence: {
    stackTrace?: string;
    logs?: string;
    actionLog?: string[];
    screenshotRefs?: string[];
  };
  environmentRef?: string;
  diagnosis?: Diagnosis | null;
  lockedTest?: LockedTest | null;
  patchAttempts: PatchAttempt[];
  verification?: VerificationResult | null;
  heal?: HealResult | null;
  rollback?: RollbackResult | null;
  tokens: number;
  costUsd: number;
  stageTimingsMs: Record<string, number>;
  trustLevelApplied: 0 | 1 | 2;
  medicalRecordRef?: string;
}

export interface Diagnosis {
  rootCause: string;
  explanation: string;
  suspectFiles: string[];
  confidence: "high" | "medium" | "low";
  verified: boolean;
}

export interface LockedTest {
  path: string;
  hash: string;
  content: string;
}

export interface PatchAttempt {
  n: number;
  diff: string;
  filesChanged: number;
  linesChanged: number;
  explanation: string;
  at: string;
}

export interface VerificationResult {
  lockedTestGreen: boolean;
  suiteGreen: boolean;
  suiteCommand: string;
  suiteSummary: string;
  classification: "pass" | "regression" | "locked-failed";
}

export interface HealResult {
  kind: "pr" | "in-place" | "proposed-command" | "diagnosis-only";
  ref: string;
  deployed?: boolean;
  deployOutcome?: string;
}

export interface RollbackResult {
  fired: boolean;
  reason?: string;
  restored: boolean;
  at?: string;
}

export interface StageBudget {
  tokensRemaining: number;
  msRemaining: number;
}

export interface StageInput {
  incidentId: string;
  config: AegisConfig;
  artifactsRef: string;
  budget: StageBudget;
  killSwitch: boolean;
}

export interface StageOutput {
  outcome: "advance" | "terminal" | "retry";
  terminalState?: IncidentStatus;
  artifactsRef: string;
  timingMs: number;
  costUsd: number;
  tokensUsed: number;
  summary: string;
}

export interface DetectAdapter {
  readonly id: string;
  readonly sourceType: string;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
  normalize(raw: unknown): Incident[];
}

export interface ReproAdapter {
  readonly id: string;
  readonly targets: string[];
  reproduce(incident: Incident, repoDir: string): Promise<ReproSession | ReproFailure>;
}

export interface ReproSession {
  ok: true;
  adapterId: string;
  transcript: string;
  howToReplay: string;
}

export interface ReproFailure {
  ok: false;
  adapterId: string;
  reason: string;
}

export interface HealAdapter {
  readonly id: string;
  heal(incident: Incident, diff: string, repoDir: string): Promise<HealResult & { rollbackPlan: string }>;
  rollback(plan: string, repoDir: string): Promise<RollbackResult>;
}

export interface PatchAgentContext {
  incident: Incident;
  diagnosis: Diagnosis;
  lockedTestPath: string;
  repoMap: string;
  patchContract: string;
  attemptsUsed: number;
  maxAttempts: number;
}

export interface PatchAgent {
  readonly id: string;
  patch(ctx: PatchAgentContext, repoDir: string): Promise<{ diff: string; explanation: string } | { failure: string }>;
}

export interface MedicalRecordEntry {
  seq: number;
  incidentId: string;
  at: string;
  incident: Incident;
  timeline: { stage: string; ms: number; tokens: number; costUsd: number; summary: string }[];
  prevHash: string;
  hash: string;
}

export type DeploymentTarget =
  | "vm" | "docker" | "kubernetes" | "paas" | "serverless" | "workers" | "spa";

export interface AegisConfig {
  schemaVersion: 1;
  edition: Edition;
  target: DeploymentTarget;
  errorSource: "sentry" | "glitchtip" | "bugsnag" | "sensors" | "log-scraper" | "workers-logpush";
  reproAdapter: string;
  healAdapter: string;
  trustLevel: 0 | 1 | 2;
  dailyQuota: number;
  tokenCeilingPerIncident: number;
  patchMaxAttempts: number;
  patchWallClockMs: number;
  testCommand?: string;
  ignore?: string[];
  rollbackWatchMinutes?: number;
}
