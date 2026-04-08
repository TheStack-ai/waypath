# System Understanding

## 어떻게 읽어야 하는가

지금부터 기존 시스템들은 “현재 운영 중인 절대적 진실의 집합”이 아니라,
**새 메인 시스템 설계를 위한 source systems**로 읽어야 합니다.

즉 질문은:
- 지금 무엇이 돌아가고 있는가?
보다
- 새 시스템에 무엇을 계승해야 하는가?
입니다.

---

## Source 1 — JCP / Jarvis

### 이 source의 의미
JCP / Jarvis는 새 시스템의 **truth kernel 설계 참고본**입니다.

### 여기서 계승할 핵심
- memory taxonomy 운영 방식
- decisions / preferences / entities / relationships 구조
- audit / provenance 사고방식
- session-start curated context 생성 방식
- distillation / promotion에 대한 개념적 틀

### 기존 분석에서 확인된 사실
- memory, decisions, entities, retrieval이 한 축으로 모여 있음
- 실제 live data와 운영 구조가 존재함
- hook / guardrail discipline도 참고 가치가 큼

### 그대로 가져오지 않을 것
- 기존 DB를 새 시스템의 영구 owner로 두는 방식
- source system 전체를 새 시스템과 동일시하는 접근

즉:

> **JCP는 새 시스템의 source-of-design이지, 새 시스템 그 자체는 아니다.**

---

## Source 2 — Jarvis Ontology

### 이 source의 의미
Ontology는 새 시스템의 **entity / relationship substrate** 설계 참고본입니다.

### 여기서 계승할 핵심
- entity typing 방식
- relationship modeling 방식
- graph-like reasoning substrate
- 사람/프로젝트/개념/결정 사이의 구조화된 연결

### 새 시스템에서의 위치
새 시스템에서는 ontology를 별도 장식물이 아니라,
truth kernel과 결합된 **relationship model**로 녹여야 합니다.

---

## Source 3 — jarvis-brain

### 이 source의 의미
`jarvis-brain`은 새 시스템의 **access façade / MCP surface**를 설계할 때 참고하는 source입니다.

### 여기서 계승할 핵심
- façade라는 개념 자체
- operator가 접근하는 query surface
- kernel과 사용자 인터페이스 사이의 완충층 필요성

### 기존 분석에서 확인된 사실
- 별도 `brain.db`는 핵심 truth owner로 보기 어려움
- façade로서의 방향성은 의미가 있음

### 새 시스템에서의 해석
새 시스템에서는:
- façade는 필요하지만
- façade가 truth DB를 따로 소유하면 안 됩니다.

즉:

> **jarvis-brain에서 가져올 것은 “MCP façade pattern”이지, “independent brain DB ownership”이 아니다.**

---

## Source 4 — MemPalace

### 이 source의 의미
MemPalace는 새 시스템의 **archive kernel / historical evidence recall** 설계 참고본입니다.

### 여기서 계승할 핵심
- raw transcript archive
- long-form historical recall
- semantic retrieval
- evidence-first lookup

### 새 시스템에서의 역할
새 시스템에서 MemPalace는:
- current truth owner가 아니라
- archive / historical evidence owner입니다.

즉:

> **MemPalace는 truth를 대체하는 것이 아니라, truth를 뒷받침하는 archive 축이다.**

---

## Cross-cutting facts from the audit

기존 분석에서 설계 판단에 직접 영향을 준 핵심 사실은 다음과 같습니다.

### Memory model fact
소스 기준으로는:
- 5 memory types
- 3 access tiers

즉 과거의 단순화된 설명보다,
실제 소스가 더 풍부한 구조를 갖고 있었습니다.

### Quality fact
다음 문제들이 반복적으로 드러났습니다.
- provenance / source labeling 거침
- unverified backlog 큼
- richer schema가 실제 운영에서는 충분히 활용되지 않음
- static artifact가 live truth처럼 오해될 위험

이 문제들은 새 시스템에서 반드시 설계 수준에서 해결해야 합니다.

---

## 이번 설계에서 중요하지 않은 것

이번 planning scope에서는 다음을 새 시스템의 구성요소로 취급하지 않습니다.

- `claude-telegram`
- `mrstack`
- 기타 별도 product/runtime 프로젝트

이들은 이번 새 메인 시스템 설계 범위 밖입니다.

---

## 한 줄 요약

> **기존 시스템들은 새 메인 시스템의 reference sources이고, 새 시스템은 JCP의 truth discipline, ontology의 관계 모델, jarvis-brain의 façade pattern, MemPalace의 archive capability를 추출해 OMX + Codex 전용 local-first core로 다시 설계해야 한다.**
