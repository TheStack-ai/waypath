import { createTruthKernelStorage, ensureTruthKernelSeedData, type SqliteTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel/index.js';
import { traverseFromEntity, expandGraphContext, executePattern } from '../../src/ontology-support/index.js';
import type { TruthEntityRecord, TruthRelationshipRecord } from '../../src/jarvis_fusion/contracts.js';

function nowIso(): string {
  return new Date().toISOString();
}

function makeEntity(id: string, type: TruthEntityRecord['entity_type'], name: string, summary: string, status: TruthEntityRecord['status'] = 'active'): TruthEntityRecord {
  const ts = nowIso();
  return { entity_id: id, entity_type: type, name, summary, state_json: '{}', status, canonical_page_id: null, created_at: ts, updated_at: ts };
}

function makeRelationship(id: string, from: string, type: string, to: string, weight: number | null = 1): TruthRelationshipRecord {
  const ts = nowIso();
  return { relationship_id: id, from_entity_id: from, relation_type: type, to_entity_id: to, weight, status: 'active', provenance_id: null, created_at: ts, updated_at: ts };
}

function seedGraphStore(): SqliteTruthKernelStorage {
  const store = createTruthKernelStorage(':memory:');

  // Build a graph:
  // project:alpha -> (has_active_task) -> task:build-ui
  // project:alpha -> (uses) -> tool:react
  // project:alpha -> (owned_by) -> person:dd
  // person:dd -> (decided_by) -> decision:use-react (scoped to project:alpha)
  // tool:react -> (relates_to) -> concept:frontend
  // concept:frontend -> (supports) -> tool:tailwind

  store.upsertEntity(makeEntity('project:alpha', 'project', 'Alpha', 'Main project'));
  store.upsertEntity(makeEntity('task:build-ui', 'task', 'Build UI', 'UI construction task'));
  store.upsertEntity(makeEntity('tool:react', 'tool', 'React', 'Frontend framework'));
  store.upsertEntity(makeEntity('person:dd', 'person', 'DD', 'Lead developer'));
  store.upsertEntity(makeEntity('concept:frontend', 'concept', 'Frontend', 'Frontend development'));
  store.upsertEntity(makeEntity('tool:tailwind', 'tool', 'Tailwind', 'CSS framework'));

  store.upsertRelationship(makeRelationship('r1', 'project:alpha', 'has_active_task', 'task:build-ui'));
  store.upsertRelationship(makeRelationship('r2', 'project:alpha', 'uses', 'tool:react'));
  store.upsertRelationship(makeRelationship('r3', 'project:alpha', 'owned_by', 'person:dd'));
  store.upsertRelationship(makeRelationship('r4', 'tool:react', 'relates_to', 'concept:frontend'));
  store.upsertRelationship(makeRelationship('r5', 'concept:frontend', 'supports', 'tool:tailwind'));

  store.upsertDecision({
    decision_id: 'decision:use-react',
    title: 'Use React for frontend',
    statement: 'React chosen for frontend framework.',
    status: 'active',
    scope_entity_id: 'project:alpha',
    effective_at: nowIso(),
    superseded_by: null,
    provenance_id: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  return store;
}

export function testTraversalDepth1(): void {
  const store = seedGraphStore();
  try {
    const path = traverseFromEntity(store, 'project:alpha', { maxDepth: 1 });

    if (path.seed_entity_id !== 'project:alpha') {
      throw new Error(`Expected seed_entity_id 'project:alpha', got '${path.seed_entity_id}'`);
    }

    // At depth 1, should find: task:build-ui, tool:react, person:dd
    if (path.steps.length !== 3) {
      throw new Error(`Expected 3 steps at depth 1, got ${path.steps.length}: ${path.steps.map((s) => s.entity_id).join(', ')}`);
    }

    const foundIds = new Set(path.steps.map((s) => s.entity_id));
    for (const expected of ['task:build-ui', 'tool:react', 'person:dd']) {
      if (!foundIds.has(expected)) {
        throw new Error(`Expected to find '${expected}' at depth 1`);
      }
    }

    // All steps should be depth 1
    for (const step of path.steps) {
      if (step.depth !== 1) {
        throw new Error(`Expected depth 1, got ${step.depth} for ${step.entity_id}`);
      }
    }
  } finally {
    store.close();
  }
}

export function testTraversalDepth2(): void {
  const store = seedGraphStore();
  try {
    const path = traverseFromEntity(store, 'project:alpha', { maxDepth: 2 });

    // At depth 2, should also find: concept:frontend (via tool:react)
    const foundIds = new Set(path.steps.map((s) => s.entity_id));
    if (!foundIds.has('concept:frontend')) {
      throw new Error(`Expected to find 'concept:frontend' at depth 2. Found: ${[...foundIds].join(', ')}`);
    }

    // concept:frontend should be at depth 2
    const frontendStep = path.steps.find((s) => s.entity_id === 'concept:frontend');
    if (!frontendStep || frontendStep.depth !== 2) {
      throw new Error(`Expected concept:frontend at depth 2, got ${frontendStep?.depth}`);
    }
  } finally {
    store.close();
  }
}

export function testTraversalDepth3(): void {
  const store = seedGraphStore();
  try {
    const path = traverseFromEntity(store, 'project:alpha', { maxDepth: 3 });

    // At depth 3, should also find: tool:tailwind (via concept:frontend)
    const foundIds = new Set(path.steps.map((s) => s.entity_id));
    if (!foundIds.has('tool:tailwind')) {
      throw new Error(`Expected to find 'tool:tailwind' at depth 3. Found: ${[...foundIds].join(', ')}`);
    }

    // tool:tailwind should be at depth 3
    const tailwindStep = path.steps.find((s) => s.entity_id === 'tool:tailwind');
    if (!tailwindStep || tailwindStep.depth !== 3) {
      throw new Error(`Expected tool:tailwind at depth 3, got ${tailwindStep?.depth}`);
    }

    // Should find all 5 connected entities
    if (path.steps.length !== 5) {
      throw new Error(`Expected 5 steps at depth 3, got ${path.steps.length}`);
    }
  } finally {
    store.close();
  }
}

export function testTraversalDeduplication(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    // Create a diamond graph: A -> B, A -> C, B -> D, C -> D
    store.upsertEntity(makeEntity('a', 'project', 'A', 'Node A'));
    store.upsertEntity(makeEntity('b', 'tool', 'B', 'Node B'));
    store.upsertEntity(makeEntity('c', 'tool', 'C', 'Node C'));
    store.upsertEntity(makeEntity('d', 'concept', 'D', 'Node D'));

    store.upsertRelationship(makeRelationship('r1', 'a', 'uses', 'b'));
    store.upsertRelationship(makeRelationship('r2', 'a', 'uses', 'c'));
    store.upsertRelationship(makeRelationship('r3', 'b', 'relates_to', 'd'));
    store.upsertRelationship(makeRelationship('r4', 'c', 'relates_to', 'd'));

    const path = traverseFromEntity(store, 'a', { maxDepth: 3 });

    // D should appear only once
    const dSteps = path.steps.filter((s) => s.entity_id === 'd');
    if (dSteps.length !== 1) {
      throw new Error(`Expected D to appear once (dedup), got ${dSteps.length}`);
    }
  } finally {
    store.close();
  }
}

export function testTraversalCircularReference(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    // Create circular graph: A -> B -> C -> A
    store.upsertEntity(makeEntity('a', 'project', 'A', 'Node A'));
    store.upsertEntity(makeEntity('b', 'tool', 'B', 'Node B'));
    store.upsertEntity(makeEntity('c', 'concept', 'C', 'Node C'));

    store.upsertRelationship(makeRelationship('r1', 'a', 'uses', 'b'));
    store.upsertRelationship(makeRelationship('r2', 'b', 'relates_to', 'c'));
    store.upsertRelationship(makeRelationship('r3', 'c', 'supports', 'a'));

    const path = traverseFromEntity(store, 'a', { maxDepth: 5 });

    // Should NOT infinite loop; seed entity 'a' is visited, so cycle terminates
    if (path.steps.length !== 2) {
      throw new Error(`Expected 2 steps in circular graph, got ${path.steps.length}`);
    }
  } finally {
    store.close();
  }
}

export function testTraversalEmptyGraph(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    store.upsertEntity(makeEntity('lonely', 'project', 'Lonely', 'No connections'));

    const path = traverseFromEntity(store, 'lonely', { maxDepth: 3 });
    if (path.steps.length !== 0) {
      throw new Error(`Expected 0 steps for isolated entity, got ${path.steps.length}`);
    }
    if (path.seed_entity_id !== 'lonely') {
      throw new Error(`Expected seed 'lonely', got '${path.seed_entity_id}'`);
    }
  } finally {
    store.close();
  }
}

