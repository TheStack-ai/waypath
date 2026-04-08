# Design

## Architecture

이 change는 기존 시스템을 직접 재배치하는 것이 아니라,
**새 메인 시스템의 v1 architecture**를 정의한다.

### Layer 0 — Source References (read-only)
- JCP / Jarvis
- Jarvis Ontology
- jarvis-brain
- MemPalace
- audit / planning artifacts

Responsibilities:
- extraction reference
- design reference
- optional bootstrap import source

### Layer 1 — New Truth Kernel
Responsibilities:
- current truth ownership
- decisions
- preferences
- entities
- relationships
- curated session context

Recommended v1 storage:
- local SQLite

### Layer 2 — Archive Integration
Responsibilities:
- raw transcript recall
- historical evidence recall
- semantic archive query
- evidence appendix formatting

Archive provider:
- MemPalace

### Layer 3 — Ontology / Graph Layer
Responsibilities:
- entity / relation typing
- graph traversal
- multi-hop context expansion
- connected-context reconstruction

### Layer 4 — Knowledge Page / Wiki Layer
Responsibilities:
- canonical page/card synthesis
- human-readable project/entity/decision/topic briefs
- truth/evidence-linked reading surface

### Layer 5 — Promotion / Provenance
Responsibilities:
- promotion candidate intake
- review gate
- provenance tracking
- contradiction / supersede handling

### Layer 6 — Access Facade
Responsibilities:
- unified MCP / operator query surface
- session-start context pack
- truth-first retrieval
- archive-augmented retrieval
- graph-assisted retrieval
- page/card generation
- promotion actions

### Layer 7 — OMX + Codex Operator Workflow
Responsibilities:
- local-first usage
- single-operator workflow
- v1 validation surface

---

## Critical design rules

### Rule 1 — The new system owns current truth
Current truth owner는 **새 시스템의 truth kernel**이다.
기존 source systems는 reference source일 뿐이다.

### Rule 2 — Source systems are read-only
기존 JCP/Jarvis, Ontology, jarvis-brain, MemPalace 코드는 설계 재료이며,
새 시스템 구현 중 직접 수정 대상이 아니다.

### Rule 3 — Archive does not auto-promote
MemPalace archive recall은 evidence를 제공하지만,
review 없이 truth를 바꾸지 못한다.

### Rule 4 — Façade is not an owner
Façade는 truth/archive/graph/page를 조합하는 access layer이지,
독립 DB owner가 아니다.

### Rule 5 — Human-readable knowledge surface is mandatory
canonical pages/cards는 optional decoration이 아니라 core usability layer다.

### Rule 6 — Graph structure must improve retrieval
retrieval은 chunk-only가 아니라 entity/relation 구조를 활용해야 한다.

### Rule 7 — V1 is local-first
v1의 기준 사용 환경은 OMX + Codex 로컬 운영 환경이다.
배포는 이후 단계에서 다룬다.

### Rule 8 — Unrelated projects are out of scope
`claude-telegram`, `mrstack` 등은 이 architecture scope에 포함하지 않는다.

---

## Live facts that drove this design

### JCP / Jarvis
- truth-oriented schema와 retrieval discipline이 존재함
- memory / decisions / entities 구조가 강함
- session-start retrieval semantics를 이미 보여줌

### Ontology
- relationship model의 reference value가 큼
- graph-like reasoning substrate로 적합함

### jarvis-brain
- façade pattern은 유효하나 independent brain ownership은 약함
- parallel brain DB는 split-brain 위험을 키움

### MemPalace
- historical recall / archive capability가 강함
- current truth owner로 쓰기에는 부적합

### Audit learnings
- provenance weakness를 설계 단계에서 보강해야 함
- archive-truth confusion을 반드시 막아야 함
- stale presentation artifact가 truth를 대체하지 못하게 해야 함
