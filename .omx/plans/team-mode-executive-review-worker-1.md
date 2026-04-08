# Team-Mode Executive Review — Worker 1 Decision Memo

**Date:** 2026-04-08  
**Scope:** Jarvis Fusion packaging and host integration for Claude Code / Codex augmentation  
**Lens:** CTO + Platform Architecture, CPO + User Wedge, CDO + Interaction/Brand, COO + rollout synthesis

---

## Evidence Base

This memo is grounded in the current repo artifacts:

- `README.md`
- `docs/07-v1-architecture-spec.md`
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/10-storage-and-import-strategy.md`
- `docs/11-product-thesis-and-differentiation.md`
- `docs/12-cognitive-data-model-and-flows.md`
- `.omx/context/host-integration-strategy-20260408T053653Z.md`

These sources consistently define Jarvis Fusion as an **external brain layer**, not a replacement agent, and prioritize **operator value, local-first simplicity, truth/archive separation, and OMX/Codex-friendly façade access**.

---

## Executive Recommendation

### Final call
Use **one shared local Jarvis Fusion backend** plus **thin host-specific shims** for Claude Code and Codex.

- **Do not ship a standalone app UX in v1.**
- **Do not make slash commands the primary interface.**
- **Do make session-start augmentation automatic when entering through the shim.**
- **Do keep high-impact actions explicit**: promotion, contradiction resolution, truth overwrite, and optional host alias takeover.
- **Do provide optional host-native slash commands only as convenience affordances**, not as the architectural center of the product.

### What users should feel
> “I installed a brain upgrade for the agent I already use.”

Not:
> “I installed another AI app that happens to talk to Claude Code/Codex.”

---

## ADR Snapshot

### Decision
Adopt a **shared backend + host shim** model.

### Drivers
1. Repo docs define the system as an **agent-native cognitive layer**, not a replacement runtime.
2. `docs/07` and `docs/09` already point toward a façade/session-runtime boundary rather than a separate application shell.
3. `docs/10` optimizes for local-first SQLite + markdown knowledge surfaces + explicit import boundaries, which aligns with a shared backend.
4. `docs/11` emphasizes operator value and augmentation over deployment-scale productization.
5. The host-integration context explicitly asks for an **oh-my-codex-like activation feel** where the host becomes smarter.

### Options considered

#### Option A — Standalone Jarvis Fusion app
- **Rejected** for v1.
- Violates the augmentation thesis.
- Creates app-switching cost and makes the product feel like a replacement surface.

#### Option B — Slash-command-first UX inside each host
- **Rejected as primary.**
- Too host-specific.
- Harder to keep Claude Code and Codex behavior aligned.
- Makes the product feel like a plugin gimmick instead of a pervasive cognitive layer.

#### Option C — Shared backend + thin host shims + optional slash conveniences
- **Chosen.**
- Best matches the existing architecture docs and the user’s stated desired feel.
- Preserves one truth/archive/graph/page system while exposing host-appropriate entrypoints.

### Consequences
- We need a clean host abstraction layer early.
- We should resist branding/UI decisions that make the shims feel like a new app family.
- We can roll out safely: explicit launcher first, optional alias takeover later.

---

## Department Memos

## 1) CTO + Platform Architecture

### Recommendation
Make Jarvis Fusion a **single local backend installation** with **per-host launcher shims** and **host adapters**.

### Rationale
The repo’s architecture (`docs/07`, `docs/09`, `docs/10`) already assumes:
- one truth owner,
- one archive boundary,
- one knowledge/page layer,
- one façade/session-runtime layer.

Splitting that into separate host products would create operational drift, duplicate persistence/config logic, and undermine the system’s central claim that the host agent is merely getting better context and memory.

### Concrete packaging decisions

#### Package shape
Ship one installable package, for example:

```bash
jarvis-fusion install --host auto
```

with a backend layout like:

```text
~/.jarvis-fusion/
  config/
  data/
    truth.db
  knowledge/
    pages/
    cards/
  cache/
  logs/
  adapters/