export function testTraversalRelationFilter(): void {
  const store = seedGraphStore();
  try {
    const path = traverseFromEntity(store, 'project:alpha', {
      maxDepth: 3,
      relationFilter: ['has_active_task'],
    });

    // Only 'has_active_task' edges should be followed
    if (path.steps.length !== 1) {
      throw new Error(`Expected 1 step with relation filter, got ${path.steps.length}`);
    }
    if (path.steps[0]?.entity_id !== 'task:build-ui') {
      throw new Error(`Expected task:build-ui, got ${path.steps[0]?.entity_id}`);
    }
  } finally {
    store.close();
  }
}

export function testExpandGraphContext(): void {
  const store = seedGraphStore();
  try {
    const result = expandGraphContext(store, ['project:alpha'], { maxDepth: 2 });

    if (result.seed_entities.length !== 1) {
      throw new Error(`Expected 1 seed entity, got ${result.seed_entities.length}`);
    }

    // Should have expanded entities including seed + connected
    if (result.expanded_entities.length < 4) {
      throw new Error(`Expected at least 4 expanded entities, got ${result.expanded_entities.length}`);
    }

    // Should have relationships between expanded entities
    if (result.expanded_relationships.length < 3) {
      throw new Error(`Expected at least 3 relationships, got ${result.expanded_relationships.length}`);
    }

    // Should have found the scoped decision
    if (result.related_decisions.length < 1) {
      throw new Error(`Expected at least 1 related decision, got ${result.related_decisions.length}`);
    }

    if (result.traversal_paths.length !== 1) {
      throw new Error(`Expected 1 traversal path, got ${result.traversal_paths.length}`);
    }
  } finally {
    store.close();
  }
}

