# Context and Purpose

## 이 프로젝트를 왜 만드는가

대표님 환경에는 이미 여러 Claude Code 기반 핵심 시스템이 존재합니다.

하지만 이번 작업의 목적은 그 시스템들을 직접 고치는 것이 아닙니다.

정확한 목적은:

> **기존 시스템들을 세세하게 분석한 결과를 바탕으로, 그 안의 좋은 구조와 규칙을 추출하고 MemPalace를 archive 축으로 활용하여 하나의 새로운 메인 시스템을 설계하는 것**

입니다.

즉 이번 프로젝트는:
- 기존 시스템의 maintenance project가 아니고
- 기존 시스템들의 강점을 추출한 **new-main-system design project**입니다.

---

## Reference Sources

이번 설계의 source는 다음 네 축입니다.

### 1. JCP / Jarvis
가장 중요한 reference source입니다.

여기서 보고 계승하려는 것:
- truth-oriented memory organization
- decisions / preferences / entities / audit 구조
- session-start retrieval discipline
- promotion / distillation 사고방식

### 2. Jarvis Ontology
새 시스템의 entity / relationship / reasoning layer를 설계할 때 참고할 source입니다.

### 3. jarvis-brain
핵심 brain owner가 아니라,
**MCP façade / access surface를 어떻게 둘 것인지**를 판단하는 source입니다.

### 4. MemPalace
새 시스템의 historical archive / raw evidence / semantic recall 축을 설계하는 source입니다.

---

## 현재까지 드러난 핵심 문제의식

문제는 “기능이 부족하다”보다 **ownership과 경계가 섞여 있었다**는 점입니다.

기존 분석에서 반복해서 확인된 것은:
- current truth owner와 archive owner가 분리되어 있지 않거나 설명이 불명확함
- façade와 kernel의 경계가 흐림
- stale surface가 live truth처럼 소비될 위험이 있음
- provenance / verification discipline이 충분히 단단하지 않음

하지만 동시에,
기존 시스템들 안에는 분명히 **살려야 할 훌륭한 구조**가 존재합니다.

즉 이번 프로젝트의 질문은:

> **무엇이 문제였는가?**
보다
> **무엇을 새 시스템의 기본 원리로 계승할 것인가?**

에 가깝습니다.

---

## 이번 프로젝트의 명확한 범위

### In scope
- source system별 강점 / 약점 정리
- 새 메인 시스템의 target architecture 설계
- truth / archive / façade / promotion 경계 정의
- OMX + Codex 전용 local-first v1 설계
- 후속 구현 backlog 작성

### Out of scope
- source systems 직접 수정
- unrelated projects(`claude-telegram`, `mrstack`) 분석/통합
- 초기부터 배포형 시스템 설계
- 다중 사용자 / SaaS / 외부 서비스 운영 모델

---

## 초기 운영 가정

새 시스템의 첫 사용자는 대표님 한 명이며,
사용 환경은 **OMX + Codex 기반 로컬 운영 환경**입니다.

이 가정이 중요합니다.

왜냐하면 v1에서 우선 최적화해야 할 것은:
- 로컬 파일/DB 접근성
- 세션 시작 컨텍스트 품질
- truth / archive retrieval 품질
- operator workflow 단순성

이지,
처음부터 배포 인프라나 외부 사용자 권한 체계가 아니기 때문입니다.

---

## 최종 목적

이 프로젝트의 최종 목적은 다음 한 문장으로 정리됩니다.

> **기존 Claude Code 기반 메인 시스템들을 직접 손대지 않고 reference source로 활용하여, OMX + Codex 전용 local-first 새 메인 시스템을 설계하고 이후 구현 가능한 수준으로 구체화하는 것**
