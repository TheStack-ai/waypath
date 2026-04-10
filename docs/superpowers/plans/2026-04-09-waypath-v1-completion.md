# Waypath v1 Completion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 4 missing/stub modules to bring Waypath from ~25% to v1-complete, fulfilling all 6 must-have differentiators from docs/11.

**Architecture:** Waypath is a local-first External Brain Layer for Coding Agents. It has 7 architectural layers: Truth Kernel (done), Archive Kernel (done), Ontology/Graph Support (MISSING), Knowledge Pages (stub), Promotion (stub), Facade (partial), Session Runtime (needs graph integration). Zero npm dependencies, Node 25+ with native SQLite.

**Tech Stack:** TypeScript strict mode, Node 25+ `node:sqlite`, zero npm deps, custom test runner.

**Current state:** 5,418 lines src / 1,631 lines tests. Target: ~15,000-20,000 lines src.

---

## Chunk 1: Ontology Support Module (must-have differentiator #2)

### Task 1: Create `src/ontology-support/types.ts`

**Files:**
- Create: `src/ontology-support/types.ts`

- [ ] **Step 1: Define relation types and traversal interfaces**

```typescript
// src/ontology-support/types.ts
import type { TruthEntityRecord, TruthRelationshipRecord, TruthDecisionRecord } from '../jarvis_fusion/contracts.js';

export const RELATION_TYPES = [
  'relates_to', 'depends_on', 'blocks', 'supports', 'uses',
  'owned_by', 'decided_by', 'about', 'implements',
  'supersedes', 'evidence_for', 'preferred_by',
] as const;

export type RelationType = typeof RELATION_TYPES[number];

export interface TraversalStep {
  readonly entity_id: string;
  readonly entity_name: string;
  readonly entity_type: string;
  readonly relation_type: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly depth: number;
  readonly weight: number | null;
}

export interface TraversalPath {
  readonly seed_entity_id: string;
  readonly steps: readonly TraversalStep[];
  readonly terminal_entity_ids: readonly string[];
}

export interface TraversalOptions {
  readonly maxDepth?: number;
  readonly maxResults?: number;
  readonly relationFilter?: readonly RelationType[];
  readonly directionFilter?: 'outgoing' | 'incoming' | 'both';
  readonly statusFilter?: readonly string[];
}

export interface GraphExpansionResult {
  readonly seed_entities: readonly string[];
  readonly expanded_entities: readonly TruthEntityRecord[];
  readonly expanded_relationships: readonly TruthRelationshipRecord[];
  readonly traversal_paths: readonly TraversalPath[];
  readonly related_decisions: readonly TruthDecisionRecord[];
}

// Pattern A-D from docs/13
export type TraversalPattern = 'project_context' | 'person_context' | 'system_reasoning' | 'contradiction_lookup';

export interface PatternTraversalRequest {
  readonly pattern: TraversalPattern;
  readonly seed_entity_id: string;
  readonly options?: TraversalOptions;
}
```

---

### Task 2: Create `src/ontology-support/traversal.ts`

**Files:**
- Create: `src/ontology-support/traversal.ts`

Core graph traversal engine. Reads from SqliteTruthKernelStorage to walk entity-relationship graph with BFS up to configurable depth.

Key functions:
- `traverseFromEntity(store, entityId, options)` — BFS multi-hop traversal returning TraversalPath
- `expandGraphContext(store, seedEntityIds, options)` — Expands seed entities into full GraphExpansionResult
- `executePattern(store, request)` — Runs one of the 4 predefined traversal patterns

Pattern definitions (from docs/13-core-schemas-and-contracts.md):
- Pattern A (project_context): `project -> decisions -> tasks -> tools -> evidence`
- Pattern B (person_context): `person -> preferences -> projects -> decisions`
- Pattern C (system_reasoning): `system -> concepts -> tools -> decisions -> evidence`
- Pattern D (contradiction_lookup): `claim -> target truth object -> supersedes/contradicts -> evidence`

Implementation notes:
- Use `store.listRelationshipsForEntity()` for each hop
- Use `store.getEntity()` to resolve entity details at each step
- Deduplicate visited entities by ID
- Respect maxDepth (default: 3) and maxResults (default: 20)
- Filter by relation type and direction per pattern

---

### Task 3: Create `src/ontology-support/index.ts`

**Files:**
- Create: `src/ontology-support/index.ts`

Barrel export for the module.

---

## Chunk 2: Promotion Module (must-have differentiator #5)

### Task 4: Create `src/promotion/types.ts`