export function testExpandGraphContextMultipleSeeds(): void {
  const store = seedGraphStore();
  try {
    const result = expandGraphContext(store, ['project:alpha', 'person:dd'], { maxDepth: 1 });

    if (result.seed_entities.length !== 2) {
      throw new Error(`Expected 2 seed entities, got ${result.seed_entities.length}`);
    }

    if (result.traversal_paths.length !== 2) {
      throw new Error(`Expected 2 traversal paths, got ${result.traversal_paths.length}`);
    }
  } finally {
    store.close();
  }
}

export function testExpandGraphContextEmpty(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    const result = expandGraphContext(store, [], { maxDepth: 3 });

    if (result.seed_entities.length !== 0) throw new Error('Expected 0 seeds');
    if (result.expanded_entities.length !== 0) throw new Error('Expected 0 entities');
    if (result.traversal_paths.length !== 0) throw new Error('Expected 0 paths');
  } finally {
    store.close();
  }
}

export function testPatternProjectContext(): void {
  const store = seedGraphStore();
  try {
    const result = executePattern(store, {
      pattern: 'project_context',
      seed_entity_id: 'project:alpha',
    });

    // Project context should expand broadly
    if (result.expanded_entities.length < 4) {
      throw new Error(`Expected at least 4 entities for project_context, got ${result.expanded_entities.length}`);
    }

    // Should include the project decision
    if (result.related_decisions.length < 1) {
      throw new Error(`Expected at least 1 decision for project_context, got ${result.related_decisions.length}`);
    }
  } finally {
    store.close();
  }
}

