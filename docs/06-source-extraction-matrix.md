# Source Extraction Matrix

## 목적

이 문서는 기존 source systems에서 **무엇을 새 메인 시스템에 가져올지**를
직접 재사용 / 선택적 재사용 / 개념 차용 / 제외 로 나눠 정리한 매핑표입니다.

---

## Reuse Mode 정의

- **Direct reuse**: 코드/모듈/규약을 거의 그대로 가져와 새 시스템에 사용
- **Selective reuse**: 일부 코드/패턴만 추출해 재구성
- **Concept only**: 구현은 새로 하되 개념만 차용
- **Reject**: 새 시스템에 가져오지 않음

---

## Matrix

| Source | 계승할 것 | Reuse mode | 새 시스템에서의 위치 | 가져오지 않을 것 |
|---|---|---|---|---|
| JCP / Jarvis | memory taxonomy, decisions, preferences, entities, audit, session-start curation | Selective reuse + Concept only | Truth Kernel core | 기존 인스턴스/DB 자체를 새 시스템 owner로 두는 것 |
| Jarvis Ontology | entity typing, relationship modeling, graph reasoning primitives | Selective reuse | Truth Kernel 내부 relationship model | 별도 과복잡 외부 layer처럼 유지하는 것 |
| jarvis-brain | MCP façade idea, query surface, operator access pattern | Concept only | Access Facade / MCP surface | 독립 `brain.db` truth ownership |
| MemPalace | transcript archive, historical evidence recall, semantic retrieval | Selective reuse + Direct integration | Archive Integration / Evidence recall | current truth owner 역할 |
| 기존 분석 문서들 | ownership rules, drift findings, design constraints, anti-patterns | Direct reuse | Product / design / implementation spec | runtime dependency로 삼는 것 |

---

## Capability-level Extraction

### 1. Current Truth
**주 source:** JCP / Jarvis

계승 항목:
- decision ledger
- preferences
- entity state
- curated session context
- audit / provenance mindset

새 시스템 반영 방식:
- 새 local truth DB와 schema로 재구성
- source systems는 read-only reference로만 둠

### 2. Relationship / Reasoning Model
**주 source:** Ontology

계승 항목:
- entity relationships
- structured linking
- graph-like traversal 관점

새 시스템 반영 방식:
- truth kernel 내부 관계 테이블/모델로 흡수

### 3. Historical Archive
**주 source:** MemPalace

계승 항목:
- raw transcript storage
- semantic search
- historical evidence recall

새 시스템 반영 방식:
- archive adapter / archive MCP integration
- truth overwrite는 금지

### 4. Operator Access Surface
**주 source:** jarvis-brain

계승 항목:
- façade 필요성
- query-oriented access surface
- MCP-friendly interaction

새 시스템 반영 방식:
- unified façade로 재설계
- façade는 읽기/조합/승격 요청의 관문 역할만 담당

### 5. Promotion / Provenance Discipline
**주 source:** JCP audit learnings + 전체 분석 결과

계승 항목:
- curated promotion 필요성
- audit trail 필요성
- source labeling 필요성

새 시스템 반영 방식:
- archive → evidence bundle → review → truth promotion

---

## Design Rules extracted from the sources

1. **Truth owner는 하나여야 한다.**
2. **Archive는 truth를 자동 덮어쓰지 않는다.**
3. **Façade는 kernel의 peer owner가 아니다.**
4. **정적 문서는 truth source가 아니다.**
5. **source systems는 reference이지 target runtime이 아니다.**
6. **v1은 OMX + Codex local-first에 최적화한다.**

---

## Immediate build implications

이 matrix가 의미하는 구현 우선순위는 다음과 같습니다.

1. 새 truth kernel schema부터 정의
2. ontology relationship model을 거기에 통합
3. MemPalace archive adapter를 붙임
4. façade/MCP는 그 위에 얹음
5. source systems는 read-only extractor / reference path로만 접근
