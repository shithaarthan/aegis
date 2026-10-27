# ADR-001: License and language choice

- Status: accepted
- Date: 2026-10-27
- Decision (D-24, D-01): MIT license; TypeScript (strict) on Node.js LTS for kernel, adapters, agent-pi, sdk-node, UI server.

## Context
AEGIS needs maximum contributor reach and zero-friction adoption by small teams.
Target apps remain language-agnostic; only sensor SDKs are per-language.

## Decision
- Open-source core under the OSI-approved MIT license (`LICENSE` at repo root).
- Core implementation language: TypeScript strict, Node.js >= 22 LTS.
- Sensor SDKs: Node/TS first, Python second; same event contract.

## Consequences
- All packages ship with `strict: true` typechecking; CI enforces it.
- Native dependencies are avoided (node:sqlite built-in) to keep installs clean.
