# Task Context Snapshot

## Task statement
Continue the local-first implementation by adding graph-aware context expansion and richer page synthesis on top of persisted truth/import data.

## Desired outcome
After this slice, the codebase should:
- persist and expose relationship-backed graph context,
- include imported/project-linked entities in session-start packs more intelligently,
- synthesize richer pages that use stored entities/decisions/preferences/graph links,
- keep typecheck/tests green.

## Known facts / evidence
- Local-first MVP works: session-start, recall, page, promote, import-seed.
- Source-reader/bootstrap import boundary now exists and feeds local truth.
- Graph/relationship logic is still simplistic and page synthesis is still a minimal session brief.
- Repo is clean and ready for another executor team run.

## Constraints
- Must use `omx team ...` runtime.
- Use high-quality workers for core implementation.
- Keep graph/page enhancement inside backend ownership; host shims remain thin.
- Produce code and tests, not planning-only artifacts.

## Likely codebase touchpoints
- `src/jarvis_fusion/truth-kernel/storage.ts`
- `src/session-runtime/session-runtime.ts`
- `src/jarvis_fusion/page-service.ts`
- `src/facade/facade.ts`
- `tests/unit/*`
- `tests/integration/*`
