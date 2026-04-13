import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  type Dirent,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { chunkText } from '../../archive-kernel/chunker/index.js';
import type {
  ArchiveHealth,
  ArchiveProvider,
  ArchiveSearchFilters,
  ArchiveSearchQuery,
  EvidenceBundle,
  EvidenceItem,
  JsonObject,
} from '../../jarvis_fusion/contracts.js';

const DEFAULT_LIMIT = 10;
const DEFAULT_MEMPALACE_BASE_PATH = join(homedir(), 'claude-telegram', 'memory');
const CHUNK_SUFFIX = '#chunk:';

type SourceKind = 'daily' | 'person' | 'project' | 'research' | 'knowledge';

interface IndexedChunk {
  readonly index: number;
  readonly text: string;
  readonly wordCount: number;
  readonly tokenSet: ReadonlySet<string>;
}

interface IndexedFileRecord {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sourceKind: SourceKind;
  readonly title: string;
  readonly content: string;
  readonly mtimeMs: number;
  readonly date: string | null;
  readonly entityName: string | null;
  readonly chunks: readonly IndexedChunk[];
}

interface RankedEvidenceItem {
  readonly item: EvidenceItem;
  readonly score: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeQuery(value: string): string {
  return value.trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((token) => token.trim())
    .filter((token) => token.length > 0)
    ?? [];
}

function metadataStringValue(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function passesFilters(item: EvidenceItem, filters: ArchiveSearchFilters | undefined): boolean {
  if (!filters) {
    return true;
  }

  const sourceSystem = metadataStringValue(item.metadata, 'source_system');
  const sourceKind = metadataStringValue(item.metadata, 'source_kind');

  if (filters.sourceSystems && (!sourceSystem || !filters.sourceSystems.includes(sourceSystem))) {
    return false;
  }

  if (filters.sourceKinds && (!sourceKind || !filters.sourceKinds.includes(sourceKind))) {
    return false;
  }

  if (filters.minConfidence !== undefined) {
    const confidence = item.confidence ?? 0;
    if (confidence < filters.minConfidence) {
      return false;
    }
  }

  return true;
}

function makeBundleId(): string {
  return `bundle:mempalace:${nowIso()}`;
}

function makeEvidenceId(relativePath: string, chunkIndex: number): string {
  return `mempalace:${relativePath}${CHUNK_SUFFIX}${chunkIndex}`;
}

function stripChunkSuffix(evidenceId: string): string {
  const chunkIndex = evidenceId.indexOf(CHUNK_SUFFIX);
  return chunkIndex >= 0 ? evidenceId.slice(0, chunkIndex) : evidenceId;
}

function evidenceIdToRelativePath(evidenceId: string): string {
  const normalizedId = stripChunkSuffix(evidenceId);
  return normalizedId.startsWith('mempalace:') ? normalizedId.slice('mempalace:'.length) : normalizedId;
}

function relativePathFrom(basePath: string, absolutePath: string): string {
  const prefix = `${basePath}/`;
  return absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : absolutePath;
}

function filenameFrom(path: string): string {
  return path.split('/').pop() ?? path;
}

function titleFromContent(relativePath: string, content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/^#+\s*/u, '') || filenameFrom(relativePath);
    }
  }

  return filenameFrom(relativePath).replace(/\.md$/iu, '');
}

function excerptFromChunk(text: string): string {
  return text.trim();
}

function classifySource(relativePath: string): {
  readonly sourceKind: SourceKind;
  readonly date: string | null;
  readonly entityName: string | null;
} {
  const [root = '', basename = ''] = relativePath.split('/');
  const stem = basename.replace(/\.md$/iu, '');

  if (root === 'daily') {
    return {
      sourceKind: 'daily',
      date: /^\d{4}-\d{2}-\d{2}$/u.test(stem) ? stem : null,
      entityName: null,
    };
  }
  if (root === 'people') {
    return {
      sourceKind: 'person',
      date: null,
      entityName: stem,
    };
  }
  if (root === 'projects') {
    return {
      sourceKind: 'project',
      date: null,
      entityName: stem,
    };
  }
  if (root === 'research') {
    return {
      sourceKind: 'research',
      date: null,
      entityName: null,
    };
  }
  return {
    sourceKind: 'knowledge',
    date: null,
    entityName: null,
  };
}

function chunkTokenSet(text: string): ReadonlySet<string> {
  return new Set(tokenize(text));
}

function jaccardSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function buildMetadata(
  file: IndexedFileRecord,
  chunkIndex: number | null,
  wordCount: number | null,
): JsonObject {
  return {
    source_system: 'mempalace',
    source_kind: file.sourceKind,
    file_path: file.absolutePath,
    relative_path: file.relativePath,
    ...(chunkIndex === null ? {} : { chunk_index: chunkIndex }),
    ...(wordCount === null ? {} : { word_count: wordCount }),
    ...(file.date ? { source_date: file.date } : {}),
    ...(file.entityName ? { entity_name: file.entityName } : {}),
  };
}

function buildChunkItem(file: IndexedFileRecord, chunk: IndexedChunk): EvidenceItem {
  const confidence = chunk.wordCount > 0 ? Math.min(1, chunk.wordCount / 300) : null;
  return {
    evidence_id: makeEvidenceId(file.relativePath, chunk.index),
    source_ref: file.absolutePath,
    title: file.title,
    excerpt: excerptFromChunk(chunk.text),
    observed_at: file.date,
    confidence,
    metadata: buildMetadata(file, chunk.index, chunk.wordCount),
  };
}

function buildFileItem(file: IndexedFileRecord, evidenceId: string): EvidenceItem {
  return {
    evidence_id: evidenceId,
    source_ref: file.absolutePath,
    title: file.title,
    excerpt: file.content,
    observed_at: file.date,
    confidence: 1,
    metadata: buildMetadata(file, null, null),
  };
}

