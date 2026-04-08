# Implementation Backlog

## 목표

이 backlog는 **설계 문서를 실제 구현 세션으로 연결하기 위한 v1 실행 계획**입니다.

기준:
- OMX + Codex local-first
- source systems read-only
- deployment later
- truth / archive / graph / wiki / promotion 분리

---

## MVP Definition

v1 MVP가 의미하는 것은 다음입니다.

### 반드시 가능한 것
1. 새 시스템이 local truth store를 가진다.
2. session-start context pack을 생성할 수 있다.
3. current truth query가 가능하다.
4. MemPalace 기반 archive recall이 evidence appendix로 붙는다.
5. graph-assisted context query가 가능하다.
6. canonical knowledge page/card를 만들 수 있다.
7. promotion candidate를 review 후 truth로 반영할 수 있다.
8. source systems에 write하지 않는다.

### 아직 안 해도 되는 것
- deployment
- multi-user
- public API hardening
- 완전 자동 promotion
- 광범위한 legacy migration
- expensive full-corpus graph indexing

---

## Workstream 1 — Spec Freeze

### Tasks
- [ ] scope / non-goal 문서 확정
- [ ] source extraction matrix 확정
- [ ] product thesis / architecture principles 확정
- [ ] v1 architecture spec 확정
- [ ] implementation backlog 확정

### Done when
- planning docs끼리 모순이 없음
- v1 범위가 흔들리지 않음
- 차별 포인트가 문서상 명확함

---

## Workstream 2 — Repo Bootstrap

### Tasks
- [ ] target repo/module shape 확정
- [ ] `src/contracts`, `src/truth-kernel`, `src/adapters` 중심 디렉터리 구조 결정
- [ ] local config / data path convention 결정
- [ ] test layout 결정
- [ ] `knowledge/pages`, `knowledge/cards` directory policy 확정

### Done when
- 구현 세션이 바로 scaffold를 만들 수 있음

---

## Workstream 3 — Truth Kernel MVP

### Tasks
- [ ] SQLite truth DB schema 설계
- [ ] decision / preference / entity / relationship 모델 정의
- [ ] repository/query interface 정의
- [ ] session-start용 핵심 query set 정의

### Acceptance criteria
- current truth를 새 DB에서 조회 가능
- curated context pack에 필요한 데이터가 모두 read 가능

---

## Workstream 4 — Source Adapters / Bootstrap Import

### Tasks
- [ ] JCP/Jarvis read-only extractor 정의
- [ ] ontology extraction / mapping 정의
- [ ] jarvis-brain에서 필요한 facade pattern만 문서화
- [ ] bootstrap import 범위 최소화
- [ ] provenance-aware import manifest 정의

### Acceptance criteria
- source systems에 write 없이 필요한 truth seed를 읽을 수 있음
- 무엇을 import하고 무엇을 import하지 않는지 명확함

---

## Workstream 5 — Archive Integration

### Tasks
- [ ] MemPalace integration mode 선택
- [ ] historical query contract 정의
- [ ] evidence appendix format 정의
- [ ] archive failure fallback rule 정의

### Acceptance criteria
- current truth query와 분리된 archive recall이 가능
- archive 결과가 appendix/evidence로만 노출됨

---

## Workstream 6 — Graph / Ontology Layer

### Tasks
- [ ] entity / relationship graph query primitives 정의
- [ ] related entity expansion rule 정의
- [ ] graph-assisted retrieval policy 정의
- [ ] relationship explanation output 포맷 정의

### Acceptance criteria
- 관련 entity/context를 구조적으로 확장할 수 있다
- relationship 질문에 truth-only 답변보다 더 좋은 connected context를 줄 수 있다

---

## Workstream 7 — Knowledge Pages / Wiki Layer

### Tasks
- [ ] canonical page/card types 정의
- [ ] page synthesis input contract 정의
- [ ] truth + graph + evidence 기반 page draft flow 정의
- [ ] page refresh/update 정책 정의

### Acceptance criteria
- 사람이 읽을 수 있는 page/card를 생성할 수 있음
- page가 truth/evidence와 연결되어 있음

