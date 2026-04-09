# Retrieval Strategy Separation

## 목적

Phase 2의 목표는 Waypath의 현재 recall/session ranking 동작을 **분리 가능한 retrieval strategy layer**로 옮기면서도,
CLI surface와 local-first 기본 동작을 깨지 않는 것이다.

이 문서는 두 가지를 동시에 수행한다.

1. 현재 inline scoring 코드에 대한 **review checklist**를 남긴다.
2. 구현 후 코드와 테스트가 만족해야 할 **documentation baseline**을 고정한다.

---

## 현재 review 대상

현재 retrieval/ranking 로직은 주로 아래 두 위치에 흩어져 있다.

- `src/session-runtime/session-runtime.ts`
  - `sourceSystemWeight`
  - `sourceKindWeight`
  - `relationshipTypeWeight`
  - `rankEntities`
  - `rankDecisions`
  - `rankPreferences`
  - `rankPromotedMemories`
- `src/archive-kernel/providers.ts`
  - `scoreItem`
  - archive evidence sorting/tie-break logic

review 기준:

- session/runtime assembly와 ranking policy가 같은 파일에 뭉쳐 있지 않아야 한다.
- archive provider가 lexical ranking policy를 직접 소유하지 않아야 한다.
- source/provenance/graph weighting 규칙이 한 곳에서 설명 가능해야 한다.
- 현재 tie-break(`updated_at`, `observed_at`)의 결정성이 유지되어야 한다.

---

## 목표 아키텍처

권장 surface는 `src/archive-kernel/retrieval/` 아래의 작은 전략 모듈 집합이다.

예시 구조:

```text
src/archive-kernel/retrieval/
  index.ts
  strategy.ts
  lexical.ts
  provenance.ts
  source-weights.ts
  graph-relevance.ts
  vector-hook.ts
```

핵심 원칙:

- **lexical**: query token/title/excerpt/source-ref 기반 기본 관련도
- **provenance**: confidence, source metadata, provenance quality 반영
- **source-weight**: runtime config가 제공하는 source-system / source-kind 가중치 반영
- **graph-relevance**: relationship density, scoped entity relevance, connected-context boost 반영
- **vector-hook**: 아직 실제 backend는 없지만 future adapter를 끼울 수 있는 boundary만 정의

이 layer 밖의 코드는 “무엇을 rank할지”만 결정하고,
“어떻게 점수를 계산할지”는 retrieval strategy에 위임해야 한다.

---

## non-breaking invariants

Phase 2 구현은 아래 조건을 지켜야 한다.

1. `waypath` CLI command surface는 바뀌지 않는다.
2. `config.toml` / env 기반 retrieval weight knob는 계속 동작한다.
3. vector backend가 없어도 현재 local-first 기본 경로가 그대로 동작한다.
4. source adapter는 여전히 read-only다.
5. default ranking은 regression test로 고정된다.

즉, 이번 slice는 **search sophistication 추가**가 아니라
**existing behavior를 explainable/testable surface로 재배치**하는 작업이다.

---

## component contract expectations

### 1. Session runtime

`session-runtime`은 아래까지만 책임진다.

- session-start snapshot 확장
- entity/decision/preference/memory 후보 수집
- graph edge 후보 수집
- retrieval strategy 호출
- 상위 context pack 조립

`session-runtime` 내부에 source weight table이나 provenance scoring constant가 남아 있으면
분리가 덜 된 상태로 본다.

### 2. Archive provider

`archive-kernel/providers.ts`는 아래까지만 책임진다.

- evidence item 정규화
- filter 적용
- retrieval strategy 호출
- bundle shape 반환

archive provider 내부에 title/excerpt hit scoring rule이 박혀 있으면
lexical scoring 분리가 아직 완료되지 않은 것이다.

### 3. Future vector hook

vector hook은 다음 상태면 충분하다.

- interface/type 수준 boundary 존재
- 기본 구현은 no-op 또는 zero contribution
- 현재 build/test/CLI에서 optional dependency가 추가되지 않음

이번 단계에서 실제 vector DB, embedding pipeline, remote service 의존성은 금지다.

---

## regression checklist

최소한 아래 regression이 유지되어야 한다.

- truth-kernel source가 demo/archive source보다 기본적으로 우선될 것
- stronger provenance/confidence가 weaker provenance보다 앞설 것
- graph-connected entity가 disconnected entity보다 더 relevant하게 반영될 것
- identical score에서는 기존 recency tie-break가 유지될 것
- config override가 source-system/source-kind weighting에 반영될 것

---

## documentation expectations after implementation

구현이 끝난 뒤 README나 release note에서 바로 설명 가능해야 하는 문장은 다음이다.

- retrieval scoring is now separated from runtime assembly
- source/provenance/graph weighting is configurable without changing CLI usage
- vector integration remains optional and disabled by default
- local-first deterministic ranking is preserved

이 네 문장을 코드/테스트로 증명하지 못하면,
이번 maturity slice는 문서상 완료로 간주하지 않는다.
