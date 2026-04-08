# Repo / Module Plan

## 목적

이 문서는 새 메인 시스템 v1을 실제 구현 가능한 repo/module 단위로 나누기 위한 계획이다.
초기 대상은 OMX + Codex local-first이며, source systems는 reference only다.

---

## Recommended Top-Level Layout

```text
jarvis-fusion-system/
  docs/
  openspec/
  src/
    contracts/
    truth-kernel/
    archive-kernel/
    ontology-support/
    knowledge-pages/
    promotion/
    facade/
    session-runtime/
    host-shims/
      codex/
      claude-code/
    adapters/
      mempalace/
      source-readers/
    shared/
  tests/
    unit/
    integration/
    operator/
  knowledge/
    pages/
    cards/
```

---

## Module Responsibilities

### `src/contracts/`
- shared domain types
- truth result / archive appendix envelope
- provenance metadata shape
- core interfaces

### `src/truth-kernel/`
- current truth storage model
- decisions / preferences / promoted memory / entity state
- truth read/write APIs
- contradiction / supersede primitives

### `src/archive-kernel/`
- archive query abstraction
- evidence appendix assembly
- raw historical recall interfaces

### `src/ontology-support/`
- entity graph access
- relationship traversal
- concept linkage helpers

### `src/knowledge-pages/`
- canonical page/card synthesis
- entity/project/decision/topic page assembly
- page refresh after accepted promotions

### `src/promotion/`
- review workflow
- archive → truth promotion logic
- provenance recording

### `src/facade/`
- OMX + Codex operator-facing entry points
- MCP/CLI orchestration
- shared backend verbs: session-start / recall / page / promote
- truth-first / archive-second / graph-assisted routing
- host shim으로부터 들어오는 요청을 common contract로 정규화

### `src/session-runtime/`
- session-start context assembler
- operator workflow glue
- local runtime configuration
- automatic read / explicit write boundary enforcement
- current truth + historical recall + graph/page synthesis orchestration

### `src/host-shims/`
- host-specific bootstrap / activation layer
- enhanced entry and startup validation
- host affordance translation only
- no truth / archive / promotion ownership

### `src/host-shims/codex/`
- Codex-first thin shim
- `jf codex` / enhanced entry wiring
- startup context pack 주입 및 검증
- alias takeover는 후순위

### `src/host-shims/claude-code/`
- Codex shim contract가 안정화된 뒤 parity만 맞춘다
- backend semantics는 공유하고 host affordance만 번역한다

### `src/adapters/mempalace/`
- MemPalace adapter only
- ingest/retrieval boundary
- no truth ownership

### `src/adapters/source-readers/`
- source systems를 직접 수정하지 않고 참조하기 위한 readers/import helpers
- one-time import 또는 read-only bridge

### `src/shared/`
- logging
- config loading
- reusable utilities

---

## Storage / Ownership Plan

### Truth storage
- 새 시스템 내부 저장소
- current truth의 유일한 owner

### Archive access
- MemPalace adapter 경유
- raw evidence owner는 archive side

### Ontology data
- reasoning support data
- truth ownership과 분리

### Knowledge pages
- 사람에게 보여주는 canonical markdown/text surface
- truth/evidence link를 가지지만 truth owner는 아님

### Session cache / runtime state
- 세션 한정 임시 상태만 허용
- 장기 truth ownership 금지

---

## Import / Reference Strategy

### Rule 1 — No direct mutation of source systems
source systems는 reference source이며 write target이 아니다.

### Rule 2 — Prefer read-only extraction first
초기 단계는 read-only inspection / extraction / adapter 연결 우선이다.

### Rule 3 — Explicit import boundaries
필요한 경우에만 import path를 둔다.
그 경우에도:
- 무엇을 가져오는지
- 언제 동기화하는지
- truth owner가 누구인지
를 명시한다.

### Rule 4 — No hidden split-brain sync
새 시스템과 source systems 사이에 암묵적 양방향 동기화는 금지한다.

---

## Testing Plan by Layer

### Unit
- contracts
- truth-kernel
- ontology-support
- promotion rules

### Integration
- mempalace adapter
- truth/archive/facade orchestration
- graph traversal
- session-start context assembly
- knowledge page synthesis

### Operator
- OMX + Codex 실제 사용 흐름
- retrieval / update / promotion / startup scenarios
- page/card readability review

---

## Immediate Build Sequence

1. `contracts/`
2. `truth-kernel/`
3. `ontology-support/`
4. `archive-kernel/` + `adapters/mempalace/`
5. `session-runtime/` + `facade/`
6. `host-shims/codex/`
7. `promotion/`
8. `knowledge-pages/`
9. `host-shims/claude-code/` parity
10. operator/integration tests

---

## 한 줄 요약

> **repo는 contracts를 중심으로 truth-kernel, archive-kernel, ontology-support, knowledge-pages, promotion, facade, session-runtime을 분리하고, host-shims는 thin bootstrap/translation layer로, MemPalace 및 source-system integration은 adapters로 한정하는 구조가 적합하다.**