**Files:**
- Create: `src/promotion/types.ts`

```typescript
import type { PromotionAction, CandidateReviewStatus, TruthStatus } from '../jarvis_fusion/contracts.js';
import type { PromotionCandidateView } from '../contracts/index.js';

export interface PromotionSubmission {
  readonly subject: string;
  readonly claim_text: string;
  readonly claim_type?: string;
  readonly proposed_action?: PromotionAction;
  readonly target_object_type?: string;
  readonly target_object_id?: string;
  readonly subject_entity_id?: string;
  readonly evidence_bundle_id?: string;
}

export interface ReviewDecision {
  readonly candidate_id: string;
  readonly status: CandidateReviewStatus;
  readonly notes?: string;
}

export type PromotionSideEffect =
  | { kind: 'truth_created'; object_type: string; object_id: string }
  | { kind: 'truth_updated'; object_type: string; object_id: string }
  | { kind: 'truth_superseded'; old_id: string; new_id: string }
  | { kind: 'provenance_recorded'; provenance_id: string }
  | { kind: 'page_refreshed'; page_id: string }
  | { kind: 'contradiction_resolved'; contradiction_id: string };

export interface PromotionResult {
  readonly candidate: PromotionCandidateView;
  readonly side_effects: readonly PromotionSideEffect[];
  readonly success: boolean;
  readonly message: string;
}
```

---

### Task 5: Create `src/promotion/promotion-engine.ts`

**Files:**
- Create: `src/promotion/promotion-engine.ts`
- Modify: `src/jarvis_fusion/promotion-service.ts` (delegate to engine)

The promotion engine handles the full lifecycle:
1. `submitCandidate(store, submission)` — Creates claim + candidate records in DB
2. `reviewCandidate(store, decision)` — Processes review with side effects:
   - If accepted + create: creates new truth record (entity/decision/preference/memory)
   - If accepted + update: updates existing truth record
   - If accepted + supersede: marks old record superseded, creates new
   - Always records provenance
   - Refreshes related knowledge pages (marks as stale)
   - Detects and surfaces contradictions
3. `listPendingCandidates(store, limit)` — Returns review queue
4. `resolveContradiction(store, contradictionId, resolution)` — Handles contradiction resolution

Side effect execution is transactional via `store.transaction()`.

---

### Task 6: Create `src/promotion/index.ts`

Barrel export.

---

## Chunk 3: Knowledge Pages Module (must-have differentiator #3)

### Task 7: Create `src/knowledge-pages/types.ts`

**Files:**
- Create: `src/knowledge-pages/types.ts`

```typescript
import type { KnowledgePageType, KnowledgePageStatus } from '../jarvis_fusion/contracts.js';
import type { StoredKnowledgePage } from '../contracts/index.js';

export interface PageSynthesisInput {
  readonly page_type: KnowledgePageType;
  readonly anchor_entity_id?: string;
  readonly anchor_decision_id?: string;
  readonly project?: string;
  readonly subject?: string;
}

export interface PageSynthesisContext {
  readonly entities: readonly { id: string; name: string; type: string; summary: string }[];
  readonly decisions: readonly { id: string; title: string; statement: string }[];
  readonly preferences: readonly { key: string; value: string; strength: string }[];
  readonly memories: readonly { summary: string; content: string }[];
  readonly relationships: readonly { from: string; type: string; to: string }[];
  readonly evidence_bundles: readonly string[];
}

export interface PageRefreshResult {
  readonly page_id: string;
  readonly previous_status: KnowledgePageStatus;
  readonly new_status: KnowledgePageStatus;
  readonly refreshed: boolean;
}
```

---

### Task 8: Create `src/knowledge-pages/synthesizer.ts`

**Files:**
- Create: `src/knowledge-pages/synthesizer.ts`

Page synthesis engine that creates/refreshes knowledge pages from truth + graph + evidence:

1. `synthesizePage(store, input)` — Creates a knowledge page:
   - Gathers relevant entities, decisions, preferences, memories from truth kernel
   - Uses ontology-support to expand graph context
   - Formats into structured markdown
   - Persists to knowledge_pages table
   - Returns StoredKnowledgePage

2. `refreshPage(store, pageId)` — Refreshes an existing page:
   - Re-reads current truth state
   - Re-synthesizes markdown
   - Updates status from 'stale' to 'canonical'
   - Returns PageRefreshResult

3. `markPagesStale(store, entityIds)` — Marks pages linked to given entities as stale

