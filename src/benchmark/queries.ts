/**
 * Benchmark query definitions — representative queries against truth kernel.
 * Each query includes expected entity/decision IDs for precision/recall measurement.
 */

export interface BenchmarkQuery {
  readonly id: string;
  readonly category: 'project_decision' | 'person' | 'tool' | 'historical' | 'concept' | 'general';
  readonly query: string;
  readonly description: string;
  readonly expected_ids: readonly string[];
}

/**
 * 25 representative benchmark queries covering all major query patterns.
 * Expected IDs are based on seed data from ensureTruthKernelSeedData + common fixture data.
 */
export const BENCHMARK_QUERIES: readonly BenchmarkQuery[] = [
  // --- Project decision queries ---
  {
    id: 'q01',
    category: 'project_decision',
    query: '왜 SQLite를 선택했나',
    description: 'Why did we choose SQLite?',
    expected_ids: ['decision:waypath:shared-backend-host-shims'],
  },
  {
    id: 'q02',
    category: 'project_decision',
    query: 'shared backend host shims',
    description: 'Decision about shared backend architecture',
    expected_ids: ['decision:waypath:shared-backend-host-shims'],
  },
  {
    id: 'q03',
    category: 'project_decision',
    query: 'codex first rollout',
    description: 'Codex-first rollout preference',
    expected_ids: ['preference:waypath:rollout-order'],
  },
  {
    id: 'q04',
    category: 'project_decision',
    query: 'deployment strategy',
    description: 'Deployment strategy decisions',
    expected_ids: ['decision:waypath:shared-backend-host-shims'],
  },
  {
    id: 'q05',
    category: 'project_decision',
    query: 'source readers read-only',
    description: 'Source reader architecture decision',
    expected_ids: ['decision:waypath:source-readers-read-only'],
  },
  // --- Person queries ---
  {
    id: 'q06',
    category: 'person',
    query: 'DD 프로젝트',
    description: 'What projects is DD working on?',
    expected_ids: ['entity:person:dd'],
  },
  {
    id: 'q07',
    category: 'person',
    query: 'operator',
    description: 'Who is the operator?',
    expected_ids: ['entity:person:dd'],
  },
  // --- Tool queries ---
  {
    id: 'q08',
    category: 'tool',
    query: 'SQLite embedded persistence',
    description: 'SQLite tool usage',
    expected_ids: ['entity:tool:sqlite'],
  },
  {
    id: 'q09',
    category: 'tool',
    query: 'codex shim',
    description: 'Codex host shim tool',
    expected_ids: ['system:waypath:codex-shim'],
  },
  {
    id: 'q10',
    category: 'tool',
    query: 'truth kernel local-first',
    description: 'Truth kernel system',
    expected_ids: ['project:waypath'],
  },
  // --- Historical / temporal queries ---
  {
    id: 'q11',
    category: 'historical',
    query: 'session start context pack',
    description: 'Session-start context pack decisions',
    expected_ids: ['memory:waypath:session-start-pack'],
  },
  {
    id: 'q12',
    category: 'historical',
    query: 'waypath v1 architecture',
    description: 'Waypath v1 architectural decisions',
    expected_ids: ['decision:waypath:shared-backend-host-shims', 'project:waypath'],
  },
  {
    id: 'q13',
    category: 'historical',
    query: 'host rollout order',
    description: 'Host rollout ordering preference',
    expected_ids: ['preference:waypath:rollout-order'],
  },
  // --- Concept queries ---
  {
    id: 'q14',
    category: 'concept',
    query: 'promotion candidate review',
    description: 'Promotion review workflow',
    expected_ids: [],
  },
  {
    id: 'q15',
    category: 'concept',
    query: 'knowledge page synthesis',
    description: 'Knowledge page creation',
    expected_ids: [],
  },
  {
    id: 'q16',
    category: 'concept',
    query: 'evidence bundle',
    description: 'Evidence bundle concept',
    expected_ids: [],
  },
  // --- General queries ---
  {
    id: 'q17',
    category: 'general',
    query: 'waypath',
    description: 'Top-level project query',
    expected_ids: ['project:waypath'],
  },
  {
    id: 'q18',
    category: 'general',
    query: 'active task',
    description: 'Current active task',
    expected_ids: ['task:waypath:session-start'],
  },
  {
    id: 'q19',
    category: 'general',
    query: 'workspace preferences',
    description: 'Global preferences',
    expected_ids: ['preference:waypath:rollout-order'],
  },
  {
    id: 'q20',
    category: 'general',
    query: 'project workspace',
    description: 'Project workspace entity',
    expected_ids: ['project:waypath'],
  },
  {
    id: 'q21',
    category: 'general',
    query: '결정 목록',
    description: 'List all decisions (Korean)',
    expected_ids: ['decision:waypath:shared-backend-host-shims'],
  },
  {
    id: 'q22',
    category: 'project_decision',
    query: 'local-first persistence',
    description: 'Local-first persistence approach',
    expected_ids: ['project:waypath', 'decision:waypath:shared-backend-host-shims'],
  },
  {
    id: 'q23',
    category: 'tool',
    query: 'FTS5 full text search',
    description: 'FTS5 search capability',
    expected_ids: [],
  },
  {
    id: 'q24',
    category: 'general',
    query: 'has active task',
    description: 'Task relationship query',
    expected_ids: ['task:waypath:session-start'],
  },
  {
    id: 'q25',
    category: 'historical',
    query: 'promoted memories project',
    description: 'Promoted project memories',
    expected_ids: ['memory:waypath:session-start-pack'],
  },
] as const;
