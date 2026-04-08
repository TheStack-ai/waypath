# 14. Host Integration Executive Review

이 문서는 Jarvis Fusion System을 **Claude Code / Codex 사용자가 “새 앱을 설치했다”가 아니라 “기존 에이전트가 더 똑똑해졌다”**고 느끼도록 패키징/호스트 통합 방식을 결정하기 위한 executive review 결과를 정리합니다.

이 결정은 다음 문서와 컨텍스트를 기반으로 합니다.

- `README.md`
- `docs/07-v1-architecture-spec.md`
- `docs/08-implementation-backlog.md`
- `docs/09-repo-module-plan.md`
- `docs/10-storage-and-import-strategy.md`
- `docs/11-product-thesis-and-differentiation.md`
- `docs/12-cognitive-data-model-and-flows.md`
- `docs/13-core-schemas-and-contracts.md`
- `.omx/context/host-integration-strategy-20260408T053653Z.md`
- `.omx/plans/team-mode-executive-review-worker-1.md`
- `.omx/plans/worker-1-cto-platform-host-integration-review.md`

---

## 1. Final decision

### 최종 결론
Jarvis Fusion은 **하나의 shared local backend**를 중심으로 두고, Codex / Claude Code에는 **thin host shim**만 제공하는 구조가 가장 적합합니다.

즉, 기본 전략은 다음과 같습니다.

1. **backend는 하나**만 둔다.
2. **truth / archive / graph / page / promotion ownership**은 backend에 집중시킨다.
3. Codex / Claude Code 쪽은 backend를 더 자연스럽게 쓰게 해 주는 **entry shim / activation layer**만 둔다.
4. daily UX의 중심은 **세션 시작 시 자동 context augmentation**이고,
5. slash commands는 있어도 되지만 **secondary convenience surface**로만 취급한다.

### 한 줄 요약
> **Jarvis Fusion은 별도 앱이 아니라, 기존 Claude Code / Codex를 더 똑똑하게 만드는 shared brain backend + thin host shim 구조로 가야 한다.**

---

## 2. Why this is the right fit

기존 문서들의 공통 결론은 다음과 같습니다.

- 새 시스템은 **external brain layer**여야 한다 (`docs/11`)
- current truth owner는 **하나**여야 한다 (`docs/07`, `docs/10`, `docs/13`)
- archive는 truth owner가 아니라 **historical evidence owner**다 (`docs/07`, `docs/10`, `docs/12`)
- page/wiki layer는 human-readable surface이지 truth owner가 아니다 (`docs/07`, `docs/10`, `docs/13`)
- façade / session-runtime은 access layer이며, backend ownership을 대체하지 않는다 (`docs/07`, `docs/09`)

이 전제를 그대로 따르면, host integration은 제품 분할이 아니라 **access-layer adaptation 문제**로 다루는 것이 맞습니다.

만약 host별로 backend를 나누거나, 별도 daily app을 전면에 세우면 다음 문제가 생깁니다.

- host별 split-brain
- truth/archive 경계 약화
- 설치/운영 mental model 복잡화
- “augmentation”이 아니라 “replacement product”처럼 보이는 문제

---

## 3. Packaging decision

### 추천 패키지 구조

#### Layer A — shared backend
공통 backend는 다음을 소유합니다.

- truth kernel
- archive integration boundary
- ontology / graph support
- knowledge pages / cards
- promotion / provenance rules
- session-start context assembly
- common façade contract

개념적으로는 아래처럼 이해하면 됩니다.

```text
jarvis-fusion-core
  - truth-kernel
  - archive-kernel
  - ontology-support
  - knowledge-pages
  - promotion
  - facade
  - session-runtime
```

#### Layer B — host shims
호스트별로는 얇은 shim만 제공합니다.

- Codex shim
- Claude Code shim

이 shim의 책임은 다음 정도로 제한해야 합니다.

- host bootstrap / activation
- host-native entrypoint 제공
- startup context pack 주입
- 공통 backend action을 host affordance로 번역

### 피해야 하는 구조

다음은 기본 전략으로 채택하지 않습니다.

- host별 독립 backend / 독립 저장소
- Jarvis Fusion standalone app를 daily primary surface로 두는 구조
- host-specific command catalog가 backend contract를 대체하는 구조
- host마다 다른 truth/promotion semantics를 갖는 구조

---

## 4. Install shape

### 추천 install story
사용자 관점 install story는 최대한 단순해야 합니다.

