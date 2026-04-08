# Jarvis Fusion Host Integration Executive Review

## Scope
Team-mode executive review for packaging and host integration so Jarvis Fusion feels like an **external brain layer that upgrades the user's existing Claude Code / Codex workflow**, not a separate app.

## Evidence Base
- `README.md`
- `docs/07-v1-architecture-spec.md`
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/10-storage-and-import-strategy.md`
- `docs/11-product-thesis-and-differentiation.md`
- `.omx/context/host-integration-strategy-20260408T053653Z.md`
- CDO interaction/brand memo from parallel review

## Executive Decision Summary

### Primary decision
Adopt **one shared local Jarvis Fusion backend** with **thin host-specific shims** for Codex and Claude Code. The backend owns truth/archive/graph/page orchestration. The shims only make that backend feel native inside each host.

### Packaging decision
- **Core package**: `jarvis-fusion` backend/runtime/config/bootstrap
- **Host shims**:
  - `oh-my-codex` → Codex-friendly activation surface
  - `oh-my-claude-code` (or equivalent Claude Code shim) → Claude Code-friendly activation surface
- **Do not** ship separate host-specific backends or divergent data stores.

### Interaction decision
- **Primary UX**: automatic session-start augmentation
- **Secondary UX**: optional explicit commands for power users
- **Slash commands are secondary**, not the core wedge

### Automatic vs explicit split
**Automatic by default**
- host detection
- session-start context pack assembly
- safe read-only summaries: current truth, recent changes, relevant graph links, optional evidence appendix
- suggestion surfaces that do not mutate durable state

**Explicit only**
- promotion / truth mutation
- imports and re-imports
- archive-to-truth review
- supersede / contradiction resolution
- destructive or durable-state-changing actions

---

## Lane 1 — CTO + Platform Architecture

### Recommendation
Use a **shared backend + thin host shims** architecture. Treat host integration as an access-layer concern, not a storage or product-splitting concern.

### Rationale
The existing docs already define Jarvis Fusion as:
- an **external brain layer** rather than a replacement agent (`docs/11`)
- a system with a **single truth owner** and clear archive/graph/page boundaries (`docs/07`, `docs/10`)
- a repo split where `facade/` and `session-runtime/` are operator-facing but do not own truth (`docs/09`)

That architecture strongly favors:
1. one backend/runtime
2. one persistence topology
3. one operator model
4. multiple host entry shims

### Concrete packaging / host decisions
- Shared backend owns:
  - truth kernel
  - archive integration
  - ontology/graph support
  - knowledge pages/cards
  - session runtime and context pack assembly
- Host shims own:
  - bootstrap / env wiring
  - host-specific defaults
  - shell alias/launcher behavior
  - ergonomic host-specific entrypoints
- Avoid:
  - host-specific forks of truth/archive logic
  - hidden sync between host installs
  - separate per-host storage layouts

### CTO risk view
- Biggest architectural risk is **split-brain by host**.
- Second risk is **overfitting to slash-command surfaces**, which creates app-like behavior instead of augmentation.
- Third risk is **too much magic at bootstrap** without explainability.

---

## Lane 2 — CPO + User Wedge

### Recommendation
Sell the wedge as: **"install once, then your current agent starts every session with better memory, context, and recall."**

### User wedge decisions
- The user should feel value on **first session start**, before learning any advanced commands.
- The minimal mental model should be:
  1. install once
  2. open Codex or Claude Code the way you already do
  3. the agent now starts with a better working context and can recall project memory/history more intelligently

### Minimal command set
Keep an optional small command family only for explicit power-user actions:
- `context`
- `recall`
- `page`
- `promote`

These can be exposed as slash-style or host-native commands if the host supports them cleanly, but they must remain **secondary shortcuts**, not the main product story.

### Automatic vs explicit from the user wedge lens
**Automatic**
- startup context pack
- safe recall suggestions
- relevant page/card surfacing

**Explicit**
- truth edits
- promoted facts
- imports/re-imports
- cross-source decisions

### CPO risk view
- If users must memorize commands before experiencing value, the wedge weakens.
- If startup output is noisy, users will perceive friction instead of augmentation.
- If Codex and Claude Code differ too much, adoption and trust drop.

---

## Lane 3 — CDO + Interaction / Brand

### Recommendation
Brand Jarvis Fusion as the **brain/backend identity**, while the visible host touchpoints stay host-native and lightweight.

### Interaction / brand decisions
- **Product identity**: Jarvis Fusion = shared external brain layer
- **Surface identity**: host shim = natural extension of the host, not a new console/dashboard/app
- Prefer **augmentation language** over command-center/toolbox language
- Slash commands should remain a **power-user affordance**, not the main framing

### CDO-aligned design rules
- startup augmentation should feel like an upgraded briefing, not a plugin banner
- read operations should feel immediate and low-ceremony
- write operations should feel deliberate and review-based
- naming should avoid sounding mystical, bulky, or like a parallel IDE

### CDO risk view
- too many branded surfaces make the product feel like a separate app
- slash-command sprawl makes the interaction model feel bolted on
- unclear automatic behavior erodes trust quickly

---

## Lane 4 — COO + Rollout / Chief-of-Staff Synthesis

### Recommendation
Roll out in **three controlled phases**: backend first, Codex shim first, Claude Code shim second. Keep the first release operationally narrow.

### Phased rollout plan

#### Phase A — Backend + bootstrap baseline
Ship:
- shared backend/runtime
- local config/bootstrap
- session-start context pack
- optional explicit commands (minimal set only)
- documentation for automatic vs explicit actions

Do not ship yet:
- advanced host divergence
- broad command catalog
- public distribution packaging complexity

#### Phase B — Codex-first shim
Ship the first thin host shim in the environment already closest to current repo assumptions (`OMX + Codex local-first` appears throughout `README.md`, `docs/07`, `docs/08`, `docs/09`, `docs/10`).

Goals:
- prove the augmentation story
- validate startup context usefulness
- validate explicit action boundaries
- identify which shortcuts are actually used

#### Phase C — Claude Code shim parity
After Codex semantics stabilize, add Claude Code shim with the same backend and near-identical mental model.

Goals:
- keep backend invariant
- only adapt launch/host UX where necessary
- avoid behavior drift

### Governance decisions
- every durable mutation remains explicit and review-based
- automation is allowed only for read-path assembly and safe suggestions
- host-specific behavior must be documented as thin wrapper behavior, not separate product logic

### COO risk view
- launching both hosts too early increases support burden
- unclear support boundary between backend and shim creates debugging confusion
- training users on too many commands too early undermines the “smarter existing agent” story

---

## Recommended Install Shape

### Install story
1. Install the shared Jarvis Fusion backend once.
2. Install or activate the relevant host shim.
3. Continue using the host (`codex`, Claude Code) the way you already do.
4. On session start, Jarvis Fusion quietly assembles context and augments the host interaction.

### Why this install shape wins
It follows the oh-my-codex style insight the user highlighted: a light augmentation layer can change perceived intelligence **without repositioning itself as a separate product surface**.

### Rejected alternatives
- **Separate full app**: breaks the augmentation story.
- **Slash-command-first product**: increases friction and feels too tool-like.
- **Single binary with many host flags as the primary story**: operationally possible, but weaker as a user-facing wedge than host-native shims over a shared backend.
- **Separate backend per host**: violates the single-brain architecture and increases drift.

---

## Final Recommendation

### What should be built
- one shared local brain backend
- one thin Codex shim first
- one thin Claude Code shim after Codex fit is proven
- startup augmentation as the main value surface
- minimal optional explicit command set for power users

### What should not be the primary story
- slash commands
- a separate app UI
- host-divergent feature sets
- invisible durable-state mutations

## Implementation Handoff
This memo should feed the next planning/execution step for:
- `docs/08-implementation-backlog.md` Workstream 9 (`OMX + Codex Facade / Runtime`)
- repo scaffolding under `src/facade/` and `src/session-runtime/`
- host shim packaging decisions alongside the shared backend runtime
