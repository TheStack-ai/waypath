# V1 Architecture Spec

## 목적

이 문서는 **OMX + Codex 전용 local-first v1**의 target architecture를 구체적으로 정의합니다.

추가 개념 설계는 다음 문서를 기준으로 보완합니다.
- `docs/11-product-thesis-and-differentiation.md`
- `docs/12-cognitive-data-model-and-flows.md`

v1의 핵심 목표는:
- 대표님이 바로 사용할 수 있어야 하고
- source systems를 직접 수정하지 않으며
- truth / archive / graph / wiki / promotion 경계를 명확히 유지하는 것입니다.

---

## V1 Goals

1. 새 시스템이 **자체 truth kernel**을 가진다.
2. historical recall은 **MemPalace archive integration**으로 제공한다.
3. entity / relationship 구조를 **graph-aware retrieval**에 사용한다.
4. 사람이 읽는 **knowledge page/card surface**를 제공한다.
5. truth 변경은 **review-based promotion**으로만 일어난다.
6. operator surface는 **OMX + Codex 친화적 façade**로 제공한다.
7. source systems는 **read-only reference / extraction source**로만 사용한다.

---

## V1 Non-Goals

- multi-user support
- remote deployment
- public API hardening
- source systems 직접 개조
- unrelated product/runtime 프로젝트 통합
- full-corpus heavy graph indexing

---

## Target Topology

### 1. Source Adapters (read-only)
역할:
- 기존 JCP/Jarvis 구조 이해/추출
- Ontology 모델 참조/추출
- jarvis-brain façade 패턴 참조
- MemPalace integration entrypoint 연결

원칙:
- source systems에 write하지 않음
- 새 시스템과 source systems를 동일시하지 않음

### 2. Truth Kernel
역할:
- current truth 저장/조회
- decisions
- preferences
- entities
- relationships
- curated session context 생성

v1 권장 저장소:
- **SQLite local DB**

이유:
- local-first
- single-operator
- 간단한 backup/export 가능
- Codex/OMX 작업 흐름과 잘 맞음

### 3. Archive Integration Layer
역할:
- MemPalace를 통한 transcript archive / historical evidence recall
- archive query 실행
- archive 결과를 evidence bundle로 정리

원칙:
- archive는 truth owner가 아님
- archive 결과는 항상 appendix / evidence로만 먼저 노출

### 4. Graph / Ontology Layer
역할:
- entity / relation typing
- graph traversal
- multi-hop context expansion
- 사람/프로젝트/결정/이슈 연결 복원

원칙:
- graph는 retrieval quality를 높이는 구조층이다
- graph 자체가 별도 truth owner가 되어선 안 된다

### 5. Knowledge Pages / Wiki Layer
역할:
- canonical page/card 제공
- project/entity/decision/topic 단위 요약 생성
- truth + graph + selected evidence를 읽기 좋은 형태로 합성

원칙:
- page는 truth를 대체하지 않는다
- page는 human-readable canonical surface다

### 6. Promotion / Provenance Layer
역할:
- archive result 또는 synthesized claim을 promotion candidate로 받음
- review 후 truth kernel에 반영
- contradiction / supersede 처리

필수 원칙:
- no auto-promotion
- every promoted truth has provenance

### 7. Access Facade
역할:
- OMX + Codex에서 사용하는 통합 query surface
- session-start context pack 제공
- current truth query
- archive recall query
- graph-assisted relationship query
- knowledge page / brief synthesis
- promotion review action

원칙:
- façade는 storage owner가 아니다
- façade는 truth + archive + graph + page layer를 조합하는 access layer다

### 8. Operator Runtime
역할:
- session-start assembly
- local-first usage
- single-operator workflow
- v1 validation surface

---

## Storage Ownership

세부 persistence/import 판단은 `docs/10-storage-and-import-strategy.md`를 기준으로 확정합니다.

### Truth
소유자:
- 새 시스템의 Truth Kernel

저장 대상:
- decision
- preference
- entity
- relationship
- curated/project/session state
- promotion metadata

### Archive
소유자:
- MemPalace integration

저장 대상:
- transcript
- raw historical notes
- long-form reasoning evidence
- recall index

### Knowledge surface
소유자:
- Knowledge Page Layer

저장 대상:
- canonical markdown/text pages
- cards/briefs
- page metadata

### Source systems
역할:
- 읽기 전용 reference source
- bootstrap / extraction / comparison source

