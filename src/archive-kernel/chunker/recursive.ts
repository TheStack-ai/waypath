/**
 * Recursive Delimiter-Aware Text Chunker
 * Adapted from gbrain's production chunker pattern.
 *
 * 5-level delimiter hierarchy:
 *   1. Paragraphs (\n\n)
 *   2. Lines (\n)
 *   3. Sentences (. ! ? followed by space or newline)
 *   4. Clauses (; : , )
 *   5. Words (whitespace)
 *
 * Default config: 300-word chunks with 50-word sentence-aware trailing overlap.
 * Lossless invariant: non-overlapping portions reassemble to original text.
 */

const DELIMITERS: readonly (readonly string[])[] = [
  ['\n\n'],                                        // L0: paragraphs
  ['\n'],                                          // L1: lines
  ['. ', '! ', '? ', '.\n', '!\n', '?\n'],        // L2: sentences
  ['; ', ': ', ', '],                              // L3: clauses
  [],                                              // L4: words (whitespace split)
];

export interface ChunkOptions {
  /** Target words per chunk (default 300) */
  readonly chunkSize?: number;
  /** Overlap words between consecutive chunks (default 50) */
  readonly chunkOverlap?: number;
}

export interface TextChunk {
  readonly text: string;
  readonly index: number;
  readonly wordCount: number;
}

function countWords(text: string): number {
  return (text.match(/\S+/g) || []).length;
}

/**
 * Chunk text into ~chunkSize-word segments with overlap.
 * Returns empty array for empty/whitespace-only input.
 * Returns single chunk if input fits within chunkSize.
 */
export function chunkText(text: string, opts?: ChunkOptions): TextChunk[] {
  const chunkSize = opts?.chunkSize ?? 300;
  const chunkOverlap = opts?.chunkOverlap ?? 50;

  if (!text || text.trim().length === 0) return [];

  const wordCount = countWords(text);
  if (wordCount <= chunkSize) {
    return [{ text: text.trim(), index: 0, wordCount }];
  }

  const pieces = recursiveSplit(text, 0, chunkSize);
  const merged = greedyMerge(pieces, chunkSize);
  const withOverlap = applyOverlap(merged, chunkOverlap);

  return withOverlap.map((t, i) => ({
    text: t.trim(),
    index: i,
    wordCount: countWords(t),
  }));
}

function recursiveSplit(text: string, level: number, target: number): string[] {
  if (level >= DELIMITERS.length) {
    return splitOnWhitespace(text, target);
  }

  const delimiters = DELIMITERS[level];
  if (!delimiters || delimiters.length === 0) {
    return splitOnWhitespace(text, target);
  }

  const pieces = splitAtDelimiters(text, delimiters);

  if (pieces.length <= 1) {
    return recursiveSplit(text, level + 1, target);
  }

  const result: string[] = [];
  for (const piece of pieces) {
    if (countWords(piece) > target) {
      result.push(...recursiveSplit(piece, level + 1, target));
    } else {
      result.push(piece);
    }
  }

  return result;
}

/**
 * Split text at delimiter boundaries, preserving delimiters at the end
 * of the piece that precedes them (lossless).
 */
function splitAtDelimiters(text: string, delimiters: readonly string[]): string[] {
  const pieces: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliest = -1;
    let earliestDelim = '';

    for (const delim of delimiters) {
      const idx = remaining.indexOf(delim);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        earliestDelim = delim;
      }
    }

    if (earliest === -1) {
      if (remaining.trim().length > 0) {
        pieces.push(remaining);
      }
      break;
    }

    const piece = remaining.slice(0, earliest + earliestDelim.length);
    if (piece.trim().length > 0) {
      pieces.push(piece);
    }
    remaining = remaining.slice(earliest + earliestDelim.length);
  }

  return pieces.filter((p) => p.trim().length > 0);
}

function splitOnWhitespace(text: string, target: number): string[] {
  const words = text.match(/\S+\s*/g) || [];
  if (words.length === 0) return [];

  const pieces: string[] = [];
  for (let i = 0; i < words.length; i += target) {
    const slice = words.slice(i, i + target).join('');
    if (slice.trim().length > 0) {
      pieces.push(slice);
    }
  }
  return pieces;
}

/**
 * Greedily merge adjacent pieces until each chunk is near the target size.
 * Avoids creating chunks larger than target * 1.5.
 */
function greedyMerge(pieces: string[], target: number): string[] {
  if (pieces.length === 0) return [];

  const result: string[] = [];
  let current = pieces[0] ?? '';

  for (let i = 1; i < pieces.length; i++) {
    const combined = current + (pieces[i] ?? '');
    if (countWords(combined) <= Math.ceil(target * 1.5)) {
      current = combined;
    } else {
      result.push(current);
      current = pieces[i] ?? '';
    }
  }

  if (current.trim().length > 0) {
    result.push(current);
  }

  return result;
}

/**
 * Apply sentence-aware trailing overlap.
 * The last N words of chunk[i] are prepended to chunk[i+1].
 */
function applyOverlap(chunks: string[], overlapWords: number): string[] {
  if (chunks.length <= 1 || overlapWords <= 0) return chunks;

  const result: string[] = [chunks[0] ?? ''];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1] ?? '';
    const prevTrailing = extractTrailingContext(prevChunk, overlapWords);
    result.push(prevTrailing + (chunks[i] ?? ''));
  }

  return result;
}

/**
 * Extract the last N words from text, trying to align to sentence boundaries.
 */
function extractTrailingContext(text: string, targetWords: number): string {
  const words = text.match(/\S+\s*/g) || [];
  if (words.length <= targetWords) return '';

  const trailing = words.slice(-targetWords).join('');

  const sentenceStart = trailing.search(/[.!?]\s+/);
  if (sentenceStart !== -1 && sentenceStart < trailing.length / 2) {
    const afterSentence = trailing.slice(sentenceStart).replace(/^[.!?]\s+/, '');
    if (afterSentence.trim().length > 0) {
      return afterSentence;
    }
  }

  return trailing;
}
