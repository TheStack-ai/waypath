# Tasks

## Phase 1 — Config / Runtime Maturity
- [x] add `config.toml` loading
- [x] add env override precedence
- [x] expose runtime knobs for source adapters / retrieval weights / import policy
- [x] preserve zero-config current behavior

## Phase 2 — Retrieval Strategy Separation
- [x] isolate current recall scoring into a retrieval strategy layer
- [x] split lexical / provenance / source-weight / graph-relevance scoring
- [x] define future vector hook boundary

## Phase 3 — Domain Model Hardening
- [x] define typed shapes for session / source / review / stale / contradiction flows
- [x] reduce ad-hoc string formatting in operator surfaces
- [x] align façade and storage around the same model terms

## Phase 4 — Verification Hardening
- [x] add config edge-case tests
- [x] add retrieval regression tests
- [x] add contradiction / stale / review queue regression tests
- [x] keep install smoke passing

## First execution slice
- [x] implement Phase 1 with a bounded team run
