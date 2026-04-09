# Core Schemas and Contracts

## 목적

이 문서는 구현 직전 단계에서 반드시 고정해야 하는 핵심 schema/contract를 한 번에 정리한다.

이번 문서에서 고정하는 항목:
1. Truth Kernel 최소 schema
2. Entity / Relationship graph schema
3. SessionContextPack contract
4. MemPalace integration mode
5. Knowledge Page schema
6. PromotionCandidate schema

기준:
- JCP / Jarvis audit에서 확인한 **5 memory types + 3 access tiers**를 잊지 않는다.
- MemPalace는 archive owner로 유지한다.
- page/wiki layer는 human-readable surface이지만 truth owner는 아니다.

---

## 1. Truth Kernel 최소 schema

## 1.1 Recommended tables

### `entities`
현재 truth의 핵심 주체/대상

필수 필드:
- `entity_id` TEXT PRIMARY KEY
- `entity_type` TEXT
- `name` TEXT
- `summary` TEXT
- `state_json` TEXT
- `status` TEXT
- `canonical_page_id` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

### `relationships`
entity 간 구조적 연결

필수 필드:
- `relationship_id` TEXT PRIMARY KEY
- `from_entity_id` TEXT
- `relation_type` TEXT
- `to_entity_id` TEXT
- `weight` REAL NULL
- `status` TEXT
- `provenance_id` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

### `decisions`
현재 유효하거나 과거에 유효했던 결정

필수 필드:
- `decision_id` TEXT PRIMARY KEY
- `title` TEXT
- `statement` TEXT
- `status` TEXT
- `scope_entity_id` TEXT NULL
- `effective_at` TEXT NULL
- `superseded_by` TEXT NULL
- `provenance_id` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

### `preferences`
운영자/시스템/프로젝트 선호 및 고정 제약

필수 필드:
- `preference_id` TEXT PRIMARY KEY
- `subject_kind` TEXT
- `subject_ref` TEXT NULL
- `key` TEXT
- `value` TEXT
- `strength` TEXT
- `status` TEXT
- `provenance_id` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

### `promoted_memories`
JCP의 강점을 계승한 promoted memory layer

필수 필드:
- `memory_id` TEXT PRIMARY KEY
- `memory_type` TEXT
- `access_tier` TEXT
- `summary` TEXT
- `content` TEXT
- `subject_entity_id` TEXT NULL
- `status` TEXT
- `provenance_id` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

### `provenance_records`
truth/claim/page의 근거 추적

필수 필드:
- `provenance_id` TEXT PRIMARY KEY
- `source_system` TEXT
- `source_kind` TEXT
- `source_ref` TEXT
- `observed_at` TEXT NULL
- `imported_at` TEXT NULL
- `promoted_at` TEXT NULL
- `promoted_by` TEXT NULL
- `confidence` REAL NULL
- `notes` TEXT NULL

### `claims`
archive/evidence/synthesis로부터 만들어진 사실 후보

필수 필드:
- `claim_id` TEXT PRIMARY KEY
- `claim_type` TEXT
- `claim_text` TEXT
- `subject_entity_id` TEXT NULL
- `status` TEXT
- `evidence_bundle_id` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

### `promotion_candidates`
review 후 truth 변경을 시도하는 객체

필수 필드:
- `candidate_id` TEXT PRIMARY KEY
- `claim_id` TEXT
- `proposed_action` TEXT
- `target_object_type` TEXT
- `target_object_id` TEXT NULL
- `review_status` TEXT
- `review_notes` TEXT NULL
- `created_at` TEXT
- `updated_at` TEXT

---

## 1.2 Required enums

### `memory_type`
JCP audit에서 확인된 canonical set를 그대로 계승한다.
- `episodic`
- `semantic`
- `project`
- `procedural`
- `analytical`

### `access_tier`
JCP audit에서 확인된 canonical set를 그대로 계승한다.
- `self`
- `notes`
- `ops`

### `entity_type` (v1 recommended)
- `person`
- `project`
- `system`
- `tool`
- `concept`
- `decision`
- `task`
- `event`

### `truth_status`
- `active`
- `superseded`
- `inactive`
- `rejected`

### `candidate_review_status`
- `pending`
- `accepted`
- `rejected`
- `superseded`

---

## 2. Entity / Relationship graph schema

## 2.1 Core graph model

graph는 별도 owner가 아니라 truth를 더 잘 읽기 위한 구조층이다.

### Node source
- `entities`
- `decisions` (entity처럼 연결 가능)
- `preferences` (subject-bound relation 가능)
- `knowledge_pages` (soft-linked node)

### Edge source
- `relationships`
- decision/page/evidence linking tables or derived relations

## 2.2 Recommended relation types

v1에서 우선 지원하면 좋은 relation types:
- `relates_to`
- `depends_on`
- `blocks`
- `supports`
- `uses`
- `owned_by`
- `decided_by`
- `about`
- `implements`
- `supersedes`
- `evidence_for`
- `preferred_by`

## 2.3 Required traversal patterns

### Pattern A — project context expansion
`project -> decisions -> tasks -> tools -> evidence`

### Pattern B — person/operator context
`person -> preferences -> projects -> decisions`

### Pattern C — system reasoning context
`system -> concepts -> tools -> decisions -> evidence`

### Pattern D — contradiction lookup
`claim -> target truth object -> supersedes/contradicts -> evidence`

---

## 3. SessionContextPack contract

## 3.1 Output shape

