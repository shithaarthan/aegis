# Extension API (P5-T03)

Third-party adapters plug in behind the frozen contracts — no core changes needed.

## Adapter points
- `DetectAdapter` — emit normalized `Incident[]` (`source`, `edition`, evidence).
- `ReproAdapter` — return a session or a failure reason; declare `targets`.
- `HealAdapter` — heal a verified diff; always return a rollback plan + executor.
- `PatchAgent` — task context in, `{diff, explanation}` or `{failure}` out.

## Conformance kit
`packages/core/src/conformance.ts` exports `conformDetect`, `conformRepro`,
`conformHeal`, `conformPatchAgent`. An external-style adapter built from this doc
alone must pass the kit:

```ts
import { conformDetect } from "@aegis/core";
const result = await conformDetect(new MyAdapter("repo", "app"), samplePayload);
console.log(result.pass); // true required for merge
```

Rules: never import another package's internals; never write the incident store
from an adapter; never heal without a rollback path; honor the patch contract.
See `docs/contracts.md`. Community example: `examples/community-adapter/`.
