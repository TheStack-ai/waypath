# Worker 1 — Executive Review Memo for Packaging and Host Integration

## Scope
- Task owner: `worker-1`
- Role: planner
- Focus: packaging, host integration, install shape, automatic vs explicit behavior, slash-command stance, and rollout framing so Jarvis Fusion feels like an upgraded Claude Code / Codex brain rather than a separate app.
- Grounding: `README.md`, `docs/04`, `docs/05`, `docs/07`, `docs/08`, `docs/09`, `docs/10`, `docs/11`, `openspec/changes/unify-kernel-archive-system/design.md`, `.omx/context/host-integration-strategy-20260408T053653Z.md`

---

## Executive summary

**Recommended default:** ship **one shared local brain backend** plus **thin host-specific shims** for Codex and Claude Code.

The product should be packaged as an **augmentation layer**, not a new daily destination app:
- **one install** provisions the shared backend, local storage, knowledge-page paths, and host adapters
- **daily use** happens through the user’s existing host (`Codex`, `Claude Code`) via thin wrappers/entry shims
- **automatic behavior** is limited to safe session-start context assembly and read-only assistance
- **write / promotion / re-import actions** remain explicit
- **slash commands are secondary sugar**, not the primary contract

This matches the existing repo thesis that Jarvis Fusion is an **external brain layer** above the host agent rather than a replacement product (`docs/11-product-thesis-and-differentiation.md`, `docs/07-v1-architecture-spec.md`).

---

## RALPLAN-DR

### Principles
1. **Host-first feel over app-first feel** — the user should feel their current agent got smarter, not that they launched another tool.
2. **Shared backend, thin shims** — truth/archive/graph/page ownership stays centralized; host logic stays minimal.
3. **Automatic reads, explicit writes** — startup/context may be automatic; truth mutation, promotion, import, and host overrides must be deliberate.
4. **Host-agnostic core contract** — slash commands or host UX sugar must sit on top of a stable backend action model.
5. **Roll out with low-surprise defaults** — no shadow binary replacement, no hidden sync, no auto-promotion.

### Drivers
1. Existing design docs define Jarvis Fusion as an **augmentation layer** above Codex / Claude Code rather than a replacement runtime.
2. Repo architecture already assumes a **shared local truth kernel + archive integration + façade** rather than per-host ownership (`docs/07`, `docs/09`, `docs/10`).
3. User explicitly wants inspiration from **oh-my-codex style activation** but also wants the experience to feel like the existing host became smarter, not like a new app (`.omx/context/host-integration-strategy-20260408T053653Z.md`).

### Options considered

#### Option A — New standalone Jarvis Fusion app / shell
- **Rejected**
- Why: violates the augmentation thesis, creates app-switching overhead, and weakens the “same host, smarter brain” wedge.

#### Option B — Fully branded launcher as the daily primary surface
- Example: users mostly run `jarvis` and only indirectly reach Codex / Claude Code.
- **Rejected as default**
- Why: useful for onboarding/admin, but too easily turns the product into a new destination app.

#### Option C — Shared backend with host-specific thin shims (**chosen**)
- Users install one backend and opt into Codex/Claude host packs.
- Daily experience remains host-led.
- Host shims only inject the session-start brain behaviors and expose a tiny set of brain actions.

### Decision
Choose **Option C**.

---

## ADR

### Decision
Package Jarvis Fusion as a **single local backend distribution** with **optional host packs** for Codex and Claude Code. Use host-first wrappers for daily use, keep a small branded admin/install surface, and treat slash commands as optional host sugar rather than the system’s primary API.

### Why this was chosen
- Aligns with the architecture already documented: façade orchestrates; it does not own truth (`docs/07`, `openspec/.../design.md`).
- Preserves the local-first/operator-first model with one SQLite truth owner, one archive boundary, and one knowledge/page surface (`docs/10`).
- Maximizes perceived value: the host remains familiar while Jarvis Fusion supplies better memory, recall, graph context, and promotion governance.

### Alternatives considered
- Standalone app shell — rejected for product feel and higher switching cost.
- Shadowing or replacing the native `codex` / `claude` binaries by default — rejected for trust, debuggability, and rollback risk.
- Slash-command-first interaction model — rejected because it fragments by host and makes the product feel like bolt-on UI instead of native intelligence.

