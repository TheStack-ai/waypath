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

export function bulletSection(title: string, items: readonly string[]): string[] {
  return [
    `## ${title}`,
    ...(items.length > 0 ? items : ['- none']),
    '',
  ];
}