```json
{
  "current_focus": {
    "project": "...",
    "objective": "...",
    "activeTask": "..."
  },
  "truth_highlights": {
    "decisions": [],
    "preferences": [],
    "entities": [],
    "promoted_memories": []
  },
  "graph_context": {
    "seed_entities": [],
    "related_entities": [],
    "relationships": []
  },
  "recent_changes": {
    "recent_promotions": [],
    "superseded": [],
    "open_contradictions": [],
    "review_queue": [],
    "stale_items": []
  },
  "evidence_appendix": {
    "enabled": true,
    "bundles": []
  },
  "related_pages": []
}
```

> Compatibility note: Phase 3 domain-model hardening may introduce richer internal typed objects,
> but the v1 CLI / host-facing JSON contract stays non-breaking. In particular,
> `current_focus.activeTask`, `recent_changes.review_queue`, and `recent_changes.stale_items`
> remain part of the public result shape until a deliberate major-version contract change.

## 3.2 Required behavior

- `current_focus`는 짧고 실행 친화적이어야 한다.
- `truth_highlights`는 current truth만 담는다.
- `graph_context`는 관련 맥락을 압축해준다.
- `evidence_appendix`는 optional이며 archive 결과를 truth와 섞지 않는다.
- `related_pages`는 읽기 쉬운 canonical surface로 연결한다.

## 3.3 Session-start truth query pack

v1에서 기본으로 필요한 조회는 다음이다.

1. active decisions
2. active preferences
3. current project / task entities
4. recent promoted memories
5. related entities/relationships
6. optional historical evidence bundles
7. related project/decision/entity pages

---

## 4. MemPalace integration mode

## 4.1 Recommended decision

권장안:
> **ArchiveProvider interface를 먼저 정의하고, v1 기본 구현은 MemPalace-backed provider로 둔다.**

즉 구현 형태는:
- internal contract: `ArchiveProvider`
- concrete provider: `MemPalaceProvider`
- provider backend: MCP or local adapter whichever is simplest locally

## 4.2 Why this choice

이 선택의 장점:
- MemPalace를 archive owner로 유지 가능
- 구현 세부(MCP/CLI/local lib)를 나중에 바꿔도 contract 유지 가능
- future provider 추가도 쉬움
- external brain layer로서 abstraction이 깔끔함

## 4.3 Required ArchiveProvider contract

필수 메서드 예시:
- `search(query, filters) -> EvidenceBundle`
- `get_item(evidence_id) -> EvidenceItem`
- `ingest_pointer(meta) -> pointer_ref` (optional)
- `health() -> status`

---

## 5. Knowledge Page schema

## 5.1 Recommended page types

v1 최소 page types:
- `project_page`
- `entity_page`
- `decision_page`
- `topic_brief`
- `session_brief`

## 5.2 Common page fields

- `page_id`
- `page_type`
- `title`
- `summary_markdown`
- `status` (`draft`, `canonical`, `stale`)
- `linked_entity_ids[]`
- `linked_decision_ids[]`
- `linked_evidence_bundle_ids[]`
- `updated_at`

## 5.3 Storage rule

- page body는 `knowledge/pages/*.md` 같은 human-readable surface에 둔다.
- metadata는 truth DB or lightweight page-metadata table에 둔다.
- page는 view layer이지 truth owner가 아니다.

---

## 6. PromotionCandidate schema

## 6.1 Required fields

- `candidate_id`
- `claim_id`
- `proposed_action` (`create`, `update`, `supersede`)
- `target_object_type`
- `target_object_id`
- `review_status`
- `review_notes`
- `created_at`
- `updated_at`

## 6.2 Required review outcomes

- `accepted`
- `rejected`
- `superseded`
- `needs_more_evidence`

## 6.3 Promotion side effects

accepted promotion 시:
1. target truth object 생성/변경
2. provenance record 연결
3. contradiction/supersede update
4. related knowledge page refresh
5. next session context pack에 반영 가능

---

## 7. Host Shim / Facade contract

v1에서는 host integration을 위한 thin shim이 필요하지만,
**host shim은 contract owner가 아니라 translation layer**여야 한다.

### 7.1 Host shim responsibilities
- host detection / workspace bootstrap
- shared backend pointer wiring
- session-start context pack 요청
- façade verbs를 host affordance로 번역
- degraded mode / fallback 안내

### 7.2 Host shim non-responsibilities
- truth ownership
- archive ownership
- page/card ownership
- promotion decision ownership
- host별 별도 truth semantics

### 7.3 Stable backend verbs
host shim이 호출해야 하는 shared backend verbs는 다음으로 고정한다.

- `start` / `session-start`
- `truth.query`
- `archive.query`
- `graph.query`
- `page.get`
- `promotion.submit`
- `promotion.review`

### 7.4 Automatic vs explicit boundary
- automatic: session-start context assembly, safe truth/graph/page read path
- explicit: promotion, contradiction resolution, import / re-import, destructive reset

### 7.5 Rollout sequence
1. Codex first
2. shared backend contract 안정화
3. Claude Code parity
4. alias takeover는 후순위 opt-in

### 7.6 Contract rule
host shim은 current truth를 숨기거나 우회하지 않아야 하며,
모든 durable state 변화는 shared backend contract를 통해서만 일어나야 한다.

---

## Implementation verdict

이 문서 기준으로 보면 다음이 바로 구현 착수 대상이다.

1. SQLite migrations for truth tables
2. `ArchiveProvider` interface
3. graph traversal helpers
4. `SessionContextPack` assembler
5. page markdown + metadata shape
6. promotion review contract

즉,

> **이제 다음 단계는 더 이상 개념 브레인스토밍이 아니라 schema/migration/interface/code skeleton 작업이다.**
