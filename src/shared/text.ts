export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() || 'empty';
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((token) => token.trim())
    .filter((token) => token.length > 0)
    ?? [];
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

const wordBoundaryCache = new Map<string, RegExp>();

export function matchesWordBoundary(haystack: string, token: string): boolean {
  let re = wordBoundaryCache.get(token);
  if (!re) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, 'i');
    wordBoundaryCache.set(token, re);
  }
  return re.test(haystack);
}

export function bulletSection(title: string, items: readonly string[]): string[] {
  return [
    `## ${title}`,
    ...(items.length > 0 ? items : ['- none']),
    '',
  ];
}