---

## Workstream 8 — Promotion / Provenance

### Tasks
- [ ] promotion candidate schema 정의
- [ ] review step 정의
- [ ] provenance 필드 정의
- [ ] contradiction / supersede 처리 정의

### Acceptance criteria
- truth로 반영된 항목은 provenance를 반드시 가짐
- archive recall만으로 truth overwrite가 불가능함

---

## Workstream 9 — Shared backend + thin host shims (Codex-first)

### Tasks
- [ ] shared backend verbs 고정
  - session-start
  - recall
  - page
  - promote
- [ ] automatic read surface 설계
  - session-start context pack assembly
  - current truth / historical recall / graph retrieval
- [ ] explicit write surface 설계
  - promotion review
  - contradiction / supersede resolution
  - import / re-import guardrails
- [ ] Codex thin shim 설계
  - enhanced entry
  - startup context validation
  - fallback / degraded mode
- [ ] Claude Code parity는 후속 단계로 분리

### Acceptance criteria
- shared backend가 truth / archive / graph / page / promotion ownership을 유지한다
- host shim은 bootstrap / translation만 담당하고 truth ownership을 가지지 않는다
- automatic session-start 경로는 read-only이고 truth mutation은 explicit review를 거친다
- Codex-first 경로에서 context pack이 유용하게 구성되고 explicit write boundary가 검증된다
- 사람이 읽는 canonical page/card 표면이 존재하며 host shim과 분리된다

---

## Workstream 10 — Local Validation

### Tasks
- [ ] representative session-start 시나리오 검증
- [ ] historical why/how 질의 검증
- [ ] graph-assisted relationship query 검증
- [ ] page synthesis usefulness 검증
- [ ] promotion flow 검증
- [ ] source systems non-write 보장 검증
- [ ] fallback / degraded mode 검증

### Acceptance criteria
- 대표님 실제 사용 흐름에서 v1이 유용함
- 설계 경계가 실행 중에도 무너지지 않음

---

## Verification Checklist

### Unit-level
- truth queries
- graph traversal helpers
- archive adapter formatting
- page synthesis input validation
- promotion candidate validation

### Integration-level
- truth-first retrieval
- archive-augmented retrieval
- graph-assisted retrieval
- session-start context pack assembly
- knowledge page synthesis

### Operator-level
- Codex 세션 시작 시 유용한 context 제공
- historical recall이 실제 질문에 도움됨
- relationship 질문에서 connected context가 복원됨
- page/card가 사람이 읽고 검토하기에 충분히 유용함
- review 없이 truth가 변하지 않음

### Safety-level
- source systems read-only
- archive cannot auto-promote
- façade cannot become hidden owner
- page layer가 truth owner로 오해되지 않음

---

## Immediate Next Tasks

### 지금 바로 이어서 해야 할 것
1. shared backend verbs와 `SessionContextPack` contract를 고정한다.
2. Codex enhanced entry shim과 startup validation 경계를 만든다.
3. truth / archive / graph read path를 session-start 중심으로 연결한다.
4. promotion review 및 explicit write path를 façade contract로 고정한다.
5. page markdown + metadata 구조를 canonical view layer로 유지한다.
6. Claude Code parity는 Codex contract 안정화 이후로 미룬다.

### 그 다음 구현 세션의 첫 작업
1. backend skeleton scaffold
2. SQLite schema 생성
3. truth query layer 구현
4. graph traversal helper 구현
5. session-start assembler 구현
6. Codex shim 연결
7. explicit promotion review 연결

---

## MVP Exit Criteria

다음을 만족하면 v1 MVP 설계가 구현-ready 상태라고 본다.

- [ ] truth store ownership이 명확하다
- [ ] archive integration boundary가 명확하다
- [ ] graph layer 역할이 명확하다
- [ ] page/card surface 역할이 명확하다
- [ ] façade contract가 명확하다
- [ ] promotion/provenance 규칙이 명확하다
- [ ] source systems를 수정하지 않고도 부팅 가능한 계획이 있다
- [ ] OMX + Codex local workflow 기준으로 실제 사용 시나리오가 정의되어 있다