### Consequences
- Need a stable cross-host backend action model before building UX sugar.
- Need two thin shims that stay intentionally small.
- Documentation must clearly separate **install/admin commands** from **daily brain actions**.

### Follow-ups
- Define canonical backend verbs for session-start, recall, page, and promotion.
- Specify Codex-first shim behavior and Claude Code parity target.
- Add validation criteria for startup latency, explainability, and rollback.

---

## Department memos

## 1) CTO + Platform Architecture

### Recommendation
Use **one shared local backend** with:
- one truth owner (SQLite)
- one archive boundary (MemPalace adapter)
- one knowledge/page surface
- one façade contract
- **two thin host shims**: Codex and Claude Code

### Rationale
The repo already converges on a single local truth kernel, a strict façade, and adapters for source/archive systems (`docs/07`, `docs/09`, `docs/10`). Duplicating brains per host would create split-brain drift and contradict the documented ownership model.

### Concrete packaging / host decisions
- **Installer shape:** one bootstrap/install command sets up backend storage, knowledge directories, config, and selected host shims.
- **Core package shape:**
  - `jarvis-fusion-core` (shared backend)
  - `jarvis-fusion-host-codex` (thin shim)
  - `jarvis-fusion-host-claude` (thin shim)
- **Daily entry stance:** host-first wrapper or opt-in alias, not a new mandatory app shell.
- **Automation stance:** safe startup reads only. No automatic promotion, no hidden bidirectional sync, no archive overwrite.
- **Slash commands:** optional compatibility layer only; they must map onto stable backend verbs rather than becoming the system contract.

### Risks
- Shim drift between hosts
- Startup latency
- Over-automation that obscures provenance or confuses ownership

### Mitigations
- Shared backend contract tests
- strict host shim scope
- explicit provenance surfaces in every write/promotion flow
- startup latency budget and degrade-to-no-op behavior

---

## 2) CPO + User Wedge

### Recommendation
Sell the experience as **“your existing coding agent now starts with memory, context, and recall”**.

The strongest wedge is:
- install once
- keep using your familiar host
- immediately feel better session starts, better recall, and cleaner continuity

### Rationale
`docs/11` and the host-integration context both say the product is an external brain layer. The wedge is not “more commands”; it is **less forgetting, better continuity, and faster orientation**.

### Concrete user journey
1. User runs one installer and chooses host packs.
2. Next time they start Codex / Claude Code through the installed shim, they get:
   - current focus
   - relevant truth
   - graph-connected context
   - recent changes / promotions
   - optional evidence appendix when useful
3. They continue talking to the host normally.
4. Only when needed, they explicitly ask for:
   - deeper recall
   - a page/card view
   - a promotion review

### Minimal explicit command set
Canonical actions should stay tiny:
1. **start** — assemble / refresh session context pack
2. **recall** — pull deeper historical evidence
3. **page** — open or synthesize a human-readable page/card
4. **promote** — review and accept a truth update

These actions can appear as:
- host-native slash aliases where supported
- plain-language prompt recipes/macros
- CLI/MCP verbs beneath the shim

### Slash-command stance
- **Not required as primary UX**
- Useful as mnemonic shortcuts on hosts that already normalize them
- Must remain strictly secondary to the host-agnostic backend verbs

### Automatic vs explicit
**Automatic at startup:**
- repo/project detection
- session-start context pack assembly
- recent changes / relevant truth summary
- safe no-op fallback when context confidence is low

**Explicit only:**
- archive deep dives
- promotion/write actions
- source bootstrap/re-import
- opening/synthesizing pages on demand
- host override/debug/admin operations

### Risks
- Too many branded commands make the product feel like a new app
- Too much startup output becomes noisy
- Users may not understand why some recall is automatic and some is explicit

### Mitigations
- keep startup output compact and provenance-linked
- constrain the explicit surface to 3–4 verbs
- document “automatic read help vs explicit write/review” as a core rule

---

## 3) CDO + Interaction / Brand

### Recommendation
The interaction language should be **host-forward, brain-powered**.

Jarvis Fusion branding should appear in:
- install/admin/setup surfaces
- lightweight startup indicators
- provenance / page / promotion labels

It should **not** dominate the daily invocation path.

### Rationale
If the brand becomes the main entrypoint, the product reads as a separate app. If the host remains primary, the system reads as a deep enhancement.

