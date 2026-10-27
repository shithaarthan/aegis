# Live install (P3-T09)

One-command install on your VM, then attach:

```sh
curl -fsSL https://example.com/aegis.sh | sh
aegis attach /srv/my-app
```

What `attach` does:
1. Installs `@aegis/sdk-node` in your app and wraps your entrypoint
   (`initSensors`, `wrapHandler` — see `packages/sdk-node`).
2. Starts the daemon beside your app (same VM recommended — AEGIS never runs
   inside the app's runtime) with a sandbox pool.
3. Runs a synthetic seeded fault to prove detect → report. **No auto-heal until
   you set a trust level** — Trust 0 proposes an apply command for a human.

Pause anytime: `aegis pause` (takes effect at the next stage boundary) or the
Pause button in the Live UI (`packages/ui`, port 8178 by default).
