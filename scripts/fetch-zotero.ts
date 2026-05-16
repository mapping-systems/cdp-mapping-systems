#!/usr/bin/env npx tsx
/**
 * Fetch a Zotero collection and write a structured JSON file the
 * /bibliography page consumes.
 *
 * Each item carries:
 *   - csl: CSL-JSON metadata (for client-side filtering / searching later)
 *   - bib: pre-rendered HTML citation in the configured style (eg. Chicago)
 *   - bibtex: the raw BibTeX entry (handy for download / LaTeX users)
 *
 * Configure via resources.config.ts. Auth is optional for public libraries;
 * private libraries need ZOTERO_KEY (read-only key from zotero.org/settings/keys).
 *
 * Usage:
 *   npm run build:zotero
 *   # or directly:
 *   ZOTERO_KEY=xxx tsx scripts/fetch-zotero.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ZOTERO } from '../resources.config.js';

const OUTPUT_PATH = 'src/data/zotero.json';
const PAGE_SIZE = 100;

interface ZoteroAPIItem {
  key: string;
  version: number;
  library: { type: string; id: number };
  data?: {
    itemType?: string;
    title?: string;
    tags?: { tag: string; type?: number }[];
    /** Keys of every collection this item belongs to (parent + sub). */
    collections?: string[];
    [k: string]: unknown;
  };
  csljson?: Record<string, unknown>;
  bib?: string; // pre-rendered HTML
  bibtex?: string;
}

interface ZoteroAPICollection {
  key: string;
  data: {
    name: string;
    parentCollection?: string | false;
  };
}

interface SubCollection {
  key: string;
  name: string;
  /** Position from Zotero's manual ordering, if available — used as a sort key. */
  position?: number;
}

interface BibliographyEntry {
  key: string;
  type: string;
  title: string;
  url?: string;
  doi?: string;
  date?: string;
  year?: number;
  /** Tags from Zotero (deduped + trimmed + sorted). */
  tags: string[];
  /** Keys of sub-collections this item is in. Excludes the parent collection
      itself so we can render "uncategorized" sections cleanly. */
  subcollections: string[];
  csl: unknown;
  /** Pre-rendered HTML citation in the configured style. */
  bib: string;
  /** Raw BibTeX entry for download/LaTeX. */
  bibtex: string;
}

interface BibliographyOutput {
  style: string;
  fetchedAt: string;
  collectionId: string;
  count: number;
  /** Direct child collections of the configured root collection. The
      bibliography page renders one section per sub-collection, plus an
      "Uncategorized" section for items in the root only. */
  subcollections: SubCollection[];
  entries: BibliographyEntry[];
}