Page type templates:
- `project_page`: project overview + active tasks + decisions + preferences
- `entity_page`: entity details + relationships + linked decisions
- `decision_page`: decision statement + rationale + linked entities + evidence
- `topic_brief`: cross-cutting topic summary
- `session_brief`: session context snapshot (existing logic from page-service.ts, migrated here)

---

### Task 9: Create `src/knowledge-pages/index.ts`

Barrel export + migrate existing page-service.ts logic.

---

## Chunk 4: Integration — Wire Modules Together

### Task 10: Integrate ontology-support into session-runtime

**Files:**
- Modify: `src/session-runtime/session-runtime.ts`

Changes:
- Import `expandGraphContext` from ontology-support
- In `buildContextPack()`, after loading seed entities, call `expandGraphContext()` to get multi-hop related entities
- Use expanded entities to enrich `graph_context` in the context pack
- Add expanded related decisions to truth_highlights

### Task 11: Expand facade with graph.query verb

**Files:**
- Modify: `src/facade/facade.ts`
- Modify: `src/contracts/types.ts`

Changes:
- Add `'graph-query'` to `FacadeVerb` union
- Add `graphQuery(entityId: string, pattern?: TraversalPattern)` to `FacadeApi`
- Implement in facade: calls ontology-support traversal, returns expanded graph
- Add corresponding CLI command in `src/cli.ts`

### Task 12: Wire promotion engine into facade

**Files:**
- Modify: `src/facade/facade.ts`

Changes:
- Replace direct store calls in `promote()` and `review()` with promotion-engine calls
- Pass side effects back in results
- On accepted review, trigger page refresh via knowledge-pages module

### Task 13: Wire knowledge-pages into facade

**Files:**
- Modify: `src/facade/facade.ts`

Changes:
- Replace `synthesizeSessionPage()` call with knowledge-pages synthesizer
- Support all 5 page types in `page()` verb based on subject detection
- Add page refresh capability

---

## Chunk 5: Comprehensive Tests

### Task 14: Unit tests for ontology-support

**Files:**
- Create: `tests/unit/ontology-support.test.ts`

Tests:
- BFS traversal from seed entity with depth 1, 2, 3
- Pattern A (project context) expansion
- Pattern B (person context) expansion
- Pattern D (contradiction lookup)
- Deduplication of visited entities
- Relation type filtering
- Empty graph handling
- Circular reference handling

### Task 15: Unit tests for promotion module

**Files:**
- Create: `tests/unit/promotion-engine.test.ts`

Tests:
- Submit candidate creates claim + candidate records
- Review accepted + create → truth record created + provenance recorded
- Review accepted + supersede → old record superseded
- Review rejected → no truth changes
- Side effects are transactional (rollback on failure)
- Contradiction detection on conflicting preferences
- Page marked stale after accepted promotion

### Task 16: Unit tests for knowledge-pages module

**Files:**
- Create: `tests/unit/knowledge-pages.test.ts`

Tests:
- Synthesize project_page from seeded store
- Synthesize entity_page with graph expansion
- Synthesize decision_page with evidence links
- Page refresh updates status and content
- markPagesStale marks correct pages
- Empty store produces valid but minimal pages

### Task 17: Integration tests for full flows

**Files:**
- Create: `tests/integration/full-flow.test.ts`

Tests:
- Flow 1 (Session Start): seed → import → codex → verify context pack has graph expansion
- Flow 4 (Promotion): promote → review accepted → verify truth mutated + page refreshed
- Flow 5 (Contradiction): create conflicting preferences → verify contradiction surfaced in review-queue

---

## Execution Strategy

This plan has 5 independent chunks that can be parallelized:

| Chunk | Module | Team / Agent | Dependency |
|-------|--------|-------------|------------|
| 1 | ontology-support | Worker A | None |
| 2 | promotion | Worker B | None |
| 3 | knowledge-pages | Worker C | None (uses ontology-support interface only) |
| 4 | integration | Worker D | Chunks 1-3 must be merged first |
| 5 | tests | Worker E | Chunks 1-3 for unit, Chunk 4 for integration |

Chunks 1-3 can run in parallel. Chunk 4 depends on 1-3. Chunk 5 depends on 1-4.

### Key Constraints
- Zero npm dependencies — all new code must use only Node built-ins
- TypeScript strict mode — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- All DB access through `SqliteTruthKernelStorage` — no new DB connections
- Existing CLI/API contract must not break (docs/15 compatibility guardrails)
- Each module must have barrel `index.ts` exports
