# Task Context Snapshot

## Task statement
Use $team to continue from the host integration executive decision and update the repository's design/implementation planning docs so Jarvis Fusion can move forward with a concrete host-integration execution plan.

## Desired outcome
Produce repo-native planning artifacts that turn the executive decision into concrete next steps across backlog/module/contract docs, using OMX team orchestration instead of ad-hoc solo synthesis.

## Known facts / evidence
- `docs/14-host-integration-executive-review.md` now captures the executive decision.
- Existing docs already define external brain thesis, truth/archive boundaries, facade/session-runtime split, and local-first OMX+Codex orientation.
- OMX team workers were failing because `codex_apps` startup was unstable; verified workaround is disabling apps/plugins in worker launch args.
- Screenshot evidence shows additional provider-side model capacity issues on selected model, so worker model should avoid hot frontier capacity when possible.

## Constraints
- Must use `omx team ...` runtime.
- Must keep the product as augmentation, not a separate app.
- Must keep automatic read vs explicit write boundary intact.
- No fake implementation claims beyond what this planning repo can support.

## Unknowns / open questions
- Which docs should be updated as the canonical implementation handoff set.
- Whether to create a dedicated rollout/install doc vs patch existing backlog/module docs only.
- What the next execution milestone should be after planning updates.

## Likely codebase touchpoints
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/13-core-schemas-and-contracts.md`
- `docs/14-host-integration-executive-review.md`
- `README.md`
