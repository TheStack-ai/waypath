# Jarvis Fusion System

이 폴더는 **기존 Claude Code 기반 메인 시스템들을 분석한 결과를 바탕으로, 새로운 메인 시스템을 설계하고 구현 계획을 세우는 planning workspace**입니다.

핵심 전제는 다음과 같습니다.

- 기존 시스템들은 **직접 수정 대상이 아니라 reference source**입니다.
- 이 프로젝트의 목표는 기존 시스템을 억지로 한데 묶는 것이 아니라, **좋은 구조와 작동 원리를 추출해 새 시스템을 설계하는 것**입니다.
- 새 시스템의 v1은 **OMX + Codex 기반 로컬 운영 환경 전용**으로 먼저 사용합니다.
- 배포/서비스화는 초기 목표가 아니라 **후속 단계**입니다.
- `claude-telegram`, `mrstack` 같은 별도 프로젝트는 **이 planning scope에서 제외**합니다.

## Reference Sources

새 시스템 설계의 재료는 다음 source systems / artifacts 입니다.

- JCP / Jarvis (`~/.claude/jarvis`)
- Jarvis Brain facade (`~/.jarvis-orb`)
- Jarvis Ontology (`~/Projects/jarvis-ontology`)
- MemPalace
- 기존 분석 산출물 (`.omx/context`, `.omx/plans` 기반 문서)

## 이 workspace가 하는 일

이 폴더의 문서는 다음을 위해 존재합니다.

1. 기존 시스템에서 **무엇을 계승할지** 정리
2. 새 메인 시스템의 **target architecture** 정의
3. OMX + Codex 전용 **local-first MVP** 범위 정의
4. 실제 구현 세션에서 바로 사용할 **implementation backlog** 작성
5. 차별성을 만드는 **RAG + graph/ontology + wiki + promotion** 결합 구조 정의

## 이 workspace가 하지 않는 일

- 기존 source systems를 직접 고치는 것
- unrelated product/runtime 프로젝트까지 설계 범위를 넓히는 것
- 초기부터 배포형/다중 사용자 시스템을 설계하는 것

## 문서 구성

### 요약 / 이해용 문서
- `docs/01-context-and-purpose.md`
  - 왜 새 시스템이 필요한지
  - 무엇을 만들고 무엇을 만들지 않는지
- `docs/02-system-understanding.md`
  - 기존 source systems를 어떤 관점으로 읽어야 하는지
- `docs/03-full-audit-summary.md`
  - source-system audit의 핵심 결론
- `docs/04-keep-delete-modify-fuse.md`
  - 새 시스템에 무엇을 계승/폐기/수정/융합할지
- `docs/05-implementation-roadmap.md`
  - 설계에서 구현으로 가는 단계별 로드맵
- `docs/06-source-extraction-matrix.md`
  - source system별 계승 항목 매핑표
- `docs/07-v1-architecture-spec.md`
  - OMX + Codex 전용 local-first v1 아키텍처 명세
- `docs/08-implementation-backlog.md`
  - MVP backlog, acceptance criteria, verification plan
- `docs/09-repo-module-plan.md`
  - repo/module 경계, adapter 전략, 테스트 레이어 계획
- `docs/10-storage-and-import-strategy.md`
  - truth/archive persistence ownership과 source import 정책
- `docs/11-product-thesis-and-differentiation.md`
  - external brain layer로서의 제품 thesis와 차별성 정의
- `docs/12-cognitive-data-model-and-flows.md`
  - 핵심 객체와 retrieval/promote/wiki/session-start flow 정의
- `docs/13-core-schemas-and-contracts.md`
  - Truth schema, graph schema, context pack, page/promotion contract 고정

### canonical next-step reading order
1. `docs/06-source-extraction-matrix.md`
2. `docs/11-product-thesis-and-differentiation.md`
3. `docs/07-v1-architecture-spec.md`
4. `docs/12-cognitive-data-model-and-flows.md`
5. `docs/13-core-schemas-and-contracts.md`
6. `docs/08-implementation-backlog.md`
7. `docs/09-repo-module-plan.md`
8. `docs/10-storage-and-import-strategy.md`

### OpenSpec 문서
- `openspec/product.md`
- `openspec/changes/unify-kernel-archive-system/`
  - `.openspec.yaml`
  - `proposal.md`
  - `design.md`
  - `tasks.md`

## 현재까지의 핵심 결론

한 줄로 요약하면:

> **기존 시스템은 수정 대상이 아니라 설계 재료이고, 새 메인 시스템은 JCP/Jarvis·Ontology·jarvis-brain·MemPalace에서 검증된 강점만 추출해 OMX + Codex 전용 local-first external brain으로 다시 만드는 것이 목적이다.**

구체적으로는:

- 새 시스템의 **truth kernel**은 JCP/Jarvis에서 검증된 구조를 계승한다.
- **ontology model**은 entity / relationship / reasoning substrate 설계에 반영한다.
- `jarvis-brain`은 독립 brain DB가 아니라 **facade pattern source**로 다룬다.
- MemPalace는 **archive kernel / historical evidence recall source**로 활용한다.
- 초기 v1은 **local-first, single-operator, OMX + Codex 전용**으로 제한한다.
- 차별성은 **RAG + ontology/graph + wiki + promotion governance**를 통합하는 데서 나온다.

## 참고 원문 분석 아티팩트

이 planning workspace는 아래 분석 문서들을 기반으로 재구성되었습니다.

- `/Users/dd/.omx/context/full-claude-system-fusion-analysis-20260408T023208Z.md`
- `/Users/dd/.omx/plans/prd-full-claude-system-fusion.md`
- `/Users/dd/.omx/plans/test-spec-full-claude-system-fusion.md`
