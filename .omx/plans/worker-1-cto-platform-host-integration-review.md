# Worker-1 Memo — CTO + Platform Architecture Review for Host Integration

## Scope
This memo covers the CTO + Platform Architecture lane for the team-mode executive review on how Jarvis Fusion should be packaged and surfaced so Claude Code / Codex users feel their existing agent became smarter instead of installing a separate app.

## Evidence base
- `README.md`
- `docs/07-v1-architecture-spec.md`
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/10-storage-and-import-strategy.md`
- `docs/11-product-thesis-and-differentiation.md`
- `.omx/context/host-integration-strategy-20260408T053653Z.md`

## Executive recommendation
Use **one shared local Jarvis Fusion backend** with **thin host-specific activation shims** rather than separate per-host products or a standalone app UX.

The install model should feel closer to `oh-my-codex` than to a new brain application:
1. Install the shared backend once.
2. Enable one or more host adapters (`codex`, `claude-code`) explicitly.
3. Let the host adapter inject a small amount of startup/runtime glue so the host session can call Jarvis Fusion naturally.
4. Keep advanced operations callable through explicit commands/actions, but make core context-loading automatic at session start.

## Why this architecture fits the repo's current thesis
The existing docs consistently define Jarvis Fusion as:
- an **external brain layer**, not a replacement agent (`docs/11`)
- a **local-first OMX + Codex operator surface** (`README.md`, `docs/07`, `docs/08`)
- a system with a single truth owner, explicit archive boundaries, and façade orchestration rather than app ownership (`docs/07`, `docs/10`)

That means the host integration should preserve three properties:
1. **Single backend authority** — one truth/archive/page/promote system regardless of host.
2. **Host-native feeling** — Codex/Claude Code should appear augmented, not superseded.
3. **No split-brain UX** — users should not manage separate host-specific databases or separate "apps."

## Concrete packaging decisions

### 1) Install shape
Adopt a two-layer install:

#### Layer A — shared backend install
Install a single local backend that owns:
- truth SQLite store
- ontology/relationship tables
- knowledge page/card directories
- archive adapter configuration
- promotion/provenance rules
- shared façade/session-runtime modules

Recommended conceptual package shape:
- core package/binary: `jarvis-fusion`
- local data/config roots created automatically during install
- no host-specific state ownership outside adapter config

#### Layer B — host adapters/shims
Provide explicit host enablement commands, e.g. conceptually:
- `jarvis-fusion host enable codex`
- `jarvis-fusion host enable claude-code`

Each host adapter should only install:
- startup bootstrap hooks/instructions
- host-specific command aliases or workflow entrypoints
- host-specific prompt/skill/memory wiring where needed
- environment/config pointers back to the same backend

### 2) Shared backend vs host-specific wrappers
**Choose shared backend + thin wrappers.**

Do **not** build:
- separate Codex brain and Claude brain installs
- duplicated truth stores per host
- a new always-open standalone TUI/app as the primary operator surface

Wrappers should be replaceable and shallow:
- translate host session events into the common façade contract
- request session-start ContextPack
- expose explicit archive/page/promotion actions
- remain stateless beyond host-local config

### 3) Automatic vs explicit behavior

#### Automatic by default
These should happen automatically once a host adapter is enabled:
- session-start preflight to detect active project/task when possible
- context-pack assembly at host/session entry
- truth-first retrieval path availability
- graph expansion and archive appendix assembly when invoked by the façade
- page/card link surfacing in answers

#### Explicit / user-reviewed
These should remain explicit:
- first-time host enable/disable
- bootstrap import/re-import from source systems
- promotion into truth
- contradiction resolution / supersede actions
- heavy historical recall when not needed for the current session
- advanced diagnostics and maintenance commands

This split matches `docs/12`, which already classifies retrieval/context assembly as automatic and promotion/high-impact overwrites as reviewed.

### 4) Slash commands
**Slash commands should be secondary, not primary.**

Decision:
- Do not make slash commands the main product thesis.
- Treat them as convenience affordances only if the host already has a strong slash-command idiom.

Reasoning:
- The repo thesis is augmentation of the existing agent, not teaching a new command language.
- If slash commands become the main UX, the product starts to feel like a plugin mini-app inside the agent.
- A minimal explicit command set is still useful for discoverability and high-intent actions.

Recommended minimal surfaced command/action set:
- session start / refresh context
- ask current truth
- recall history / evidence
- open page/card / brief
- review promotion candidate

Everything else should stay behind the common façade or host help surface.

### 5) Host shims that should exist
Provide host-specific shims only where they reduce friction:

#### Codex shim
Responsibilities:
- inject startup context behavior into Codex-oriented workflow
- register minimal commands/aliases/help entrypoints
- point Codex workflows to the shared backend/config/data roots
- keep the host feeling like Codex-with-better-memory

#### Claude Code shim
Responsibilities:
- same backend pointer model
- same conceptual actions, translated into Claude Code-native affordances
- no divergence in truth/archive/promotion semantics

#### Shared shim contract
Both shims should share a single contract:
- `get_context_pack`
- `query_truth`
- `query_archive`
- `query_graph`
- `get_page_or_card`
- `submit_promotion_candidate`
- `review_promotion`

This preserves architectural consistency with `src/facade/` and `src/session-runtime/` from `docs/09`.

## Recommended rollout order
1. Build the shared backend contract and local storage first.
2. Implement a Codex-first adapter because the repo is already optimized for OMX + Codex local-first.
3. Prove the session-start/context-refresh experience feels native.
4. Add the Claude Code shim once the common façade contract is stable.
5. Introduce optional slash commands only after the non-command flow is already good.

## Risks

### Risk 1 — wrappers become mini-products
If host shims accumulate too much custom logic, Jarvis Fusion turns into multiple semi-separate products.

Mitigation:
- keep business logic in the backend/facade only
- treat adapters as translation layers

### Risk 2 — too much automatic behavior feels invasive
If install hooks or startup injection become noisy, users will feel they installed a new controlling app.

Mitigation:
- keep startup behavior minimal, explainable, and reversible
- expose explicit enable/disable per host

### Risk 3 — slash commands become a crutch
If the team over-invests in slash commands, the product may feel command-heavy rather than intelligence-heavy.

Mitigation:
- require every slash command to justify why it cannot be an existing-flow augmentation
- keep the minimal command set small

### Risk 4 — split-brain storage/config
If each host stores its own partial memory/config, cross-host trust will erode quickly.

Mitigation:
- one backend data root
- one truth owner
- host config only for adapter wiring

## Handoff to other lanes
- **CPO/User wedge** should validate the first-run activation and whether startup context alone creates enough felt value.
- **CDO/interaction-brand** should determine naming, affordance tone, and whether the host shim should be nearly invisible or slightly branded.
- **COO/chief-of-staff synthesis** should turn this into a staged rollout and install policy.

## Bottom line
From the CTO/platform view, the safest v1 decision is:

> **One shared local Jarvis Fusion backend, explicit per-host enablement, automatic session-context augmentation, explicit promotion/review actions, and slash commands kept optional/secondary.**

That is the architecture most consistent with the repository's current external-brain thesis and the least likely to feel like a separate app.
