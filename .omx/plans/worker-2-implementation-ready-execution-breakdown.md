# Worker 2 — Implementation-Ready Execution Breakdown

## Scope
- Task owner: `worker-2`
- Role: planner
- Objective: turn the updated Jarvis Fusion planning docs into a concrete implementation sequence that the next coding session can start from immediately.
- Grounding docs: `docs/05-implementation-roadmap.md`, `docs/07-v1-architecture-spec.md`, `docs/08-implementation-backlog.md`, `docs/09-repo-module-plan.md`, `docs/10-storage-and-import-strategy.md`, `docs/12-cognitive-data-model-and-flows.md`, `docs/13-core-schemas-and-contracts.md`, `docs/14-host-integration-executive-review.md`

## Evidence from repo inspection
- The repository currently contains **docs only** at the root; there is no existing `src/` scaffold yet.
- That means the next implementation session must begin with **contract freeze + repo bootstrap**, not feature work.
- The planning docs already converge on the same architecture: **one shared local backend** with **thin host shims** for Codex and Claude Code.

## Executive summary

The implementation order should be:
1. freeze the contracts that every other module depends on,
2. scaffold the repo/module layout,
3. build the truth kernel and its persistence boundary,
4. add archive/graph/context-pack plumbing,
5. add pages and promotion review,
6. finish with Codex-first host shim validation,
7. defer Claude Code parity until the shared backend contract is stable.

This is the smallest sequence that preserves the documented ownership model:
- **truth kernel** owns current truth
- **MemPalace** owns archive evidence
- **ontology/graph support** improves retrieval but does not own truth
- **knowledge pages/cards** are human-readable views, not state owners
- **session runtime / facade** orchestrates reads and explicit writes
- **host shims** only translate host affordances

---

## Implementation work packages

### WP0 — Contract freeze and scope lock
**Purpose:** prevent downstream churn before any code exists.

**Outputs**
- canonical domain schema set
- `ArchiveProvider` contract
- `SessionContextPack` contract
- knowledge page schema
- promotion candidate schema
- explicit automatic-vs-explicit boundary note

**Must decide**
- one SQLite-backed truth store for v1
- one archive abstraction with MemPalace as the default provider
- one canonical page/card surface under `knowledge/`
- read-only automatic session-start behavior only

**Done when**
- the schema list from `docs/13` is fixed as the source of truth
- the scope excludes deployment, multi-user, public API hardening, and auto-promotion
- Claude Code parity is explicitly marked as later than Codex-first stabilization

**Verification gate**
- documented contract checklist has no unresolved ambiguity
- no module is allowed to invent its own version of truth/archive/page ownership

---

### WP1 — Repo scaffold and module boundaries
**Purpose:** create the filesystem and package boundaries that every later task will live in.

**Target layout**
- `src/contracts/`
- `src/truth-kernel/`
- `src/archive-kernel/`
- `src/ontology-support/`
- `src/knowledge-pages/`
- `src/promotion/`
- `src/facade/`
- `src/session-runtime/`
- `src/host-shims/codex/`
- `src/host-shims/claude-code/`
- `src/adapters/mempalace/`
- `src/adapters/source-readers/`
- `src/shared/`
- `tests/unit/`
- `tests/integration/`
- `tests/operator/`
- `knowledge/pages/`
- `knowledge/cards/`

**Done when**
- each module has a clear responsibility and no ownership overlap
- host shims are explicitly marked as translation layers only
- tests are split into unit / integration / operator lanes

**Verification gate**
- repo structure matches the module map in `docs/09`
- no code is placed directly in the root or in ambiguous shared folders

---

### WP2 — Truth kernel foundation
**Purpose:** build the canonical current-truth store first.

**Core responsibilities**
- SQLite persistence
- entity / relationship / decision / preference / promoted-memory tables
- provenance records
- claims and promotion candidates
- contradiction / supersede primitives

**Implementation sequence**
1. create migrations/schema definitions
2. implement repository read/write APIs
3. add query helpers for current truth and session-start selection
4. add provenance plumbing to every mutating path

**Done when**
- current truth can be read from the new store
- promoted facts always carry provenance
- supersede/contradiction metadata is preserved

**Verification gate**
- unit tests for schema validation and basic CRUD
- unit tests for supersede/contradiction behavior
- typecheck or equivalent compile gate passes

---

### WP3 — Archive integration boundary
**Purpose:** connect historical evidence without letting it own truth.

**Core responsibilities**
- `ArchiveProvider` interface
- MemPalace-backed provider implementation
- evidence bundle assembly
- pointer/reference handling
- failure/degraded-mode behavior

**Implementation sequence**
1. define the provider interface in contracts
2. implement the simplest local MemPalace adapter that satisfies it
3. normalize archive output into evidence bundles
4. keep archive results separate from truth answers

**Done when**
- historical recall works through an abstraction, not hard-coded source coupling
- archive output is never treated as authoritative truth

**Verification gate**
- integration test proves archive results are surfaced as appendix/evidence only
- negative test proves archive cannot overwrite truth

---

### WP4 — Graph / ontology support
**Purpose:** improve retrieval quality without creating a second owner of reality.

**Core responsibilities**
- entity/relation traversal helpers
- connected-context expansion
- relationship typing support
- contradiction lookup aids

**Implementation sequence**
1. implement graph-friendly query primitives on top of truth data
2. add traversal helpers for project/person/system context expansion
3. expose graph context as a compressed retrieval layer

