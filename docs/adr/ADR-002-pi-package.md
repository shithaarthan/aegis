# ADR-002: Patch-agent package name

- Status: accepted
- Date: 2026-10-27
- Decision (D-12): Pi (`@mariozechner/pi-coding-agent`) is the default PATCH implementation.

## Context
The kernel must never import the patch agent directly; `packages/agent-pi` is the
only owner of the Pi integration. The published package name/version must be pinned
at implementation time.

## Decision
- Default patch package: `@mariozechner/pi-coding-agent`, invoked headless via the
  `pi` binary (`AEGIS_PI_BINARY` override, `AEGIS_PI_MODEL` model override).
- `PiPatchAgent.patch()` returns `{diff, explanation}` or `{failure}`; attempt
  counting and budgets live in Core, never in this package.
- When Pi is unavailable (no binary/keys), the agent fails honestly with
  `{failure}` and the pipeline escalates to a diagnosis-only report — never a
  silent heal. `ScriptedPatchAgent` covers tests/examples.

## Consequences
- Interface stability: a Pi rename only changes `agent-pi`, never Core (D-12 holds).
- Recorded actual: integration resolves `pi --version` at runtime; pinned name above
  matches the master plan at 1.0.