async function fetchPage(start: number): Promise<{ items: ZoteroAPIItem[]; totalResults: number }> {
  const apiKey = process.env.ZOTERO_KEY;
  const { userId, libraryType, collectionId, style, sort, direction } = ZOTERO;

  // Ask Zotero to return CSL-JSON, BibTeX, AND a pre-rendered citation in
  // one round-trip. `data` is also included so we can read the tags array
  // (CSL JSON only carries tags when present in the `keyword` field, which
  // Zotero doesn't always populate).
  // itemType filter excludes attachments — they show up in the collection
  // as standalone items if they're imported PDFs without a parent record,
  // but they aren't citable on their own. (Combining multiple negations
  // with `||` is accepted by the API but evaluates as a tautology, so we
  // post-filter notes in normalize() instead.)
  const params = new URLSearchParams({
    format: 'json',
    include: 'csljson,bib,bibtex,data',
    itemType: '-attachment',
    style,
    sort,
    direction,
    limit: String(PAGE_SIZE),
    start: String(start),
  });

  const url = `https://api.zotero.org/${libraryType}/${userId}/collections/${collectionId}/items?${params}`;
  const headers: Record<string, string> = {
    'Zotero-API-Version': '3',
  };
  if (apiKey) headers['Zotero-API-Key'] = apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Zotero API error: ${res.status} ${res.statusText} (${url})`);
  }
  const totalResults = parseInt(res.headers.get('Total-Results') || '0', 10);
  const items: ZoteroAPIItem[] = await res.json();
  return { items, totalResults };
}

async function fetchAllItems(): Promise<ZoteroAPIItem[]> {
  const all: ZoteroAPIItem[] = [];
  let start = 0;
  while (true) {
    const { items, totalResults } = await fetchPage(start);
    all.push(...items);
    if (all.length >= totalResults || items.length === 0) break;
    start += PAGE_SIZE;
  }
  return all;
}

async function fetchSubcollections(): Promise<SubCollection[]> {
  const apiKey = process.env.ZOTERO_KEY;
  const { userId, libraryType, collectionId } = ZOTERO;
  const url = `https://api.zotero.org/${libraryType}/${userId}/collections/${collectionId}/collections?limit=100`;
  const headers: Record<string, string> = { 'Zotero-API-Version': '3' };
  if (apiKey) headers['Zotero-API-Key'] = apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Zotero API error fetching sub-collections: ${res.status} ${res.statusText}`);
  }
  const collections: ZoteroAPICollection[] = await res.json();
  // Direct children only — Zotero's collections endpoint returns the full
  // descendant tree, but we keep one level (parent matches our root) since
  // the user's mental model is one level of grouping.
  return collections
    .filter((c) => c.data.parentCollection === collectionId)
    .map((c) => ({ key: c.key, name: c.data.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalize(item: ZoteroAPIItem, subcollectionKeys: Set<string>): BibliographyEntry | null {
  // When the API request asks for `include=csljson,bib,bibtex`, the response
  // omits the standard `data` field — every metadata read here goes through
  // csljson, which uses CSL JSON capitalization (URL, DOI).
  const csl = item.csljson;
  if (!csl) return null;

  const type = String(csl.type ?? 'unknown');
  // Skip notes/attachments which Zotero includes but aren't citable on their own.
  if (type === 'note' || type === 'attachment') return null;
  // Defense in depth: skip entries that have neither an author nor a date —
  // these are usually orphaned PDFs/snapshots that escaped the API filter.
  const hasAuthor = Array.isArray(csl.author) && csl.author.length > 0;
  const hasDate = !!(csl.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]?.[0];
  if (!hasAuthor && !hasDate) return null;

  const title = String(csl.title ?? '(untitled)');
  const issued = csl.issued as { 'date-parts'?: number[][] } | undefined;
  const year = issued?.['date-parts']?.[0]?.[0];

  // Pull tags from Zotero `data.tags` (where users actually edit them in
  // the Zotero app). Trim + dedupe + sort for a stable rendering.
  const rawTags = item.data?.tags?.map((t) => t.tag).filter((s): s is string => typeof s === 'string') ?? [];
  const tags = Array.from(new Set(rawTags.map((t) => t.trim()).filter(Boolean))).sort();

  // Filter the item's collections to just the sub-collections we know about.
  // (`data.collections` includes the parent collection itself + any others
  // outside our scope; we want only the direct children of our root.)
  const itemCollections = item.data?.collections ?? [];
  const subcollections = itemCollections.filter((k) => subcollectionKeys.has(k)).sort();

  return {
    key: item.key,
    type,
    title,
    url: typeof csl.URL === 'string' ? csl.URL : undefined,
    doi: typeof csl.DOI === 'string' ? csl.DOI : undefined,
    date: year ? String(year) : undefined,
    year: typeof year === 'number' ? year : undefined,
    tags,
    subcollections,
    csl,
    bib: item.bib ?? '',
    bibtex: item.bibtex ?? '',
  };
}

async function main() {
  console.log('━━━ Zotero ━━━');

  if (!ZOTERO.userId || !ZOTERO.collectionId) {
    console.log('Zotero not configured (userId/collectionId empty). Edit resources.config.ts');
    return;
  }

  console.log(`  ${ZOTERO.libraryType}/${ZOTERO.userId} · collection ${ZOTERO.collectionId} · style ${ZOTERO.style}`);

  let items: ZoteroAPIItem[];
  let subcollections: SubCollection[];
  try {
    [items, subcollections] = await Promise.all([fetchAllItems(), fetchSubcollections()]);
  } catch (err) {
    console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const subcollectionKeys = new Set(subcollections.map((s) => s.key));
  const entries = items
    .map((it) => normalize(it, subcollectionKeys))
    .filter((e): e is BibliographyEntry => e !== null);

  const output: BibliographyOutput = {
    style: ZOTERO.style,
    fetchedAt: new Date().toISOString(),
    collectionId: ZOTERO.collectionId,
    count: entries.length,
    subcollections,
    entries,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(
    `  ✓ ${OUTPUT_PATH} (${entries.length} entries, ${subcollections.length} sub-collections, fetched ${items.length})`,
  );
}

main();
