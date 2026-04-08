# Task Context Snapshot

## Task statement
Use $team with eight lanes/departments to decide how Jarvis Fusion System should be packaged and surfaced so existing Claude Code / Codex users feel their existing agent got smarter, not like they installed a separate app.

## Desired outcome
A concrete decision memo covering install structure, host integration model, whether slash commands are truly necessary, minimal command set if any, and rollout recommendation inspired by omx/oh-my-codex style augmentation.

## Known facts / evidence
- Existing design docs define the system as an external brain layer, not a replacement agent.
- Source systems and MemPalace analyses are already complete.
- User explicitly wants ideas from oh-my-codex style activation, where a simple command enters the enhanced environment.
- User prefers that the result feel like existing agent augmentation rather than a new app.

## Constraints
- Use $team / omx team runtime.
- Use eight lanes/departments.
- Final answer should be strategic and actionable.
- No unnecessary app-like UX.

## Unknowns / open questions
- Whether slash commands should be primary or secondary.
- Whether host-specific shims should be separate names or one install with host flags.
- How much should be automatic vs explicit.

## Likely touchpoints
- docs/11-product-thesis-and-differentiation.md
- docs/07-v1-architecture-spec.md
- docs/08-implementation-backlog.md
- docs/09-repo-module-plan.md
- docs/10-storage-and-import-strategy.md
