# Task statement
Implement the first non-breaking Waypath maturity slice from OpenSpec `waypath-maturity-foundation`: add config/runtime maturity without breaking current Waypath behavior.

# Desired outcome
- Introduce a small config layer (`config.toml` + env override)
- Wire source adapter enable/disable and retrieval weight knobs non-destructively
- Keep current defaults when no config file exists
- Preserve installable CLI behavior and current tests/smoke paths

# Known facts / evidence
- Waypath is an installable local-first CLI on SQLite.
- Current repo HEAD already passes typecheck/tests/install smoke.
- Honcho review concluded we should borrow config/runtime maturity, not server architecture.
- The first safe slice is config/runtime because it improves control without changing truth/archive ownership.

# Constraints
- Must not break current Waypath behavior.
- Must not move to server-first or Postgres-first architecture.
- Must keep local-first CLI wedge.
- Must keep install/typecheck/tests green.
- Source systems remain read-only.

# Unknowns / open questions
- Whether config should live only in `src/shared/config/` or also expose façade-level adapters immediately.
- Which knobs should be wired first versus only defined.

# Likely touchpoints
- `src/shared/`
- `src/cli.ts`
- `src/facade/facade.ts`
- `src/jarvis_fusion/source-readers-local.ts`
- `src/jarvis_fusion/archive-provider.ts`
- `tests/`
- `README.md` if config usage becomes user-visible
