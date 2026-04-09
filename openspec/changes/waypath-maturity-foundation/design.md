# Design

## Goal

Waypath의 현재 가치인

- local-first
- installable CLI
- explicit review
- read-only source adapters
- graph-aware context

를 유지하면서,
Honcho에서 검증된 구조적 discipline만 선택적으로 흡수한다.

---

## Design Principles

### 1. Local-first identity is immutable
- SQLite truth store 유지
- CLI-first 유지
- source adapters read-only 유지

### 2. Maturity over expansion
- 새로운 거대한 subsystem을 추가하지 않는다
- existing vertical slices의 구조를 더 explainable / configurable / testable 하게 만든다

### 3. Strategy layers must be separable
- config logic
- retrieval logic
- domain object interpretation
는 façade 내부에 뭉개지지 않고 분리 가능한 형태가 되어야 한다

---

## Architecture Changes

## A. Config / Runtime Layer

Introduce a small configuration layer under `src/shared/config/` that:

- loads `config.toml` when present
- overlays environment variables
- exposes runtime knobs for:
  - source reader enable/disable
  - retrieval weights
  - import behavior
  - review queue limits

This must preserve current defaults when no config file exists.

## B. Retrieval Strategy Layer

Introduce a retrieval strategy surface under `src/archive-kernel/retrieval/` or an equivalent location that separates:

- lexical score
- provenance score
- source-system weight
- graph relevance
- future vector hook

The current recall behavior should be re-expressed through this layer without losing compatibility.

## C. Domain Model Hardening

Promote the following concepts from implicit strings to clearer modeled shapes:

- session runtime identity
- source anchor / import run
- review queue item
- stale item
- contradiction item

These do not need a full new persistence subsystem immediately, but contracts should stop depending on ad-hoc formatting.

## D. Verification Hardening

Add tests for:

- config precedence
- import normalization edge cases
- retrieval ranking invariants
- contradiction / stale / review queue regression

---

## What We Intentionally Do Not Borrow from Honcho

- FastAPI service shell
- Postgres + pgvector as the primary storage model
- background deriver queue as the default execution model
- webhook/telemetry-heavy operational architecture

These are valid for Honcho’s product shape, but not for Waypath’s current CLI wedge.

---

## Initial execution slice

The first safe implementation slice is:

1. add config/runtime layer
2. wire it into current CLI defaults non-destructively
3. verify no regressions

This is the best first step because it improves control and future extensibility
without touching Waypath’s truth/archive ownership model.
