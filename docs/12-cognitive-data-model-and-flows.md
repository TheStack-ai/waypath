# Cognitive Data Model and Flows

## 목적

이 문서는 새 시스템이 실제로 무엇을 기억하고,
그 기억이 어떻게 조회되고,
어떻게 wiki/page로 정리되며,
어떻게 truth로 승격되는지를 정의합니다.

즉 이 문서는 architecture의 추상도를 낮춰,
실제 구현 가능한 **core object model + key flows**로 변환한 문서입니다.

---

## Core Objects

### 1. Decision
의미:
- 지금 유효한 결정

주요 필드 예시:
- id
- title
- status (active/superseded)
- decision_text
- rationale_summary
- linked_entities
- provenance
- supersedes

### 2. Preference
의미:
- 운영자/사용자의 장기 선호

주요 필드 예시:
- id
- scope (global/project/tool)
- preference_text
- strength
- provenance

### 3. Entity
의미:
- 사람, 프로젝트, 도구, 개념, 조직, 이벤트 등

주요 필드 예시:
- id
- entity_type
- canonical_name
- aliases
- state_summary
- provenance

### 4. Relationship
의미:
- entity와 entity, entity와 decision, decision과 project의 연결

주요 필드 예시:
- id
- subject_id
- relation_type
- object_id
- confidence
- provenance

### 5. Evidence
의미:
- archive에서 회수되거나 외부에서 관찰된 근거 단위

주요 필드 예시:
- id
- source_kind
- source_ref
- excerpt
- observed_at
- linked_entities
- confidence

### 6. PromotionCandidate
의미:
- truth로 승격될 수 있는 후보 단위

주요 필드 예시:
- id
- candidate_kind
- candidate_payload
- supporting_evidence_ids
- review_status
- proposed_effect
- supersedes

### 7. Page / Card
의미:
- 사람이 읽는 canonical surface

종류 예시:
- project page
- entity card
- decision page
- briefing page

주요 필드 예시:
- id
- page_kind
- title
- rendered_body
- linked_truth_ids
- linked_evidence_ids
- updated_at

### 8. ContextPack
의미:
- session-start 또는 task-start에서 주입되는 묶음

구성 예시:
- current_focus
- truth_summary
- graph_context
- key_pages
- evidence_appendix

---

## Object Ownership Rules

### Truth Kernel owns
- Decision
- Preference
- Entity
- Relationship
- accepted/promoted state

### Archive Integration owns
- raw Evidence source corpus

### Promotion Layer owns
- PromotionCandidate lifecycle

### Knowledge Page Layer owns
- Page/Card persistence and rendering

### Session Runtime owns
- ContextPack assembly only

---

## Key Flows

## Flow 1 — Session Start

1. active project/task 확인
2. relevant Decision / Preference / Entity 조회
3. graph 확장으로 관련 context 추가
4. 핵심 Page/Card 찾기 또는 생성
5. 필요하면 archive evidence appendix 추가
6. ContextPack 생성

결과:
- operator는 세션 시작부터
  - current truth
  - related graph context
  - human-readable pages
  - optional evidence appendix
을 함께 받는다.

---

## Flow 2 — Ask / Query

1. 질의 수신
2. truth lookup
3. graph-assisted expansion
4. 필요하면 archive recall
5. response assembly
6. page/card link 제시

응답 구성:
- direct answer
- supporting truth refs
- related entities/decisions
- evidence appendix (optional)
- linked page/card (optional)

---

## Flow 3 — Wiki/Page Synthesis

1. project/entity/decision anchor 선택
2. linked truth records 조회
3. graph로 관련 context 확장
4. archive에서 필요한 supporting evidence 조회
5. page/card 렌더링
6. truth/evidence references 저장

핵심 규칙:
- page는 설명 surface
- session_brief는 objective/active task뿐 아니라 stored decision · preference · entity · graph link를 함께 보여준다
- page 생성이 곧 truth 변경은 아님

---

## Flow 4 — Promotion

1. archive/evidence에서 candidate 생성
2. supporting evidence 연결
3. review 수행
4. accepted면 truth records 생성/수정
5. contradiction / supersede 반영
6. 관련 page/card 갱신

핵심 규칙:
- auto-promotion 금지
- every promoted truth has evidence trail

---

## Flow 5 — Contradiction / Supersede

1. 새 candidate가 기존 truth와 충돌하는지 확인
2. 충돌 시:
   - reject
   - supersede
   - merge
   중 하나 선택
3. 결과를 decision/preference/entity state에 반영
4. 관련 page/card 업데이트

---

## What should be automatic vs manual

### Automatic
- truth retrieval
- graph expansion
- archive evidence retrieval
- page/card draft synthesis
- context pack assembly

### Human / reviewed
- truth promotion
- contradiction resolution
- canonical page final editing
- high-impact preference/decision overwrite

---

## Minimal V1 Bundle

v1에서 최소로 돌아야 하는 묶음은 다음입니다.

1. Decision / Preference / Entity / Relationship storage
2. Evidence recall from MemPalace
3. PromotionCandidate review flow
4. Project / Entity / Decision page generation
5. ContextPack assembly

이 다섯 개가 같이 돌아야,
이 시스템이 단순 memory tool이 아니라 **external brain layer**처럼 보이기 시작합니다.

---

## 한 줄 요약

> **이 시스템의 핵심 데이터 모델은 Decision·Preference·Entity·Relationship·Evidence·PromotionCandidate·Page·ContextPack이며, 그 위에서 truth retrieval → graph expansion → archive evidence recall → wiki/page synthesis → reviewed promotion의 흐름이 돌아가야 한다.**