---

## Session-Start Context Pack

v1에서 가장 중요한 operator output은 **session-start context pack**입니다.

권장 구성:

1. **Current Focus**
   - active project
   - active task
   - current objective

2. **Current Truth**
   - relevant decisions
   - preferences
   - active entities / projects
   - standing constraints

3. **Graph Context**
   - 관련 entity / relationship map
   - 현재 작업과 연결된 핵심 맥락

4. **Recent Changes**
   - newly promoted facts
   - superseded items
   - unresolved contradictions

5. **Evidence Appendix (optional)**
   - MemPalace recall excerpts
   - historical rationale references
   - transcript pointers

6. **Related Pages/Cards**
   - project brief
   - decision page
   - entity card

핵심 규칙:
- 메인 본문은 truth kernel 중심
- archive는 appendix / support evidence로 분리
- 읽기 쉬운 page/card를 함께 제공한다

---

## Retrieval Flow

### Truth-first retrieval
1. query intent 분류
2. truth kernel 검색
3. direct truth answer 구성
4. provenance/citation 최소 링크 부착
5. 관련 page/card 링크 추가

### Archive-augmented retrieval
1. truth 결과가 부족하거나 historical why/how가 필요함
2. MemPalace query 실행
3. archive 결과를 evidence appendix로 추가
4. 필요 시 promotion candidate로 표시

핵심 규칙:
- archive recall은 answer support이지 direct overwrite가 아님

### Graph-assisted retrieval
1. seed entity/decision/project 식별
2. ontology support에서 related entities/relationships를 탐색
3. local truth answer에 relationship context를 추가
4. 필요 시 archive evidence를 보조로 부착

### Wiki/page synthesis
1. project/entity/topic을 식별
2. truth + graph + selected evidence를 수집
3. 사람이 읽기 좋은 canonical page/card를 구성
4. citation/evidence link를 남김

---

## Promotion Flow

1. archive/evidence에서 claim 또는 candidate 생성
2. candidate에 provenance 부착
3. review 수행
4. accepted이면 truth kernel에 반영
5. contradiction / supersede metadata 기록
6. 관련 KnowledgePage refresh

필수 필드 예시:
- source_kind
- source_ref
- observed_at
- promoted_at
- promoted_by
- confidence
- supersedes

---

## Recommended Repo / Module Shape

V1에서는 monorepo + `src/` module layout이 가장 단순합니다.
자세한 분해안은 `docs/09-repo-module-plan.md`를 기준으로 봅니다.

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

### Module responsibilities
- `src/contracts/`: context pack, evidence bundle, promotion candidate 같은 shared contracts
- `src/truth-kernel/`: truth schema, repository layer, truth queries
- `src/archive-kernel/`: archive query abstraction, evidence appendix assembly
- `src/ontology-support/`: entity/relationship traversal helpers
- `src/knowledge-pages/`: canonical page/card synthesis and refresh logic
- `src/promotion/`: review/promotion logic and provenance handling
- `src/facade/`: MCP / operator access surface
- `src/session-runtime/`: session-start assembler와 local runtime glue
- `src/adapters/`: MemPalace 및 source-system read-only adapters
- `src/shared/`: config, logging, reusable utilities

---

## Open Decisions for MVP

1. **Truth DB scope**
   - single SQLite DB로 시작할지
   - truth + relationship를 하나의 DB에 같이 둘지

2. **MemPalace integration mode**
   - MCP server 호출 기반
   - local adapter/library 기반

3. **Bootstrap strategy**
   - 기존 source systems에서 최소 필수 데이터만 import할지
   - 처음부터 빈 새 DB로 시작할지

4. **Knowledge page persistence**
   - markdown files + metadata 테이블 조합으로 갈지
   - 다른 lightweight format이 나을지

5. **Promotion UX**
   - CLI command 기반
   - MCP action 기반
   - 둘 다 제공할지

현재 권장안:
- SQLite 단일 truth DB
- MemPalace는 adapter/MCP whichever is simplest locally
- bootstrap은 최소 import + 이후 점진 확장
- page는 markdown/text + lightweight metadata
- promotion은 CLI + Codex workflow 우선

---

## Architecture Verdict

> **v1은 “새 local truth kernel + MemPalace archive integration + graph/ontology support + knowledge page layer + strict promotion/provenance rules + OMX/Codex façade”의 구조로 설계하는 것이 가장 안전하고 차별적이다.**