function collectMarkdownFiles(basePath: string): string[] {
  if (!existsSync(basePath)) {
    return [];
  }

  const files: string[] = [];
  const pending: string[] = [basePath];

  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = readdirSync(current, { withFileTypes: true }) as Dirent[];
    for (const entry of entries) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function readFileRecord(basePath: string, absolutePath: string): IndexedFileRecord | null {
  try {
    const content = readFileSync(absolutePath, 'utf8');
    const relativePath = relativePathFrom(basePath, absolutePath);
    const classification = classifySource(relativePath);
    const stats = statSync(absolutePath);
    return {
      absolutePath,
      relativePath,
      sourceKind: classification.sourceKind,
      title: titleFromContent(relativePath, content),
      content,
      mtimeMs: stats.mtimeMs,
      date: classification.date,
      entityName: classification.entityName,
      chunks: chunkText(content).map((chunk) => ({
        index: chunk.index,
        text: chunk.text,
        wordCount: chunk.wordCount,
        tokenSet: chunkTokenSet(chunk.text),
      })),
    };
  } catch {
    return null;
  }
}

function scoreChunk(
  file: IndexedFileRecord,
  chunk: IndexedChunk,
  queryTokens: readonly string[],
  queryTokenSet: ReadonlySet<string>,
): number {
  const haystack = `${file.title}\n${chunk.text}\n${file.relativePath}`.toLowerCase();
  let keywordScore = 0;
  let titleBonus = 0;

  for (const token of queryTokens) {
    if (!haystack.includes(token)) {
      continue;
    }

    keywordScore += 1;
    if (file.title.toLowerCase().includes(token)) {
      titleBonus += 1.5;
    }
  }

  if (queryTokens.length > 0 && keywordScore === 0) {
    return 0;
  }

  const jaccard = jaccardSimilarity(queryTokenSet, chunk.tokenSet);
  return keywordScore * 2 + titleBonus + jaccard * 4;
}

function sortRankedItems(items: readonly RankedEvidenceItem[]): EvidenceItem[] {
  return [...items]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const observedDelta = (right.item.observed_at ?? '').localeCompare(left.item.observed_at ?? '');
      if (observedDelta !== 0) {
        return observedDelta;
      }

      return left.item.source_ref.localeCompare(right.item.source_ref);
    })
    .map((entry) => entry.item);
}

export class MemPalaceArchiveProvider implements ArchiveProvider {
  readonly basePath: string;
  private readonly indexByPath = new Map<string, IndexedFileRecord>();
  private indexed = false;

  constructor(basePath = DEFAULT_MEMPALACE_BASE_PATH) {
    this.basePath = basePath;
  }

  private ensureIndex(): void {
    const files = collectMarkdownFiles(this.basePath);
    const seen = new Set(files);

    for (const existingPath of [...this.indexByPath.keys()]) {
      if (!seen.has(existingPath)) {
        this.indexByPath.delete(existingPath);
      }
    }

    for (const absolutePath of files) {
      let mtimeMs: number;
      try {
        mtimeMs = statSync(absolutePath).mtimeMs;
      } catch {
        this.indexByPath.delete(absolutePath);
        continue;
      }

      const existing = this.indexByPath.get(absolutePath);
      if (this.indexed && existing && existing.mtimeMs === mtimeMs) {
        continue;
      }

      const record = readFileRecord(this.basePath, absolutePath);
      if (record) {
        this.indexByPath.set(absolutePath, record);
      }
    }

    this.indexed = true;
  }

  searchSync(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): EvidenceBundle {
    const normalizedQuery = normalizeQuery(query.query);
    if (normalizedQuery.length === 0) {
      return {
        bundle_id: makeBundleId(),
        query: normalizedQuery,
        items: [],
        generated_at: nowIso(),
      };
    }

    this.ensureIndex();
    const queryTokens = tokenize(normalizedQuery);
    const queryTokenSet = new Set(queryTokens);
    const ranked: RankedEvidenceItem[] = [];

    for (const file of this.indexByPath.values()) {
      for (const chunk of file.chunks) {
        const item = buildChunkItem(file, chunk);
        if (!passesFilters(item, filters)) {
          continue;
        }

        const score = scoreChunk(file, chunk, queryTokens, queryTokenSet);
        if (score > 0) {
          ranked.push({ item, score });
        }
      }
    }

    return {
      bundle_id: makeBundleId(),
      query: normalizedQuery,
      items: sortRankedItems(ranked).slice(0, query.limit ?? DEFAULT_LIMIT),
      generated_at: nowIso(),
    };
  }

  getItemSync(evidenceId: string): EvidenceItem | null {
    this.ensureIndex();
    const relativePath = evidenceIdToRelativePath(evidenceId);
    const file = [...this.indexByPath.values()].find((record) => record.relativePath === relativePath);
    return file ? buildFileItem(file, evidenceId) : null;
  }

  healthSync(): ArchiveHealth {
    if (!existsSync(this.basePath)) {
      return {
        ok: false,
        message: `mempalace directory missing: ${this.basePath}`,
      };
    }

    this.ensureIndex();
    return {
      ok: true,
      message: `mempalace provider ready at ${this.basePath} with ${this.indexByPath.size} markdown file(s)`,
    };
  }

  async search(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): Promise<EvidenceBundle> {
    return this.searchSync(query, filters);
  }

  async getItem(evidenceId: string): Promise<EvidenceItem | null> {
    return this.getItemSync(evidenceId);
  }

  async health(): Promise<ArchiveHealth> {
    return this.healthSync();
  }
}
