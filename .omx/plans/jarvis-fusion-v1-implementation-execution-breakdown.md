# Jarvis Fusion v1 — Implementation Execution Breakdown

## Purpose
Turn the planning docs into an implementation-ready sequence that can be picked up by the next coding session without re-deriving the architecture.

## Evidence base
Grounded in:
- `README.md`
- `docs/05-implementation-roadmap.md`
- `docs/07-v1-architecture-spec.md`
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/10-storage-and-import-strategy.md`
- `docs/13-core-schemas-and-contracts.md`
- `docs/14-host-integration-executive-review.md`
- prior host-integration review memos in `.omx/plans/`

## Non-negotiable architecture rules
1. **One shared backend** owns truth, archive orchestration, graph support, pages, and promotion.
2. **Thin host shims** only translate host affordances and bootstrap the backend.
3. **Source systems are read-only references**; there is no hidden back-write or bidirectional sync.
4. **MemPalace remains the archive owner** behind an `ArchiveProvider` contract.
5. **Knowledge pages are human-readable views**, not the truth owner.
6. **Codex-first rollout** comes before Claude Code parity.
7. **Automatic reads are allowed at session start; durable writes stay explicit and review-based**.

## Critical path
The coding order should be:
1. contracts + repo skeleton
2. truth kernel + provenance schema
3. source readers + bootstrap import boundaries
4. archive adapter + graph/page/promotion core
5. session runtime + façade verbs
6. Codex thin shim
7. end-to-end validation
8. Claude parity backlog only after Codex stabilization

The work can be parallelized after the contract layer is fixed:
- source-reader work can run alongside archive adapter work once the truth schema exists
- archive adapter work can run alongside page/promotion work
- session runtime can start once the contract types exist
- host shim work should wait for façade and session-start contract stability

---

## Work packages

| WP | Scope | Depends on | Deliverable | Done when |
|---|---|---|---|---|
| WP0 | Freeze the implementation contract set | docs review only | A single checklist of canonical schemas, verbs, and ownership boundaries | The team agrees on the same truth/archive/page/promotion boundaries and the same session-start output shape |
| WP1 | Scaffold the repo/module layout | WP0 | `src/contracts`, `src/truth-kernel`, `src/archive-kernel`, `src/ontology-support`, `src/knowledge-pages`, `src/promotion`, `src/facade`, `src/session-runtime`, `src/host-shims/{codex,claude-code}`, `src/adapters/{mempalace,source-readers}`, `src/shared`, and test folders | The repo has the target shape and every later package has a clear home |
| WP2 | Define shared contracts | WP0, WP1 | Type definitions for entities, relationships, decisions, preferences, promoted memories, provenance records, claims, promotion candidates, `ArchiveProvider`, and a `SessionContextPack` with `current_focus`, `truth_highlights`, `graph_context`, `recent_changes`, `evidence_appendix`, and `related_pages` | Downstream modules can compile against the contracts without guessing field names, pack sections, or ownership |
| WP3 | Build the truth kernel foundation | WP2 | SQLite schema/migrations and CRUD/query APIs for canonical truth, provenance, contradiction/supersede handling | Current truth can be read and updated through the kernel, and every mutable truth record carries provenance |
| WP4 | Add source readers and bootstrap import boundaries | WP2, WP3 | Read-only source readers, a bootstrap import manifest, and provenance-aware seed import into the truth kernel | Source systems can be inspected and seeded without write-back, and imported records carry provenance |
| WP5 | Add archive integration as a provider boundary | WP2 | `ArchiveProvider` implementation backed by MemPalace or the simplest local adapter path | Historical recall returns evidence bundles without taking ownership of truth |
| WP6 | Add graph, page, and promotion core flows | WP2, WP3, WP4, WP5 | Relationship traversal helpers, canonical page/card synthesis, promotion candidate creation/review, page refresh after accepted promotions | The system can expand context structurally, synthesize a readable page, and promote a reviewed candidate back into truth |
| WP7 | Implement session runtime and façade verbs | WP2, WP3, WP4, WP5, WP6 | `session-start`, `truth.query`, `archive.query`, `graph.query`, `page.get`, `promotion.submit`, `promotion.review` orchestration and boundary enforcement | One backend entrypoint can assemble a session context pack and route explicit write actions separately from read-only startup behavior |
| WP8 | Build the Codex thin shim first | WP7 | Explicit enhanced entry such as `jf codex`, host/workspace detection, backend pointer wiring, startup validation, degraded-mode fallback | Codex can start through the shim and receive a useful session-start pack without the shim owning truth or archive state |
| WP9 | Validate the end-to-end operator flow | WP3, WP4, WP5, WP6, WP7, WP8 | Integration and operator-level verification harness | A local run proves session-start context assembly, evidence appendices, page lookup, explicit promotion, and no source-system writes |
| WP10 | Prepare Claude parity as a follow-on backlog | WP8, WP9 | A parity checklist and deferred shim notes only | Codex contract is stable, and Claude parity can be added without changing backend semantics |

---

## Milestone structure

### Milestone A — Contract freeze and scaffolding
**Goal:** stop architecture drift before implementation starts.

**Includes:** WP0, WP1, WP2

**Outputs:**
- frozen schema set
- repo/module skeleton
- shared contract package
- explicit ownership map for truth, archive, graph, pages, promotion, façade, runtime, and host shims

**Verification gate:**
- contracts compile cleanly
- no unresolved ownership ambiguity remains in the work package list
- later packages can reference the contracts without duplicating field shapes

---

### Milestone B — Shared backend core
**Goal:** make the backend capable of storing truth, seeding it from read-only sources, pulling evidence, and preparing context.

**Includes:** WP3, WP4, WP5

**Outputs:**
- SQLite-backed truth kernel
- read-only source bootstrap/import path
- provider-based archive integration
- structural graph helpers
- canonical page/card synthesis
- promotion candidate workflow

**Verification gate:**
- truth records persist and reload
- evidence stays separate from truth
- pages are rendered as views only
- promoted items carry provenance
- source systems remain read-only

---

### Milestone C — Session-start façade and runtime
**Goal:** expose the shared backend through one operator-facing flow.

**Includes:** WP7

**Outputs:**
- `SessionContextPack` assembly
- read-only startup path
- explicit write/review path
- degraded-mode handling for missing archive or low-confidence context

**Verification gate:**
- a single call produces current truth + graph context + optional evidence appendix + related pages
- write actions do not happen implicitly during startup
- explicit promotion is routed through review semantics

---

### Milestone D — Codex-first host shim
**Goal:** prove the experience through the first supported host without expanding product surface area.

**Includes:** WP8

**Outputs:**
- Codex launcher/shim entry
- workspace detection and backend wiring
- startup validation
- safe fallback path

**Verification gate:**
- Codex can start through the shim
- the shim does not become a hidden truth/archive owner
- the shim can be disabled or bypassed without losing backend data

---

### Milestone E — Validation and parity backlog
**Goal:** prove the v1 wedge before widening host support.

**Includes:** WP9, WP10

**Outputs:**
- end-to-end operator checks
- safety checks for no source writes
- deferred Claude parity notes

**Verification gate:**
- local validation proves the Codex-first flow is useful and safe
- Claude parity is explicitly deferred until the Codex contract is stable

---

## Recommended implementation order inside the first coding session
1. Create the module skeleton and test folders.
2. Lock the shared contracts package.
3. Implement the SQLite truth schema and repository surface.
4. Add the source-reader bootstrap/import boundary and provenance-aware seed import.
5. Add the archive provider boundary and a minimal MemPalace-backed implementation.
6. Add graph traversal helpers, page synthesis, and promotion review.
7. Wire session-start orchestration and façade verbs.
8. Add the Codex thin shim and startup fallback.
9. Run validation against the whole chain.

This order is chosen because the host shim should never force contract redesigns after the backend shape is fixed.

---

## Verification gates by layer

### Contract layer
- typecheck passes against shared interfaces
- schema fields match the documented truth/page/promotion shapes
- `SessionContextPack` contains the required sections only

### Backend layer
- unit tests cover CRUD, provenance, relationship traversal, and promotion review
- archive results remain in evidence bundles
- knowledge pages stay separate from canonical truth

### Session/runtime layer
- integration tests cover session-start assembly
- read-only startup and explicit write boundaries are enforced
- degraded mode is safe and explainable

### Host-shim layer
- shim startup succeeds in the supported host path
- host-specific code translates instead of owning state
- a bypass path exists for troubleshooting and rollback

### Safety layer
- no direct writes to source systems
- no hidden bidirectional sync
- no auto-promotion of archive evidence into truth
- no host-specific split-brain data roots

---

## Explicit out-of-scope items for this breakdown
- deployment and remote access
- multi-user support
- public API hardening
- fully automatic promotion
- alias takeover as the default installation path
- Claude Code parity before Codex stabilizes

## Next-step handoff sentence
**Start with WP1–WP2, then land WP3 before any host-shim work.**