export function testPatternContradictionLookup(): void {
  const store = seedGraphStore();
  try {
    // Add an entity with supersedes relation for contradiction pattern
    store.upsertEntity(makeEntity('claim:old', 'concept', 'Old Claim', 'Superseded claim'));
    store.upsertEntity(makeEntity('claim:new', 'concept', 'New Claim', 'Current claim'));
    store.upsertRelationship(makeRelationship('r-super', 'claim:new', 'supersedes', 'claim:old'));

    const result = executePattern(store, {
      pattern: 'contradiction_lookup',
      seed_entity_id: 'claim:new',
    });

    const foundIds = new Set(result.expanded_entities.map((e) => e.entity_id));
    if (!foundIds.has('claim:old')) {
      throw new Error(`Expected contradiction_lookup to find superseded entity. Found: ${[...foundIds].join(', ')}`);
    }
  } finally {
    store.close();
  }
}

export function testPatternPersonContext(): void {
  const store = seedGraphStore();
  try {
    const result = executePattern(store, {
      pattern: 'person_context',
      seed_entity_id: 'person:dd',
    });

    // Person context should expand to connected entities
    if (result.expanded_entities.length < 2) {
      throw new Error(`Expected at least 2 entities for person_context, got ${result.expanded_entities.length}`);
    }

    // Should find project:alpha via owned_by (incoming)
    const foundIds = new Set(result.expanded_entities.map((e) => e.entity_id));
    if (!foundIds.has('project:alpha')) {
      throw new Error(`Expected person_context to reach project:alpha. Found: ${[...foundIds].join(', ')}`);
    }
  } finally {
    store.close();
  }
}

export function testPatternSystemReasoning(): void {
  const store = seedGraphStore();
  try {
    const result = executePattern(store, {
      pattern: 'system_reasoning',
      seed_entity_id: 'concept:frontend',
    });

    // System reasoning from concept:frontend should find tool:tailwind (supports) and tool:react (relates_to incoming)
    if (result.expanded_entities.length < 2) {
      throw new Error(`Expected at least 2 entities for system_reasoning, got ${result.expanded_entities.length}`);
    }

    const foundIds = new Set(result.expanded_entities.map((e) => e.entity_id));
    if (!foundIds.has('tool:tailwind')) {
      throw new Error(`Expected system_reasoning to reach tool:tailwind. Found: ${[...foundIds].join(', ')}`);
    }
  } finally {
    store.close();
  }
}

export function testContradictionLookupFiltersSuperseded(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    // claim:new -> supersedes -> claim:active (active) and claim:dead (superseded)
    store.upsertEntity(makeEntity('claim:new', 'concept', 'New Claim', 'Current'));
    store.upsertEntity(makeEntity('claim:active', 'concept', 'Active Target', 'Active target'));
    store.upsertEntity(makeEntity('claim:dead', 'concept', 'Dead Target', 'Superseded target', 'superseded'));

    store.upsertRelationship(makeRelationship('r1', 'claim:new', 'supersedes', 'claim:active'));
    store.upsertRelationship(makeRelationship('r2', 'claim:new', 'supersedes', 'claim:dead'));

    const result = executePattern(store, {
      pattern: 'contradiction_lookup',
      seed_entity_id: 'claim:new',
    });

    const foundIds = new Set(result.expanded_entities.map((e) => e.entity_id));
    if (!foundIds.has('claim:active')) {
      throw new Error('Expected contradiction_lookup to include active entity');
    }
    if (foundIds.has('claim:dead')) {
      throw new Error('Expected contradiction_lookup to exclude superseded entity (statusFilter: active)');
    }
  } finally {
    store.close();
  }
}

export function testMaxResultsLimit(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    // Create a wide graph: hub -> spoke1, hub -> spoke2, ... hub -> spoke20
    store.upsertEntity(makeEntity('hub', 'project', 'Hub', 'Hub entity'));
    for (let i = 1; i <= 20; i++) {
      store.upsertEntity(makeEntity(`spoke:${i}`, 'tool', `Spoke ${i}`, `Spoke entity ${i}`));
      store.upsertRelationship(makeRelationship(`r${i}`, 'hub', 'uses', `spoke:${i}`));
    }

    const path = traverseFromEntity(store, 'hub', { maxDepth: 1, maxResults: 5 });
    if (path.steps.length !== 5) {
      throw new Error(`Expected maxResults=5 to limit to 5 steps, got ${path.steps.length}`);
    }
  } finally {
    store.close();
  }
}
