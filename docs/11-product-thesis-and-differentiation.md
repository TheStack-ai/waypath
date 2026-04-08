# Differentiation Architecture

## 목적

이 문서는 이 시스템이 왜 단순 memory tool이나 단순 RAG tool이 아니라,
**Claude Code / Codex 위에 얹는 차별화된 external brain layer**인지 정의합니다.

이 문서는 특히 다음 질문에 답합니다.

- 이 시스템은 무엇을 대체하는가?
- 무엇을 증강하는가?
- RAG / ontology / wiki / truth governance를 어떻게 함께 가져가는가?
- v1에서 진짜 차별성을 만드는 최소 핵심은 무엇인가?

---

## Product Thesis

이 시스템은:
- Claude Code / Codex를 대체하는 제품이 아니라
- 그 위에 붙는 **agent-native cognitive layer**입니다.

쉽게 말하면:
- 기존 에이전트가 실행 엔진이라면
- 이 시스템은 기억 / 구조화된 맥락 / 근거 회수 / 검토 기반 축적을 담당하는 뇌입니다.

즉:

> **External Brain Layer for Coding Agents**

입니다.

---

## 이 시스템이 아닌 것

- 또 하나의 AI chat app
- 그냥 vector DB + retrieval wrapper
- 단순한 note-taking wiki
- source systems를 그대로 재포장한 bundle
- existing Claude Code/Codex replacement

---

## 무엇에서 차별성이 생기나

### 1. Truth-aware memory
대부분의 memory/RAG 시스템은 “잘 찾는 것”에 집중합니다.
이 시스템은 “잘 찾는 것” 이전에 **무엇이 현재 사실인가**를 분리합니다.

### 2. Archive-aware reasoning
과거 기록은 truth가 아니라 **evidence/archive**로 남고,
필요할 때 why/how 맥락을 회수합니다.

### 3. Graph-aware context
질의를 chunk 검색으로만 처리하지 않고,
entity / relationship / decision / project의 연결 구조를 따라가며 context를 확장합니다.

### 4. Wiki-like human surface
결과가 DB row나 raw retrieval로 끝나지 않고,
operator가 읽고 편집할 수 있는 page/card로 나타납니다.

### 5. Review-based promotion
archive에서 잘 찾았다고 바로 truth가 되지 않고,
review / promotion / provenance를 거칩니다.

---

## Best-of synthesis

### JCP / Jarvis에서 계승할 것
- truth discipline
- decision / preference / entity 관리
- session-start context 개념
- promotion / distillation 관점

### Ontology에서 계승할 것
- entity / relation structure
- graph-like traversal
- 연결 기반 맥락 회수

### jarvis-brain에서 계승할 것
- façade necessity
- operator-facing access shape

### MemPalace에서 계승할 것
- archive recall
- long-form historical memory
- evidence-first retrieval

### RAG에서 계승할 것
- source-grounded retrieval
- evidence appendix
- incremental update 사고

### LLM Wiki에서 계승할 것
- page/card abstraction
- human-readable canonical surface
- editable explanation layer

---

## Architecture Principles

### Principle 1 — One current-truth owner
현재 사실을 소유하는 곳은 하나만 있어야 한다.

### Principle 2 — Archive is not truth
archive는 historical evidence owner이지 현재 truth owner가 아니다.

### Principle 3 — Graph is structure, not authority
graph는 맥락 확장과 연결 이해를 위한 층이지 독립 authority가 아니다.

### Principle 4 — Pages are operator surfaces
page/card는 사람이 읽고 이해하는 canonical view이지만 hidden truth owner가 되어선 안 된다.

### Principle 5 — Promotion is a governance event
좋은 retrieval은 곧바로 truth가 아니라 review/promotion 후보가 되어야 한다.

### Principle 6 — Source systems are teachers, not runtime owners
기존 시스템은 분석 source이지 target runtime이 아니다.

### Principle 7 — v1 optimizes for operator value, not deployment scale
초기에는 배포성보다 daily-use usefulness가 더 중요하다.

---

## Must-have differentiation in v1

v1에서 반드시 있어야 차별성이 살아나는 것은 다음입니다.

1. truth-first / archive-second retrieval
2. entity / relationship graph expansion
3. human-readable project/entity/decision page
4. evidence appendix with provenance
5. review-based promotion
6. session-start context pack that mixes truth + graph + evidence wisely

이 중 하나라도 빠지면,
그 시스템은 그냥 memory tool이나 simple RAG tool로 보일 위험이 큽니다.

---

## What to postpone

다음은 차후 단계로 미뤄도 됩니다.

- multi-user collaboration
- deployment infra
- public API hardening
- heavy full-corpus graph indexing
- automatic long-horizon self-evolution

---

## One-line differentiation

> **이 시스템은 “잘 찾아주는 RAG”가 아니라, “현재 truth를 지키면서 과거 evidence를 구조적으로 회수하고, 사람이 읽을 수 있는 wiki surface로 정리하며, 검토된 사실만 장기 기억으로 승격하는 에이전트용 external brain”이다.**
