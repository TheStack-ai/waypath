# Task Context Snapshot

## Task statement
Implement the next local-first slice after the current usable MVP: persist promotion candidates and synthesized knowledge pages into SQLite, and upgrade the facade/CLI so page/promote flows are backed by durable local state instead of transient values.

## Desired outcome
After this slice, the project should be able to:
- create and store promotion candidates in SQLite,
- synthesize/store a session page in SQLite,
- return persisted page/promotion state through the facade and CLI,
- keep recall/page/promote under the existing ownership rules,
- pass typecheck/tests with new persistence coverage.

## Known facts / evidence
- The current code already boots a real SQLite-backed session-start path.
- `recall`, `page`, and `promote` now return non-stub local values, but page/promotion are not yet durably stored.
- Schema already contains `promotion_candidates` and `knowledge_pages` tables.
- Repo is clean and ready for another executor team run.

## Constraints
- Must use `omx team ...` runtime.
- Use frontier/high workers for core implementation.
- Keep archive separate from truth and promotion explicit.
- Produce code and tests, not more planning-only artifacts.

## Likely codebase touchpoints
- `src/jarvis_fusion/truth-kernel/storage.ts`
- `src/jarvis_fusion/page-service.ts`
- `src/jarvis_fusion/promotion-service.ts`
- `src/facade/facade.ts`
- `src/cli.ts`
- `tests/unit/*`
- `tests/integration/*`