1. shared backend를 **한 번 설치**한다.
2. Codex 또는 Claude Code용 **host shim을 활성화**한다.
3. 사용자는 원래 쓰던 host를 거의 그대로 사용한다.
4. 세션 시작 시 Jarvis Fusion이 **조용히 context를 보강**한다.

### UX 원칙
사용자가 느껴야 하는 경험은 다음과 같습니다.

- “새로운 앱을 배웠다”가 아니라
- “내가 원래 쓰던 에이전트가 이제 더 잘 기억하고, 더 잘 연결하고, 더 잘 briefing한다”

### 권장 entry shape
v1에서는 아래처럼 **명시적 enhanced entry**가 더 안전합니다.

```bash
jf codex
jf claude
```

이후 안정화되면 opt-in alias takeover를 고려할 수 있습니다.

```bash
jarvis-fusion host enable codex --alias
jarvis-fusion host enable claude-code --alias
```

하지만 기본값으로 native binary를 shadowing하는 것은 trust / rollback / debugging 측면에서 너무 공격적입니다.

---

## 5. Automatic vs explicit

### Automatic by default
자동화는 **safe read path**에 한정합니다.

- host detection
- project/session detection
- session-start context pack assembly
- current truth briefing
- relevant graph context expansion
- recent promotions / changes 요약
- 필요 시 evidence appendix 링크 제공

### Explicit only
명시적이어야 하는 것은 durable state 변화와 high-impact action입니다.

- promotion / truth mutation
- contradiction / supersede resolution
- imports / re-imports
- archive deep dive
- destructive reset / migration
- host alias takeover / install mutation

### 이유
이 구분은 이미 문서 전체에서 일관됩니다.

- archive는 truth가 아니고
- promotion은 reviewed path여야 하며
- session-start context는 automatic이어도 되지만
- truth overwrite는 automatic이면 안 됩니다.

즉:

> **automatic read, explicit write**

이 규칙이 host integration에서도 그대로 유지되어야 합니다.

---

## 6. Slash command decision

### 결론
slash commands는 **secondary**입니다.

- 있어도 된다.
- 하지만 primary UX가 되어선 안 된다.
- backend / façade contract를 대체해서도 안 된다.

### 왜 secondary인가
slash-command-first 전략은 다음 문제를 만듭니다.

- host 의존성이 커진다.
- 제품이 “brain layer”가 아니라 “plugin command set”처럼 보인다.
- 사용자가 value를 느끼기 전에 새로운 command language를 먼저 학습해야 한다.

### 올바른 위치
slash commands가 존재한다면 다음 조건을 만족해야 합니다.

- 공통 backend action의 thin alias일 것
- host별 divergence를 최소화할 것
- power-user shortcut로만 취급할 것

### 최소 explicit command set
정말 필요한 명시 action은 작게 유지해야 합니다.

- `context` / `start` — 현재 session context refresh
- `recall` — deeper historical recall
- `page` — canonical page/card surface
- `promote` — reviewed truth promotion

핵심은 **command set 자체가 wedge가 아니어야 한다**는 점입니다.

---

## 7. User wedge

### strongest wedge
가장 강한 wedge는 “command richness”가 아니라 **session-start clarity**입니다.

사용자는 설치 후 첫 세션에서 바로 아래를 느껴야 합니다.

- 지금 프로젝트에서 중요한 truth가 무엇인지
- 최근 바뀐 결정이 무엇인지
- 어떤 entity / decision / relationship이 연결되는지
- 필요하면 어떤 evidence를 더 볼 수 있는지

### first value moment
첫 가치 경험은 다음이어야 합니다.

1. enhanced host entry로 진입한다.
2. 세션 시작 시 compact context pack을 받는다.
3. 바로 더 좋은 continuity / recall / orientation을 체감한다.

### 피해야 할 first-run 경험
- slash commands를 먼저 외워야 함
- Jarvis 전용 app/shell/dashboard를 먼저 열어야 함
- install 후에도 value가 보이지 않고 설정만 많은 상태

---

## 8. Brand / interaction stance

### branding rule
브랜드는 **control plane**에는 보여도 되지만, **daily runtime**에서는 host보다 앞으로 나오면 안 됩니다.

#### brand should be visible in
- install / bootstrap
- admin / diagnostics
- provenance / promotion / page labels
- explicit backend actions

#### brand should be subtle in
- session-start briefing
- host runtime interaction
- everyday question/answer flow

