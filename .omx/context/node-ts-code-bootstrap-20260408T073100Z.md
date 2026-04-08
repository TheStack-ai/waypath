# Task Context Snapshot

## Task statement
Start real implementation by creating the first Node/TypeScript code scaffold for Jarvis Fusion v1: package metadata, TypeScript config, source tree, test tree, contracts, truth-kernel skeleton, facade skeleton, session-runtime skeleton, and a Codex-first thin host shim entry.

## Desired outcome
After this phase, the repo should be a runnable Node/TypeScript project with `npm test` / `npm run typecheck` working and the architecture visible in code rather than docs only.

## Known facts / evidence
- Architecture is fixed: shared backend, thin host shims, automatic read / explicit write.
- Prior team runs already produced the implementation sequence and milestone breakdown.
- Local environment has Node v25.8.1 with built-in `node:sqlite` and `node:test` available.
- Repo is now a clean git workspace and can launch `omx team` again.

## Constraints
- Must use `omx team ...` runtime.
- Prefer built-in Node capabilities; avoid unnecessary third-party dependencies.
- Produce real files, not more planning docs.

## Likely codebase touchpoints
- `package.json`
- `tsconfig.json`
- `src/jarvis_fusion/contracts.ts`
- `src/jarvis_fusion/truth-kernel/*`
- `src/jarvis_fusion/facade/*`
- `src/jarvis_fusion/session-runtime/*`
- `src/jarvis_fusion/host-shims/codex/*`
- `tests/*`
