# Keep / Delete / Modify / Fuse

## 이 문서의 해석 기준

여기서 말하는 KEEP / DELETE / MODIFY / FUSE는
**기존 source systems를 직접 수정하자는 뜻이 아닙니다.**

의미는 다음과 같습니다.
- KEEP = 새 시스템이 계승할 원리/구조
- DELETE = 새 시스템에서 반복하지 않을 안티패턴
- MODIFY = 새 시스템에 맞게 조정해서 가져올 것
- FUSE = 여러 source에서 추출한 요소를 새 구조로 다시 합성할 것

---

## KEEP

### 1. JCP-style truth discipline
계승 이유:
- memory / decisions / preferences / entities / audit가 잘 응집되어 있음
- session-start retrieval 개념이 좋음

### 2. Ontology relationship model
계승 이유:
- entity / relationship 기반의 구조화가 필요함

### 3. MemPalace archive capability
계승 이유:
- raw transcript / historical evidence / semantic recall에 강함

### 4. façade 필요성 자체
계승 이유:
- operator-facing access layer는 필요함
- 다만 façade는 kernel owner가 되어선 안 됨

---

## DELETE / REJECT

### 1. Peer brain DB ownership
새 시스템에서 façade가 별도 truth owner처럼 보이는 구조는 금지

### 2. Static artifact를 truth처럼 취급하는 관행
정적 문서, 다이어그램, landing은 운영 truth가 아님

### 3. archive의 자동 truth 승격
raw recall 결과가 review 없이 truth로 들어가면 안 됨

### 4. source system과 target system의 동일시
기존 시스템을 그대로 target system으로 보면 안 됨

### 5. 초기부터 deployment-first 사고
v1은 OMX + Codex local-first가 우선

---

## MODIFY / ADAPT

### 1. Truth schema
JCP의 구조를 계승하되,
새 시스템의 local-first 운영에 맞게 더 단순하고 명확하게 조정

### 2. Ontology integration
별도 복잡한 외부 층이 아니라,
truth kernel 내부 관계 모델로 흡수

### 3. façade contract
`jarvis-brain` 패턴을 참고하되,
truth/archive를 읽는 unified façade로 재정의

### 4. provenance discipline
기존보다 더 엄격한 evidence / source / promotion 규약 필요

### 5. session-start output
기존 retrieval discipline을 계승하되,
OMX + Codex에 최적화된 context pack 형태로 재구성

---

## FUSE / REBUILD

### 1. JCP + Ontology → New Truth Kernel
- decisions
- preferences
- entities
- relationships
- curated context

### 2. MemPalace → New Archive Integration
- raw transcript archive
- historical evidence recall
- semantic search

### 3. jarvis-brain idea → New Access Facade
- MCP / operator access surface
- no independent truth ownership

### 4. audit learnings → Promotion / Provenance layer
- archive result는 evidence bundle로 남김
- review 후에만 truth promotion

### 5. operator workflow learnings → OMX + Codex local-first UX
- session start
- recall
- evidence appendix
- promotion review

---

## 최종 한 문장

> **새 시스템은 기존 source systems를 직접 합치는 것이 아니라, JCP의 truth discipline·Ontology의 관계 모델·jarvis-brain의 façade pattern·MemPalace의 archive capability를 다시 조합해 local-first core로 재구성하는 것이다.**
