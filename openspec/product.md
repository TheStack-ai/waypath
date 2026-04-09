# Product

## Name
Waypath

## Purpose
기존 Claude Code 기반 메인 시스템들을 **reference source**로 활용하여,
Claude Code / Codex 위에 얹어 사용하는 **external brain layer**를 설계하고 구현한다.

초기 대상은 OMX + Codex 기반 local-first 단일 운영 환경이다.

핵심 목표는:
- 새 truth kernel 구축
- graph/ontology context layer 구축
- MemPalace 기반 archive integration 구축
- wiki/page layer 구축
- promotion / provenance discipline 명확화
- unified façade 구축
- 향후 deployment 가능한 경계 확보

입니다.

## Core product idea

### Source Systems (read-only references)
- JCP / Jarvis
- Jarvis Ontology
- jarvis-brain
- MemPalace

### New V1 Runtime
- Truth Kernel
- Graph / Ontology Layer
- Archive Integration
- Knowledge Page / Wiki Layer
- Promotion / Provenance Layer
- Access Facade
- OMX + Codex operator workflow

## Initial Product Boundary

### In scope
- local-first single-operator v1
- session-start context pack
- truth-first retrieval
- graph-assisted context expansion
- archive-augmented recall
- page/card generation
- review-based promotion

### Out of scope (v1)
- deployment
- multi-user
- unrelated product/runtime projects
- direct source-system modification