**Done when**
- relevant connected context can be derived from truth records
- graph output improves session-start quality without changing truth semantics

**Verification gate**
- unit tests for traversal patterns
- integration test for project/person/system expansion

---

### WP5 — Session runtime and context pack assembly
**Purpose:** make the session-start experience the primary operator wedge.

**Core responsibilities**
- `SessionContextPack` assembly
- truth highlights
- graph context
- recent changes
- optional evidence appendix
- related pages

**Implementation sequence**
1. wire truth-first retrieval
2. add graph expansion
3. optionally append archive evidence
4. assemble the final context pack with a compact operator-friendly shape

**Done when**
- session-start produces a compact, useful context bundle
- archive evidence stays separated from direct truth

**Verification gate**
- integration test for `SessionContextPack` shape
- operator smoke test for a representative session-start scenario

---

### WP6 — Knowledge pages and promotion workflow
**Purpose:** create the readable surface and the reviewed write path.

**Core responsibilities**
- page/card markdown generation
- page metadata
- claim → promotion candidate flow
- review / accept / reject / supersede actions
- page refresh after accepted promotions

**Implementation sequence**
1. create canonical page/card schema and storage policy
2. implement page synthesis from truth + graph + evidence
3. implement promotion review flow
4. update related pages after accepted truth changes

**Done when**
- pages/cards are human-readable and link back to truth/evidence
- promotion requires review and provenance

**Verification gate**
- integration test for page synthesis
- integration test for promotion acceptance and page refresh
- negative test proving no auto-promotion

---

### WP7 — Codex-first thin host shim
**Purpose:** validate the shared-backend + thin-host-shim architecture on the first host.

**Core responsibilities**
- host detection / workspace bootstrap
- startup validation
- context-pack request wiring
- fallback / degraded mode handling
- host affordance translation only

**Implementation sequence**
1. wire the Codex enhanced entry path
2. call the shared backend session-start contract
3. translate the result into Codex-native startup behavior
4. keep all durable state ownership outside the shim

**Done when**
- Codex can start with a useful context pack from the shared backend
- the shim does not own truth, archive, page, or promotion state

**Verification gate**
- operator smoke test for Codex startup path
- regression test for degraded mode and safe fallback

---

### WP8 — Claude Code parity later
**Purpose:** keep the second host out of the critical path until the backend contract is proven.

**Rule**
- do **not** start parity work until Codex-first behavior is stable
- parity should reuse the same backend verbs and semantics
- only host affordances may differ

**Done when**
- the backend contract can be reused without semantic drift
- host-specific divergence stays limited to translation/UI affordance

**Verification gate**
- parity checklist compares verbs, semantics, and ownership boundaries

---

## Milestones and sequencing

### Milestone M0 — Contract freeze
**Exit criteria**
- schema/contract set is locked
- ownership boundaries are explicit
- scope exclusions are recorded

### Milestone M1 — Scaffold ready
**Exit criteria**
- repo/module layout exists
- test folders exist
- no ownership overlap in file layout

### Milestone M2 — Truth + archive path
**Exit criteria**
- truth kernel stores and retrieves current truth
- archive evidence can be queried and kept separate
- provenance is preserved

### Milestone M3 — Session-start wedge
**Exit criteria**
- `SessionContextPack` is assembled from truth + graph + optional evidence
- operator sees a compact, useful startup bundle

### Milestone M4 — Readable views and reviewed writes
**Exit criteria**
- pages/cards exist
- promotion is review-based
- accepted changes refresh related views

### Milestone M5 — Codex-first host validation
**Exit criteria**
- Codex thin shim works end to end
- degraded mode is safe
- no durable ownership leaks into the shim

### Milestone M6 — Claude parity later
**Exit criteria**
- shared backend verbs are stable enough to reuse
- parity work can proceed without redesigning core semantics

---

## Verification gates for the first implementation session

The next coding session should not merge anything until all of these are true:

1. **Typecheck / compile gate**
   - the newly introduced code compiles cleanly
   - no missing exports or schema mismatches remain

2. **Unit test gate**
   - truth kernel CRUD and provenance logic are covered
   - traversal helpers and schema validators are covered

3. **Integration test gate**
   - session-start assembles a valid `SessionContextPack`
   - archive evidence is append-only support, not truth
   - page synthesis and promotion flows work end to end

4. **Operator smoke gate**
   - Codex-first startup path returns a useful startup bundle
   - degraded mode falls back safely

5. **Regression gate**
   - no source system write path exists
   - no automatic promotion exists
   - host shim does not become a hidden owner

---

## Immediate next-step work package for the implementation session

Start with this exact order:
1. create `src/contracts/` and freeze the schema surface
2. scaffold `src/truth-kernel/` and the SQLite migration boundary
3. define `ArchiveProvider` and the MemPalace adapter shell
4. wire `SessionContextPack` assembly
5. add the first page/promotion test cases
6. only then wire the Codex shim

That order gives the implementation session a clear dependency chain and prevents the host shim from pulling architecture decisions forward too early.

---

## Open risks
- MemPalace transport details may still influence the adapter implementation, but the abstraction should stay fixed.
- Because the repo has no existing code scaffold, the first session must create both structure and tests together.
- Claude Code parity is intentionally deferred; trying to do it early would add churn before the backend contract is proven.

