# Tasks

## Phase 1 — Config / Runtime Maturity
- [ ] add `config.toml` loading
- [ ] add env override precedence
- [ ] expose runtime knobs for source adapters / retrieval weights / import policy
- [ ] preserve zero-config current behavior

## Phase 2 — Retrieval Strategy Separation
- [ ] isolate current recall scoring into a retrieval strategy layer
- [ ] split lexical / provenance / source-weight / graph-relevance scoring
- [ ] define future vector hook boundary

## Phase 3 — Domain Model Hardening
- [ ] define typed shapes for session / source / review / stale / contradiction flows
- [ ] reduce ad-hoc string formatting in operator surfaces
- [ ] align façade and storage around the same model terms

## Phase 4 — Verification Hardening
- [ ] add config edge-case tests
- [ ] add retrieval regression tests
- [ ] add contradiction / stale / review queue regression tests
- [ ] keep install smoke passing

## First execution slice
- [ ] implement Phase 1 with a bounded team run
