# Task Context Snapshot

## Task statement
Implement the next real Jarvis Fusion code slice on top of the Node/TypeScript scaffold: real SQLite-backed truth-kernel repository methods, session-start context assembly from stored truth, and a Codex-first shim/CLI path that uses the persisted data instead of stubs.

## Desired outcome
After this slice, `jarvis-fusion codex --json` should return a real `SessionContextPack` assembled from a local SQLite truth store, with tests covering repository CRUD and session-start assembly.

## Known facts / evidence
- Bootstrap scaffold exists and passes `npm run typecheck` and `npm test`.
- Current truth-kernel storage wraps `node:sqlite` but only exposes generic SQL helpers.
- Current session-runtime/facade/shim are mostly stubbed and return empty arrays.
- Architecture remains fixed: shared backend, thin host shims, automatic read / explicit write.
- Repo is currently clean and can launch a new `omx team` run.

## Constraints
- Must use `omx team ...` runtime.
- Use high-quality/final-tier workers for core implementation; do not silently downgrade the main implementation lanes.
- Prefer built-in Node capabilities over new dependencies.
- Produce code and tests, not more planning-only artifacts.

## Likely codebase touchpoints
- `src/jarvis_fusion/contracts.ts`
- `src/jarvis_fusion/truth-kernel/schema.ts`
- `src/jarvis_fusion/truth-kernel/storage.ts`
- `src/session-runtime/session-runtime.ts`
- `src/facade/facade.ts`
- `src/host-shims/codex/codex.ts`
- `src/cli.ts`
- `tests/unit/*`
- `tests/integration/*`
