# Change Proposal: Build an External Brain Layer from Analyzed Sources

## Summary

기존 Claude Code 기반 메인 시스템들을 직접 수정하는 대신,
그 시스템들을 **reference source**로 사용하여 Claude Code / Codex 위에 얹는 새로운 external brain layer를 설계한다.

새 시스템의 v1 방향은 다음과 같다.

- JCP / Jarvis → truth kernel design source
- Jarvis Ontology → relationship / graph source
- jarvis-brain → façade pattern source
- MemPalace → archive capability source
- RAG concepts → source-grounded retrieval + evidence appendix
- LLM wiki concepts → human-readable canonical page/card layer
- OMX + Codex → initial operator environment

즉,
기존 시스템 통합이 아니라 **source extraction + cognitive architecture synthesis**가 목표다.

## Why

기존 분석 결과,
source systems 안에는 이미 좋은 구조가 있다.

하지만 다음 문제가 반복되었다.
- truth / archive / façade ownership ambiguity
- provenance discipline weakness
- static artifact drift
- archive와 truth의 경계 혼동
- human-readable canonical surface 부재

따라서 최선의 방향은
기존 시스템을 계속 덧대는 것이 아니라,
그 안의 검증된 구조와 최신 retrieval/wiki 개념을 결합해 **새 local-first external brain**을 만드는 것이다.

## Scope

### In scope
- source extraction matrix 작성
- new truth kernel 설계
- graph/ontology context layer 설계
- MemPalace archive integration 설계
- knowledge page/card layer 설계
- façade / MCP surface 설계
- promotion / provenance 설계
- OMX + Codex local-first v1 backlog 작성

### Out of scope (initial slice)
- source systems direct modification
- unrelated projects (`claude-telegram`, `mrstack`) 통합
- deployment / multi-user / remote operation
- archive auto-promotion
- full heavy graph indexing of the entire archive corpus

## Expected outcome

구현 후에는:
- 새 시스템이 자체 truth kernel을 소유하고
- graph/ontology layer가 context를 구조적으로 확장하며
- MemPalace가 archive/evidence recall을 제공하고
- page/card layer가 사람이 읽을 수 있는 canonical surface를 제공하며
- façade는 truth/graph/archive/pages를 조합해 OMX + Codex에 노출하고
- source systems는 read-only reference path로만 남는다.