```

#### Host integration shape
Install thin wrappers/adapters for:
- `codex`
- `claude-code`

Recommended v1 wrapper strategy:
- keep upstream binaries untouched,
- install **explicit enhanced launchers** first,
- allow optional shell alias takeover later.

Example:

```text
jf codex        # launches Codex with Jarvis Fusion augmentation
jf claude       # launches Claude Code with Jarvis Fusion augmentation
```

Optional later opt-in:

```bash
jarvis-fusion install --alias codex
jarvis-fusion install --alias claude-code
```

That second step is explicit because replacing the user’s muscle memory should be opt-in, not automatic.

#### What should be automatic
Automatic when entering through the shim:
- config/bootstrap validation
- backend availability check
- project/workspace detection
- session-start context pack assembly
- lightweight truth/graph/page preload
- optional “what changed since last session” summary

#### What should stay explicit
Explicit only:
- promotion into truth
- contradiction/supersede resolution
- bulk imports/re-imports
- host alias takeover of native commands
- destructive resets/migrations

#### Slash commands decision
- **Primary:** no
- **Secondary convenience:** yes
- **Architecture dependency:** no

The real primitive should be backend actions exposed through the façade/runtime, with slash commands merely mapping onto them when a host supports that well.

### Platform rollout risks
- Host-launch wrapping can become fragile if tied to undocumented host internals.
- Aliasing `codex` or `claude-code` too early may damage trust if anything breaks.
- If shims diverge in behavior, users will perceive multiple products rather than one brain.

---

## 2) CPO + User Wedge

### Recommendation
The wedge is **instant session-start clarity**, not a command catalog.

The first visible win should be:
1. the user launches their normal host through the Jarvis shim,
2. the session begins with a compact context pack,
3. the agent can immediately answer with better memory, linked decisions, and evidence-aware recall.

### Rationale
`docs/11` and `docs/12` make the value proposition clear: the differentiated output is not “many commands,” it is **better retrieval, better context, and reviewed truth promotion**. The first-run experience should therefore showcase smarter continuity, not feature breadth.

### Concrete first-run decisions

#### First-run activation
After install, the user should be able to do only one memorable thing:

```bash
jf codex
```

or

```bash
jf claude
```

and immediately see:
- active project/focus,
- relevant decisions/preferences,
- linked entities/projects,
- recent promoted changes,
- optional evidence appendix references.

#### Minimal surfaced workflows
Keep the surfaced mental model to four actions:
1. **Start smarter** — automatic session-start context
2. **Recall history** — explicit recall request
3. **Open canonical page** — explicit page/card lookup
4. **Promote reviewed truth** — explicit review/promotion action

#### Minimal command set
Host-agnostic primary commands should be tiny, e.g.:
- `brain start` / automatic on shim launch
- `brain recall <topic>`
- `brain page <entity|project|decision>`
- `brain promote <candidate>`

If slash commands exist inside a host, they should mirror these exact concepts rather than invent host-specific verbs.

#### What helps vs hurts activation
Helps:
- automatic context pack on launch
- one obvious launcher
- project-aware continuity
- “recent changes / what matters now” summary

Hurts:
- requiring users to memorize many slash commands
- making page/retrieval/promotion feel like different tools
- forcing a separate Jarvis UI before value appears

### Product rollout risks
- If the first-run context pack is noisy or generic, the wedge collapses.
- If recall/page/promote flows feel inconsistent across hosts, the product becomes a tool bundle instead of a brain layer.
- Overexposing commands early will make the system feel more complex than smart.

---

## 3) CDO + Interaction / Brand

### Recommendation
Brand the experience as **augmentation of the host**, while branding the backend as Jarvis Fusion.

### Rationale
The repo thesis (`docs/11`) is “external brain layer,” not “new assistant.” The interaction design should therefore minimize visual and verbal signals that suggest app replacement.

### Concrete interaction / branding decisions

#### Interaction principle
The host remains the face.
Jarvis Fusion is the invisible intelligence layer behind it.

#### Naming principle
- Backend/product name: **Jarvis Fusion**
- User-facing posture: **“Jarvis for Codex” / “Jarvis for Claude Code”** only as compatibility descriptors, not separate products.

#### Shim naming
Prefer neutral wrappers that preserve host identity, e.g.:
- `jf codex`
- `jf claude`

Avoid permanently renaming the runtime to a new app-like surface in v1.

#### Slash command posture
Use slash commands as **assistive affordances**, not as the main ceremony.

Good use:
- fast explicit recall
- open page/card
- review promotion candidate

Bad use:
- forcing slash commands for basic “start smarter” behavior
- inventing many branded slash verbs that feel like plugin theater

#### Trust rule: automatic vs explicit
Automatic should feel safe and reversible.
Explicit should guard anything that changes canonical truth or user workflow.

That means:
- **automatic:** context assembly, lookup, page draft generation
- **explicit:** promotion, overwrite, host alias takeover, re-import

### Brand / UX risks
- Too much Jarvis-branded ceremony makes the system feel like a separate assistant.
- Too much hidden automation creates mistrust around truth ownership.
- Overdesigned host-specific affordances will fragment the identity across Codex and Claude Code.

---

## 4) COO + Rollout / Chief-of-Staff Synthesis

### Recommendation
Roll out in three layers: **explicit launcher -> optional alias -> deeper host-native affordances**.

### Rationale
This is the lowest-risk path that preserves reversibility while still moving toward the desired “my agent got smarter” perception.

### Rollout plan

#### Phase 1 — Safe explicit launcher
- Ship shared backend install.
- Ship `jf codex` / `jf claude` wrappers.
- Automatic context pack on launch.
- No native command takeover.
- Slash commands optional/minimal.

**Success bar:** users feel immediate continuity and memory lift without workflow breakage.

#### Phase 2 — Opt-in command takeover
- Offer explicit aliasing of `codex` / `claude-code` to enhanced wrappers.
- Preserve easy rollback.
- Keep diagnostics/doctor command obvious.

**Success bar:** power users choose the enhanced path as their default because trust is established.

#### Phase 3 — Host-native polish
- Add host-native slash conveniences where they materially reduce friction.
- Add project-aware startup heuristics and better context tuning.
- Keep the backend contract host-agnostic.

**Success bar:** host-specific polish improves speed without creating product drift.

### Operating model decisions
- One shared config and persistence root.
- One host abstraction contract.
- One verification story for truth/archive/promotion boundaries.
- One diagnostic surface (`jarvis-fusion doctor` or equivalent).

### Rollout risks
- Shipping alias takeover too early can create support debt.
- Shipping slash-heavy UX too early can confuse the core story.
- Shipping host-specific logic without a stable shared backend contract will create fragmentation and difficult maintenance.

---

## Final Decision Table

| Question | Decision |
| --- | --- |
| Standalone app or augmentation? | **Augmentation** |
| Shared backend or per-host backend? | **One shared local backend** |
| Host integration shape? | **Thin host-specific shims/wrappers** |
| Install entrypoint? | **Single installer with host auto-detect/flags** |
| Replace native commands automatically? | **No; explicit opt-in later** |
| Slash commands primary? | **No** |
| Slash commands allowed? | **Yes, as secondary conveniences** |
| What is automatic? | **Context assembly, lookup, page draft generation, project-aware preload** |
| What is explicit? | **Promotion, contradiction resolution, imports, alias takeover, destructive ops** |
| First visible value? | **Automatic session-start context pack** |

---

## Implementation Handoff

### Recommended build order for this decision
1. Define **shared backend config/data root**.
2. Define **host adapter contract** for Codex and Claude Code.
3. Implement **session-start context pack** as the default shim behavior.
4. Implement **host-agnostic façade verbs** for recall/page/promotion.
5. Add **optional host-native slash mappings** only after the above is stable.
6. Add **opt-in native alias takeover** only after launcher trust is proven.

### Acceptance criteria for this memo
- A user can install one backend and launch either host with the same brain state.
- The first-run experience demonstrates smarter continuity without extra app switching.
- Slash commands are optional convenience, not required infrastructure.
- High-impact truth changes remain explicit and review-gated.
- The rollout path is reversible at every stage.

---

## One-line answer

> **Package Jarvis Fusion as one shared local brain backend with thin Claude Code/Codex launch shims, make session-start augmentation automatic, keep truth-changing actions explicit, and treat slash commands as optional host-native shortcuts rather than the product’s primary UX.**
