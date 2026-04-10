import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs';
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

interface MempalaceFileRecord {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sourceKind: string;
  readonly title: string;
  readonly content: string;
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
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
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

function sourceKindFrom(relativePath: string): string {
  return relativePath.split('/')[0] ?? 'note';
}

function confidenceFromMatches(matches: number, tokenCount: number): number {
  if (tokenCount === 0) {
    return 0;
  }
  return Math.min(1, matches / tokenCount);
}

function scoreItem(item: EvidenceItem, tokens: readonly string[]): number {
  const haystack = `${item.title}\n${item.excerpt}\n${item.source_ref}`.toLowerCase();
  let score = 0;
  let matches = 0;

  for (const token of tokens) {
    if (!haystack.includes(token)) {
      continue;
    }

    matches += 1;
    if (item.title.toLowerCase().includes(token)) {
      score += 3;
    } else if (item.source_ref.toLowerCase().includes(token)) {
      score += 2;
    } else {
      score += 1;
    }
  }

  if (score === 0 && tokens.length > 0) {
    return 0;
  }

  return score + confidenceFromMatches(matches, tokens.length);
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

function buildMetadata(file: MempalaceFileRecord, chunkIndex: number | null, wordCount: number | null): JsonObject {
  return {
    source_system: 'mempalace',
    source_kind: file.sourceKind,
    file_path: file.absolutePath,
    relative_path: file.relativePath,
    ...(chunkIndex === null ? {} : { chunk_index: chunkIndex }),
    ...(wordCount === null ? {} : { word_count: wordCount }),
  };
}

function buildChunkItem(file: MempalaceFileRecord, chunkIndex: number, chunk: { text: string; wordCount: number }): EvidenceItem {
  const confidence = chunk.wordCount > 0 ? Math.min(1, chunk.wordCount / 300) : null;
  return {
    evidence_id: makeEvidenceId(file.relativePath, chunkIndex),
    source_ref: file.absolutePath,
    title: file.title,
    excerpt: excerptFromChunk(chunk.text),
    observed_at: null,
    confidence,
    metadata: buildMetadata(file, chunkIndex, chunk.wordCount),
  };
}

function buildFileItem(file: MempalaceFileRecord, evidenceId: string): EvidenceItem {
  return {
    evidence_id: evidenceId,
    source_ref: file.absolutePath,
    title: file.title,
    excerpt: file.content,
    observed_at: null,
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

function readFileRecord(basePath: string, absolutePath: string): MempalaceFileRecord | null {
  try {
    const content = readFileSync(absolutePath, 'utf8');
    const relativePath = relativePathFrom(basePath, absolutePath);
    return {
      absolutePath,
      relativePath,
      sourceKind: sourceKindFrom(relativePath),
      title: titleFromContent(relativePath, content),
      content,
    };
  } catch {
    return null;
  }
}

export class MemPalaceArchiveProvider implements ArchiveProvider {
  readonly basePath: string;

  constructor(basePath = DEFAULT_MEMPALACE_BASE_PATH) {
    this.basePath = basePath;
  }

  async search(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): Promise<EvidenceBundle> {
    const normalizedQuery = normalizeQuery(query.query);
    if (normalizedQuery.length === 0) {
      return {
        bundle_id: makeBundleId(),
        query: normalizedQuery,
        items: [],
        generated_at: nowIso(),
      };
    }

    const tokens = tokenize(normalizedQuery);
    const ranked: RankedEvidenceItem[] = [];

    for (const absolutePath of collectMarkdownFiles(this.basePath)) {
      const file = readFileRecord(this.basePath, absolutePath);
      if (!file) {
        continue;
      }

      for (const chunk of chunkText(file.content)) {
        const item = buildChunkItem(file, chunk.index, chunk);
        if (!passesFilters(item, filters)) {
          continue;
        }

        const score = scoreItem(item, tokens);
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

  async getItem(evidenceId: string): Promise<EvidenceItem | null> {
    const relativePath = evidenceIdToRelativePath(evidenceId);
    const absolutePath = join(this.basePath, relativePath);
    const file = readFileRecord(this.basePath, absolutePath);
    return file ? buildFileItem(file, evidenceId) : null;
  }

  async health(): Promise<ArchiveHealth> {
    if (!existsSync(this.basePath)) {
      return {
        ok: false,
        message: `mempalace directory missing: ${this.basePath}`,
      };
    }

    const fileCount = collectMarkdownFiles(this.basePath).length;
    return {
      ok: true,
      message: `mempalace provider ready at ${this.basePath} with ${fileCount} markdown file(s)`,
    };
  }
}
