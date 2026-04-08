# Implementation Roadmap

## 전제

이 로드맵은 **기존 시스템 직접 수정 로드맵이 아닙니다.**

이 문서의 목적은:
- 분석이 끝난 source systems를 바탕으로
- 새로운 메인 시스템을
- **OMX + Codex 전용 local-first v1**로 구현하기 위한 순서를 정하는 것

입니다.

---

## Phase 0 — Scope Freeze

목표:
새 시스템의 경계를 흔들리지 않게 고정

작업:
1. source systems는 reference source라고 명시
2. v1은 OMX + Codex local-first라고 명시
3. MemPalace는 archive capability source라고 명시
4. unrelated projects는 scope에서 제거
5. deployment는 later phase로 분리

---

## Phase 1 — Source Extraction

목표:
무엇을 계승할지 명확히 정리

작업:
1. JCP에서 truth kernel 계승 항목 추출
2. Ontology에서 relationship model 추출
3. jarvis-brain에서 façade contract 패턴 추출
4. MemPalace에서 archive / retrieval capability 추출
5. direct reuse / selective reuse / concept-only / reject로 분류

산출물:
- source extraction matrix
- target capability map

---

## Phase 2 — V1 Architecture Design

목표:
새 시스템의 local-first 구조를 명확히 정의

작업:
1. truth store ownership 정의
2. archive integration boundary 정의
3. retrieval flow 정의
4. promotion / provenance flow 정의
5. MCP / façade contract 정의
6. OMX + Codex session-start context pack 정의

산출물:
- v1 architecture spec
- storage ownership rules
- context pack contract

---

## Phase 3 — Workspace / Repo Bootstrap Plan

목표:
실제 구현 가능한 module 구조 결정

작업:
1. 새 repo / workspace 구조 정의
2. core / archive / graph / wiki / façade / adapters 경계 정의
3. local config / data path / runtime entrypoint 정의
4. test structure와 verification harness 정의

산출물:
- repo skeleton plan
- package/module boundaries

---

## Phase 4 — Truth Kernel MVP

목표:
새 시스템의 최소 truth kernel 구현 계획 확정

작업:
1. local truth DB 선택
2. decision / preference / entity / relationship schema 정의
3. session-start curated context read path 정의
4. provenance metadata 필수 필드 정의

---

## Phase 5 — Archive Integration MVP

목표:
MemPalace를 archive capability로 연결

작업:
1. MemPalace integration mode 결정 (adapter / MCP / library)
2. historical recall query flow 정의
3. archive result를 evidence appendix로 분리
4. archive가 truth를 overwrite하지 못하게 규칙 고정

---

## Phase 6 — Graph / Wiki Layer

목표:
구조적 retrieval과 사람이 읽는 canonical knowledge surface를 확보

작업:
1. entity / relation graph query primitives 정의
2. graph-assisted expansion rule 정의
3. entity / decision page-card schema 정의
4. page/card synthesis와 review rule 정의

---

## Phase 7 — Promotion / Review Path

목표:
archive → truth 승격 규칙을 구현 가능한 수준으로 설계

작업:
1. promotion candidate format 정의
2. review step 정의
3. contradiction / supersede rules 정의
4. accepted evidence만 truth kernel에 반영되게 설계

---

## Phase 8 — Codex-first Thin Shim

목표:
shared backend 위에 Codex용 thin host shim을 먼저 붙여 자동 세션 시작 경로를 검증

작업:
1. Codex enhanced entry shape 정의 (`jf codex` 또는 equivalent)
2. host detection / workspace detection / bootstrap wiring 정의
3. session-start context pack을 자동으로 주입하는 read path 정의
4. automatic read vs explicit write 경계 문서화
5. shim은 truth / archive / page ownership을 갖지 않도록 규칙 고정

산출물:
- Codex shim contract
- startup context wiring spec
- explicit vs automatic boundary note

---

## Phase 9 — OMX + Codex Facade MVP

목표:
대표님이 실제로 사용할 v1 operator surface와 shared backend verbs를 고정

작업:
1. session-start command / workflow 정의
2. current truth query surface 정의
3. historical recall query surface 정의
4. page/card query surface 정의
5. promotion review surface 정의

산출물:
- facade verb list
- operator workflow spec
- session-start context pack contract

---

## Phase 10 — Claude Code Parity

목표:
Codex에서 안정화한 shared backend contract를 Claude Code shim에 동일하게 적용

작업:
1. Codex shim과 같은 backend verbs를 Claude Code entry에 매핑
2. host affordance만 다르고 semantics는 같도록 parity 검증
3. host별 truth/archive/promotion 차이가 생기지 않도록 규칙 고정
4. opt-in alias takeover는 후순위로 유지

산출물:
- Claude Code shim parity note
- host-neutral backend contract
- rollout risk checklist

---

## Phase 11 — Local Validation

목표:
배포 전에 Codex-first / Claude-parity 경로를 로컬에서 충분히 검증

작업:
1. Codex session-start 품질 검증
2. historical recall usefulness 검증
3. truth / archive separation 검증
4. source systems에 write하지 않는지 검증
5. Claude Code parity 시나리오 검증
6. source systems direct mutation이 없는지 검증

산출물:
- local validation checklist
- host parity validation note
- regression watchlist

---

## Later Phase — Deployment Preparation

이 단계는 v1 이후입니다.

포함:
- remote access model
- service packaging
- auth / multi-user concerns
- deployment infrastructure

즉:

> **배포는 지금 설계의 제약조건이 아니라, 나중에 열어둘 확장 경계다.**

---

## 지금 당장 가장 먼저 할 것

1. scope freeze 반영
2. source extraction matrix 작성
3. v1 architecture spec 작성
4. Codex-first shim contract 작성
5. implementation backlog 작성

이 4개가 끝나면,
그 다음 구현 세션은 훨씬 직접적으로 진행할 수 있습니다.
