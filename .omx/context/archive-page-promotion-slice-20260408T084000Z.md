# Task Context Snapshot

## Task statement
Continue actual implementation by adding the next local-first slice after session-start: archive recall boundary, simple page synthesis from persisted truth, and an explicit promotion boundary with tests and facade wiring.

## Desired outcome
After this slice, the codebase should have a real ArchiveProvider boundary, non-empty `page`/`promote` flows that no longer return generic placeholders, and tests that prove these paths work locally without violating ownership rules.

## Known facts / evidence
- The Node/TypeScript scaffold exists and passes build/typecheck/tests.
- The Codex JSON startup path now reads from persisted SQLite truth data.
- Recall/page/promote are still stub responses in the facade.
- Architecture remains fixed: archive is not truth, pages are views, writes are explicit/review-based.

## Constraints
- Must use `omx team ...` runtime.
- Keep everything local-first and built-in where possible.
- Preserve the automatic read / explicit write rule.
- Produce code and tests, not planning docs.

## Likely codebase touchpoints
- `src/jarvis_fusion/contracts.ts`
- `src/facade/facade.ts`
- `src/session-runtime/session-runtime.ts`
- `src/cli.ts`
- `src/contracts/types.ts`
- new archive/page/promotion modules under `src/`
- `tests/unit/*`
- `tests/integration/*`
