# Worker 3 — Implementation-Ready Execution Breakdown

## Purpose
Turn the updated Jarvis Fusion planning set into a concrete execution map that the next implementation session can follow without re-litigating architecture.

## Evidence base
- `README.md`
- `docs/07-v1-architecture-spec.md`
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/13-core-schemas-and-contracts.md`
- `docs/14-host-integration-executive-review.md`
- `openspec/changes/unify-kernel-archive-system/tasks.md`

## Repository fact check
- This workspace is currently **docs / plan only**; there is no runtime source tree yet.
- The planning docs already converge on a single architecture:
  - one shared local backend
  - thin host shims
  - read-only source systems
  - explicit write boundaries for promotion / mutation

## Execution thesis
The implementation sequence should start with the contracts and the truth kernel, then add archive, graph, page, and promotion layers, and only after that expose the thin Codex host shim.

The goal is not to build a host-specific app. The goal is to make the shared backend authoritative and let hosts translate into it.

---

## Milestone 0 — Spec lock and repo scaffold

### Objective
Make the repository ready for implementation without ambiguity in ownership, package boundaries, or contract shape.

### Work packages
1. Freeze the contract set:
   - `SessionContextPack`
   - `ArchiveProvider`
   - `PromotionCandidate`
   - knowledge page schema
   - host shim / façade verbs
2. Define the repo/module skeleton that will hold the first code:
   - `src/contracts`
   - `src/truth-kernel`
   - `src/archive-kernel`
   - `src/ontology-support`
   - `src/knowledge-pages`
   - `src/promotion`
   - `src/facade`
   - `src/session-runtime`
   - `src/host-shims/codex`
3. Lock the storage and data-path conventions before any persistence code lands.

### Acceptance criteria
- Every contract in `docs/13` has a concrete implementation target.
- The module boundary list is stable enough for the first scaffold commit.
- No workstream requires host-specific truth ownership.

### Verification gate
- Planning review confirms no doc contradictions remain between `docs/07`, `docs/09`, `docs/13`, and `docs/14`.

---

## Milestone 1 — Truth kernel vertical slice

### Objective
Create the first durable local source of truth and make it queryable before any archive or host integration work expands scope.

### Work packages
1. Implement local truth storage with the minimum schema from `docs/13`.
2. Add repositories / query interfaces for:
   - decisions
   - preferences
   - entities
   - relationships
   - promoted memories
   - provenance records
   - promotion candidates
3. Implement the session-start truth query pack.
4. Add a small validation harness that proves current truth can be read without graph or archive dependencies.

### Acceptance criteria
- Current truth is readable from the new backend.
- Session-start inputs can be assembled from truth alone.
- Truth writes are owned by the backend, not by the host shim.

### Verification gate
- Unit coverage for schema validation and query assembly.
- Integration coverage for at least one read path that returns a usable `SessionContextPack` skeleton.

---

## Milestone 2 — Archive + graph retrieval support

### Objective
Add evidence recall and connected-context expansion without collapsing archive into truth.

### Work packages
1. Define the `ArchiveProvider` interface and its MemPalace-backed implementation.
2. Add evidence-bundle formatting for archive results.
3. Implement graph / ontology traversal helpers for the traversal patterns in `docs/13`.
4. Compose truth-first retrieval with optional archive appendix and graph expansion.

### Acceptance criteria
- Archive results are exposed as evidence, not as truth.
- Graph expansion improves context selection without becoming a second truth owner.
- Retrieval can explain related entities / relationships alongside current truth.

### Verification gate
- Integration tests prove truth-first retrieval works with archive disabled.
- A second integration path proves archive data appears only in the evidence appendix.

---

## Milestone 3 — Knowledge page and promotion flows

### Objective
Provide the human-readable canonical surface and the explicit review gate for truth mutation.

### Work packages
1. Implement the knowledge page / wiki schema and storage rule.
2. Implement page synthesis from truth + graph + evidence.
3. Implement promotion candidate creation, review, and apply flows.
4. Wire provenance and contradiction / supersede updates into promotion.

### Acceptance criteria
- Canonical pages/cards are human readable and linked back to evidence.
- Promotion cannot happen without review.
- Every promoted truth carries provenance.

### Verification gate
- Tests cover accepted, rejected, superseded, and needs-more-evidence outcomes.
- A promotion flow test proves truth is refreshed and evidence remains traceable.

---

## Milestone 4 — Thin Codex host shim

### Objective
Expose the shared backend through a minimal Codex-facing entry layer that translates host affordances only.

### Work packages
1. Implement the Codex thin shim as a bootstrap / translation layer.
2. Add startup context-pack validation and degraded-mode handling.
3. Map the stable backend verbs to host-facing commands or entry points.
4. Keep host integration read-first and explicit-write only.

### Acceptance criteria
- The shim can start a session, request context, and forward explicit actions.
- The shim has no storage ownership of truth, archive, pages, or promotion.
- The Codex path is useful before Claude Code parity exists.

### Verification gate
- Operator-level run proves the host gets a useful context pack on start.
- A negative test confirms no durable mutation happens through automatic startup.

---

## Milestone 5 — Hardening and parity follow-up

### Objective
Validate the first implementation slice end-to-end and leave Claude Code parity as a follow-on lane.

### Work packages
1. Run the operator validation scenarios from `docs/08`.
2. Verify source systems remain read-only.
3. Validate fallback / degraded-mode behavior.
4. Defer Claude Code parity until the Codex-first path is stable.

### Acceptance criteria
- Session-start briefing is useful in real operator flow.
- Historical recall improves why / how lookup.
- Graph-assisted retrieval improves connected-context questions.
- Canonical pages/cards are readable and source-linked.
- Archive cannot auto-promote into truth.

### Verification gate
- End-to-end operator checks pass for truth, archive, graph, page, and promotion paths.
- Regression checks confirm the source-system read-only rule still holds.

---

## Next implementation session starter order
Start in this order to keep the scope narrow and executable:

1. Contract freeze / scaffold
2. Truth kernel MVP
3. Archive provider + evidence appendix
4. Graph traversal helpers
5. Session runtime / facade composition
6. Knowledge page synthesis
7. Promotion review flow
8. Codex thin shim

This order matches the documented dependency chain in `docs/09` and the rollout sequence in `docs/13`.

## Risks to watch
- Do not let host integration define truth semantics.
- Do not collapse archive recall into current truth.
- Do not start Claude Code parity before Codex-first validation is stable.
- Do not expand into deployment or multi-user scope during the first implementation slice.

## Open questions
- None blocking for the next implementation session; the remaining decisions are follow-up execution choices, not architecture blockers.

