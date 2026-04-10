/**
 * Content hash for import idempotency.
 * Deterministic hash over all fields — skip re-import if hash matches.
 * Uses a simple FNV-1a hash (no node:crypto dependency needed).
 */

export interface HashableRecord {
  readonly [key: string]: unknown;
}

/**
 * FNV-1a 32-bit hash — fast, deterministic, good distribution.
 * Not cryptographic, but sufficient for content-change detection.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Compute a deterministic content hash for any record.
 * Keys are sorted to ensure determinism regardless of insertion order.
 */
export function contentHash(record: HashableRecord): string {
  const serialized = JSON.stringify(record, Object.keys(record).sort());
  // Double-hash for better collision resistance on long inputs
  const h1 = fnv1a(serialized);
  const h2 = fnv1a(serialized.split('').reverse().join(''));
  return `${h1}${h2}`;
}

/**
 * Check if a record has changed since last import.
 * Returns true if the record should be (re-)imported.
 */
export function hasChanged(
  newHash: string,
  existingHash: string | null | undefined,
): boolean {
  if (!existingHash) return true;
  return newHash !== existingHash;
}
