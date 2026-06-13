const CATEGORY_DIRECTIVE_RE = /^\{\s*(category|categories)\s*:\s*(.*?)\s*\}$/i;
const LEADING_METADATA_TAGS = new Set([
  'title',
  'key',
  'artist',
  'interpret',
  'interpreter',
  'category',
  'categories',
]);

export function normalizeCategoryName(category: string) {
  return category.trim().replace(/\s+/g, ' ');
}

export function parseCategoryList(value: string) {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const piece of value.split(/[,;]/)) {
    const category = normalizeCategoryName(piece);
    const key = category.toLowerCase();
    if (!category || seen.has(key)) continue;

    seen.add(key);
    categories.push(category);
  }

  return categories;
}

export function dedupeCategories(categories: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const category of categories) {
    const normalized = normalizeCategoryName(category);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

export function getSongCategoriesFromSource(source: string) {
  const categories: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(CATEGORY_DIRECTIVE_RE);
    if (!match) continue;
    categories.push(...parseCategoryList(match[2]));
  }

  return dedupeCategories(categories);
}

export function addSongCategoryToSource(source: string, category: string) {
  const normalized = normalizeCategoryName(category);
  if (!normalized) return source;

  const existingCategories = getSongCategoriesFromSource(source);
  if (existingCategories.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
    return source;
  }

  const lines = source.split(/\r?\n/);
  const insertAt = getCategoryInsertIndex(lines);
  lines.splice(insertAt, 0, `{category: ${normalized}}`);
  return lines.join('\n');
}

export function removeSongCategoryFromSource(source: string, category: string) {
  const categoryKey = normalizeCategoryName(category).toLowerCase();
  if (!categoryKey) return source;

  const lines = source.split(/\r?\n/);
  const nextLines = lines.flatMap((line) => {
    const match = line.match(CATEGORY_DIRECTIVE_RE);
    if (!match) return [line];

    const remaining = parseCategoryList(match[2]).filter(
      (existing) => existing.toLowerCase() !== categoryKey
    );

    if (remaining.length === 0) return [];
    if (remaining.length === 1) return [`{category: ${remaining[0]}}`];
    return [`{categories: ${remaining.join(', ')}}`];
  });

  return nextLines.join('\n');
}

function getCategoryInsertIndex(lines: string[]) {
  let lastLeadingMetaIndex = -1;
  let lastCategoryIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(/^\{\s*([^:]+)\s*:/);

    if (!match) {
      if (trimmed === '' && lastLeadingMetaIndex >= 0) break;
      if (trimmed === '') continue;
      break;
    }

    const tag = match[1].trim().toLowerCase();
    if (tag === 'section') break;
    if (!LEADING_METADATA_TAGS.has(tag)) break;

    lastLeadingMetaIndex = i;
    if (tag === 'category' || tag === 'categories') {
      lastCategoryIndex = i;
    }
  }

  if (lastCategoryIndex >= 0) return lastCategoryIndex + 1;
  if (lastLeadingMetaIndex >= 0) return lastLeadingMetaIndex + 1;
  return 0;
}