### Concrete interaction / brand decisions
- Prefer naming that keeps the host legible:
  - backend/admin commands can be `jarvis-fusion ...`
  - daily host surfaces should stay host-first or host-adjacent
- Use concise startup affordances such as:
  - “Brain context loaded”
  - “Recent decisions / evidence available”
- Avoid an always-visible branded shell unless the user explicitly opts into it.
- Keep slash commands branded only if they feel native inside the host; otherwise prefer plain-language recipes.

### Slash-command interaction verdict
Slash commands help only when they act as **rememberable shortcuts**. They hurt when they become the main mental model. The primary experience should remain: “I talk to Codex / Claude Code, and it now remembers / recalls / structures context better.”

### Risks
- Over-branding can make the host feel wrapped or hijacked
- Under-branding can make product value invisible

### Mitigations
- brand the install/admin/control plane
- keep the runtime experience subtle, explainable, and host-compatible
- show value through context quality, not through a large new command vocabulary

---

## 4) COO + Rollout / Chief-of-Staff synthesis

### Recommendation
Roll out **Codex first, Claude Code second**, with explicit opt-ins and strong rollback.

### Rationale
The repo is already oriented around OMX + Codex local-first usage, so Codex is the lowest-risk proving ground. Claude Code should follow once the backend verbs and startup behavior are stable.

### Concrete rollout plan

#### Phase 1 — Shared backend + Codex shim
- backend install/bootstrap
- startup context pack
- explicit recall/page/promote actions
- operator validation on real daily workflows

#### Phase 2 — Claude Code shim parity
- replicate the same backend verbs
- add the thinnest possible host adapter
- preserve identical ownership and provenance rules

#### Phase 3 — Optional UX sugar
- slash aliases where genuinely useful
- optional convenience launcher for onboarding/demo/admin use
- docs for host-by-host setup and rollback

#### Later phases (defer)
- multi-user packaging
- deployment/service hosting
- background sync
- host binary replacement by default
- automatic promotion
- richer cross-host live state sync

### Default behaviors vs explicit opt-ins
**Default:**
- safe startup context assembly
- read-only augmentation
- provenance-linked outputs

**Opt-in:**
- aliasing or wrappering a preferred host command
- slash shortcuts
- promotion/re-import/write actions
- aggressive automatic context loading modes

### Risks and mitigations
- **Risk:** startup magic feels opaque  
  **Mitigation:** show compact provenance/explainability and keep a disable flag
- **Risk:** wrapper/alias install breaks trust  
  **Mitigation:** opt-in only, never default shadow replacement
- **Risk:** host parity drifts  
  **Mitigation:** shared contract tests + host conformance checklist
- **Risk:** scope balloons into deployment/app packaging too early  
  **Mitigation:** codify later-phase exclusions in rollout docs

---

## Concrete decisions to hand off

### Install shape
- **One installer** provisions the shared backend and selected host packs.
- Keep a **small branded control plane** for install/doctor/config/admin tasks.
- Do **not** package the product primarily as a standalone daily shell.

### Host integration model
- Shared backend + thin host shims.
- Codex-first implementation, Claude Code second.
- No split-brain per-host stores.

### Slash commands
- Secondary only.
- Support them where they reduce memory burden.
- Do not make them the canonical system interface.

### Minimal command/action set
1. `start`
2. `recall`
3. `page`
4. `promote`

### Automatic vs explicit
**Automatic:** startup context assembly, relevant truth summary, recent-change hints.  
**Explicit:** deep recall, page generation/open, promotion, import/re-import, admin/debug/override.

### Host shims that should exist
- Codex shim
- Claude Code shim
- optional branded admin/install surface

---

## Suggested implementation handoff

### Files / modules most likely to carry this
- `src/facade/`
- `src/session-runtime/`
- `src/contracts/`
- `src/adapters/`
- install/bootstrap scripts and docs

### Verification path for downstream execution
1. Validate startup context usefulness in Codex first.
2. Validate no hidden writes / no auto-promotion.
3. Validate host shim can be disabled/rolled back cleanly.
4. Validate explicit actions map to the same backend verbs in both hosts.
5. Validate the product still feels host-led in operator testing.

---

## Final recommendation in one line

> **Package Jarvis Fusion as one local brain backend with thin Codex/Claude host shims, keep startup context automatic but all truth-changing actions explicit, and treat slash commands as optional sugar so users feel their existing agent got smarter rather than replaced.**
