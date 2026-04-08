# Storage and Import Strategy

## 목적

이 문서는 v1 구현 전에 필요한 두 가지를 확정한다.

1. storage ownership / persistence boundary
2. source systems로부터의 import/reference 전략

초기 전제:
- v1은 OMX + Codex local-first
- source systems는 reference only
- MemPalace는 archive owner

---

## Recommended Persistence Model

### 1. Truth Kernel Persistence
권장:
- **새 시스템 전용 SQLite 저장소**를 truth kernel의 기본 persistence로 둔다.

이유:
- local-first에 적합
- 구조화된 state(decisions, preferences, promoted memory, entity state)에 강함
- OMX + Codex 운영에서 배포 부담이 없음
- 검증/백업/마이그레이션이 단순함

Truth store가 authoritative하게 가져야 할 것:
- decisions
- preferences
- promoted memory
- entity state
- relationships
- contradiction / supersede metadata
- session-start curated context inputs

### 2. Archive Persistence
권장:
- archive raw evidence는 **MemPalace가 owner**다.
- 새 시스템은 archive 전체를 재저장하지 않는다.

새 시스템이 로컬에 가질 수 있는 것:
- archive pointer / reference id
- retrieval cache (ephemeral)
- appendix assembly metadata

하지만 authoritative archive copy는 만들지 않는다.

### 3. Ontology Persistence
권장:
- v1에서는 ontology support를 **Truth Kernel과 같은 SQLite 안의 별도 논리 영역**으로 두는 방향을 기본안으로 잡는다.

이유:
- local-first 단순성 확보
- 별도 graph infra 없이도 시작 가능
- ownership은 분리하되 운영 복잡도는 낮춤

주의:
- 같은 DB 파일을 쓰더라도 truth tables와 ontology tables의 ownership/역할은 문서상 명확히 분리한다.

### 4. Knowledge Page Persistence
권장:
- canonical page/card는 `knowledge/pages/`, `knowledge/cards/` 아래 human-readable markdown/text로 둔다.
- page metadata(related entity/page status/update time)는 truth kernel 또는 별도 lightweight metadata table에 둔다.

이유:
- LLM wiki 성격을 살리려면 사람이 읽고 수정할 수 있어야 한다.
- 하지만 page가 truth owner가 되면 안 되므로 structured truth와 분리해야 한다.

### 5. Session Runtime State
권장:
- 세션 한정 상태는 파일/메모리 cache로만 둔다.
- session runtime state는 authoritative truth를 소유하지 않는다.

---

## Ownership Boundaries

### Truth Kernel owns
- canonical current truth
- promoted facts
- operator-confirmed state

### Archive Kernel owns
- raw transcript
- raw historical evidence
- archive retrieval corpus

### Ontology Support owns
- relationship structures
- concept linkage structures

### Knowledge Page Layer owns
- human-readable page/card content
- canonical view surface only

### Session Runtime owns
- ephemeral session assembly state only

### Access Facade owns
- 아무 persistent truth도 소유하지 않음
- orchestration only

### Host Shim owns
- host bootstrap / activation config only
- backend pointer wiring only
- persistent truth / archive / page state 없음
- host별로 별도 truth store를 두지 않음

---

## Host Integration Boundary

v1 host integration은 **shared backend + thin host shim**을 전제로 한다.

### 기본 원칙
- host shims는 storage owner가 아니다
- host shims는 truth/archive/page/promotion semantics를 바꾸지 않는다
- host shims는 shared backend의 entry / bootstrap / translation layer다
- 자동화는 session-start read path에만 허용하고 durable write는 explicit review를 요구한다

### v1 rollout order
1. shared backend를 먼저 설치한다
2. Codex thin shim을 먼저 활성화한다
3. Codex session-start context pack 품질을 검증한다
4. Claude Code parity shim은 Codex contract 안정화 이후에 붙인다
5. alias takeover는 후순위 opt-in으로만 고려한다

### install / enable story
- 기본 경로는 명시적 enhanced entry다
- 예: `jf codex`
- 이후에만 opt-in alias takeover를 검토한다
- host마다 다른 persistence root를 만들지 않는다

---

## Import / Reference Strategy

## Principle 1 — Read-only first
초기 단계에서는 source systems에 대해 **read-only extraction**만 수행한다.

## Principle 2 — Explicit bootstrap, not hidden sync
필요한 truth를 가져오더라도 그것은:
- one-time bootstrap import
- 또는 explicit re-import

형태여야 한다.

숨겨진 background sync나 bidirectional sync는 금지한다.

## Principle 3 — Provenance on imported truth
source systems에서 가져온 값은 모두 provenance를 가져야 한다.
예:
- source system
- source path/db/table
- imported_at
- import_mode (bootstrap/manual/reimport)

## Principle 4 — Archive stays external
MemPalace는 adapter를 통해 조회한다.
archive corpus 전체를 새 truth store로 복제하지 않는다.

## Principle 5 — Pages are views, not owners
knowledge page/card는 human-readable canonical surface다.
하지만 current truth owner가 되어선 안 된다.

---

## Recommended Import Sequence

### Step 1 — Source readers only
먼저 `source-readers/`에서 아래를 read-only로 읽을 수 있게 한다.
- JCP/Jarvis truth-like records
- ontology structures
- jarvis-brain facade-relevant interfaces
- MemPalace retrieval boundary

### Step 2 — Bootstrap manifest
가져올 항목을 명시하는 import manifest를 만든다.
예:
- 어떤 truth category를 가져오는지
- 어떤 source에서 가져오는지
- overwrite 허용 여부
- provenance 정책

### Step 3 — Bootstrap import into Truth Kernel
새 시스템의 truth store에 필요한 최소 truth만 가져온다.
이때 imported records는 provenance를 가진다.

### Step 4 — Build graph/page views from imported truth
가져온 truth와 evidence 링크를 바탕으로:
- relationship graph를 생성/정리하고
- 최소 knowledge page/card를 만든다.

### Step 5 — No automatic back-write
새 시스템은 source systems로 write-back하지 않는다.

### Step 6 — Optional re-import policy
필요하면 수동 재가져오기만 허용한다.
자동 양방향 동기화는 하지 않는다.

---

## V1 Decision Summary

### Chosen default
- Truth Kernel: local SQLite
- Archive owner: MemPalace
- Ontology support: same SQLite file, separate logical tables/namespace
- Knowledge pages: markdown/text files + lightweight metadata
- Session runtime: ephemeral only
- Source systems: read-only extraction + explicit bootstrap import

### Rejected for v1
- second truth DB
- hidden sync with source systems
- archive corpus duplication into truth storage
- deployment-grade distributed persistence before operator validation
- page/wiki layer를 truth owner처럼 사용하는 구조

---

## Acceptance Criteria

- truth persistence owner가 명확하다.
- archive owner가 MemPalace로 유지된다.
- imported truth는 provenance를 가진다.
- source systems와 bidirectional sync가 없다.
- session runtime이 authoritative state를 소유하지 않는다.
- page/card layer가 human-readable surface로 존재하지만 truth owner가 아니다.

---

## 한 줄 요약

> **v1은 Truth Kernel을 새 로컬 SQLite에 두고, Archive는 MemPalace owner로 남기며, Ontology는 구조층으로 통합하고, Knowledge Pages는 읽기용 canonical surface로 두며, source systems는 read-only extraction과 explicit bootstrap import로만 연결하는 것이 가장 안전하다.**