### desired feel
Jarvis Fusion은 다음처럼 느껴져야 합니다.

- “Codex with better memory”
- “Claude Code with better recall and structure”

아래처럼 느껴지면 실패입니다.

- “Claude/Codex 위에 올라탄 또 하나의 app shell”

---

## 9. Rollout recommendation

### Phase A — shared backend baseline
먼저 shared backend와 최소 runtime contract를 고정합니다.

필수 범위:
- truth kernel
- archive boundary
- graph support
- page/card surface
- promotion / provenance rules
- session-start context assembly

### Phase B — Codex-first shim
현재 workspace 전체가 OMX + Codex local-first를 전제로 하고 있으므로 Codex shim을 먼저 붙입니다.

목표:
- startup context가 실제로 유용한지 검증
- command set 없이도 wedge가 성립하는지 검증
- explicit write boundary가 자연스러운지 검증

### Phase C — Claude Code shim parity
Codex에서 façade contract가 안정화되면 Claude Code shim을 붙입니다.

원칙:
- backend semantics는 동일
- host affordance만 얇게 변환
- truth/archive/promotion 규칙은 절대 host별로 갈라지지 않음

### rollout rule
두 호스트를 동시에 크게 벌리기보다,
**backend invariant를 먼저 고정하고 host parity를 나중에 맞추는 순서**가 안전합니다.

---

## 10. Concrete implications for this repo

현재 문서 구조 기준으로 보면 이 결정은 아래와 직접 연결됩니다.

- `docs/08-implementation-backlog.md`
  - Workstream 9를 **shared backend + thin host shims** 기준으로 다시 분해해야 함
  - automatic read / explicit write 경계를 task-level acceptance criteria로 내려야 함
- `docs/09-repo-module-plan.md`
  - `src/facade/`, `src/session-runtime/`를 공통 backend contract 중심으로 유지해야 함
  - `src/host-shims/`는 bootstrap/translation only layer로 추가해야 함
- `docs/10-storage-and-import-strategy.md`
  - host shim은 절대 truth/archive ownership을 가져가면 안 됨
- `docs/13-core-schemas-and-contracts.md`
  - context pack / page / promotion contract가 host-specific command surface보다 먼저 고정되어야 함

### host rollout sequencing
- Codex-first enhanced entry를 먼저 고정한다.
- session-start context pack과 explicit write boundary를 먼저 검증한다.
- Claude Code parity는 뒤로 미룬다.

### v1 implementation stance
v1은 아래와 같이 잡는 것이 맞습니다.

1. shared backend 우선
2. Codex-first thin shim
3. session-start context pack 품질 검증
4. explicit promotion / review flow 검증
5. Claude Code parity

---

## 11. Rejected alternatives

### A. standalone daily app
- augmentation thesis와 충돌
- host switching cost 증가
- “새 앱” 느낌 강화

### B. slash-command-first product
- host dependence 증가
- 학습 비용 증가
- brain layer보다 plugin command set처럼 보임

### C. host별 separate backend
- split-brain risk
- truth drift
- provenance / promotion governance 약화

### D. default binary takeover
- trust / rollback 부담 큼
- debugging 복잡성 증가
- 초기 설치 불안감 유발

---

## 12. Final recommendation snapshot

### Build this
- **one shared local Jarvis Fusion backend**
- **thin host-specific shims** for Codex / Claude Code
- **automatic session-start context augmentation**
- **explicit review-based write path**
- **small optional command set** only for high-intent actions

### Do not center the product on
- standalone app UX
- large slash command vocabulary
- host-divergent semantics
- automatic truth mutation

### Product sentence
> **Jarvis Fusion은 Codex / Claude Code를 대체하는 앱이 아니라, 현재 truth를 지키면서 과거 evidence와 graph context를 더 잘 끌어와 세션 시작부터 더 똑똑하게 만들어 주는 shared brain backend다.**

---

## 13. Immediate next steps

1. `docs/08` Workstream 9를 shared backend + thin host shims 기준으로 다시 세분화한다.
2. `docs/09`에 `src/host-shims/`를 추가하고 Codex-first rollout 순서를 고정한다.
3. `src/facade/`의 공통 backend verbs를 먼저 고정한다.
4. `src/session-runtime/`에서 session-start context pack contract를 먼저 검증한다.
5. Codex shim은 explicit enhanced entry부터 시작하고 alias takeover는 후순위로 둔다.
6. Claude Code shim은 Codex contract가 안정화된 뒤 parity로 붙인다.
