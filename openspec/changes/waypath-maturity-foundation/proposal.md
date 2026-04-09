# Change Proposal: Waypath Maturity Foundation

## Summary

Waypath는 이미 설치 가능한 local-first CLI와 usable v1-core를 갖췄다.
다음 단계는 방향을 바꾸는 것이 아니라, **현재 구조를 깨지 않고 더 성숙하게 만드는 것**이다.

Honcho review 결과를 바탕으로, 이번 change는 아래 세 축을 non-breaking 방식으로 도입한다.

1. **Config / Runtime maturity**
2. **Retrieval strategy separation**
3. **Domain model hardening**

핵심 원칙은 다음과 같다.

- Waypath는 계속 **terminal-installable local-first CLI**다.
- source systems는 계속 **read-only**다.
- truth owner는 계속 **SQLite local store**다.
- server-first / Postgres-first / managed-service 방향으로 drift하지 않는다.

## Why

현재 Waypath는 usable하다.
하지만 Honcho와 비교했을 때 다음 약점이 분명하다.

- runtime/config 조정 계층이 얇다
- recall scoring과 retrieval logic이 구조적으로 분리되어 있지 않다
- session / source / review / contradiction 관련 object model이 아직 ad-hoc 문자열에 기대는 부분이 있다

즉, 지금 필요한 것은 기능을 더 많이 붙이는 것이 아니라
**구조적 성숙도**를 높이는 것이다.

## Scope

### In scope
- `config.toml` + env override layer
- retrieval strategy layer 도입
- session / source / review / contradiction / stale object model 보강
- regression / verification 강화

### Out of scope
- FastAPI server 전환
- Postgres / pgvector 전환
- webhook / telemetry / queue 인프라 대도입
- managed-service 방향 전환
- MemPalace real adapter 구현

## Expected outcome

이 change가 끝나면:

- Waypath의 runtime behavior를 설정으로 조정할 수 있고
- recall/retrieval 로직을 독립적으로 발전시킬 수 있으며
- session / source / review / stale / contradiction 흐름이 더 명확한 object model 위에서 설명된다
- 이후 고도화도 current local-first CLI 정체성 안에서 안정적으로 진행될 수 있다
