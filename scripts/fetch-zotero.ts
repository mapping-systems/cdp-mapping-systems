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
  csljson?: Record<string, unknown>;
  bib?: string; // pre-rendered HTML
  bibtex?: string;
}

interface BibliographyEntry {
  key: string;
  type: string;
  title: string;
  url?: string;
  doi?: string;
  date?: string;
  year?: number;
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
  entries: BibliographyEntry[];
}

async function fetchPage(start: number): Promise<{ items: ZoteroAPIItem[]; totalResults: number }> {
  const apiKey = process.env.ZOTERO_KEY;
  const { userId, libraryType, collectionId, style, sort, direction } = ZOTERO;

  // Ask Zotero to return CSL-JSON, BibTeX, AND a pre-rendered citation in
  // one round-trip. Format=json + include= adds the extra renderings.
  // itemType filter excludes attachments and notes — they show up in the
  // collection as standalone items if they're imported PDFs without a
  // parent record, but they aren't citable on their own.
  const params = new URLSearchParams({
    format: 'json',
    include: 'csljson,bib,bibtex',
    // Single negation works; combining multiple negations with `||` is
    // accepted but evaluates as a tautology, so we exclude attachments
    // here (the noisy case for typical libraries) and post-filter notes.
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

function normalize(item: ZoteroAPIItem): BibliographyEntry | null {
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

  return {
    key: item.key,
    type,
    title,
    url: typeof csl.URL === 'string' ? csl.URL : undefined,
    doi: typeof csl.DOI === 'string' ? csl.DOI : undefined,
    date: year ? String(year) : undefined,
    year: typeof year === 'number' ? year : undefined,
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
  try {
    items = await fetchAllItems();
  } catch (err) {
    console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const entries = items
    .map(normalize)
    .filter((e): e is BibliographyEntry => e !== null);

  const output: BibliographyOutput = {
    style: ZOTERO.style,
    fetchedAt: new Date().toISOString(),
    collectionId: ZOTERO.collectionId,
    count: entries.length,
    entries,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  ✓ ${OUTPUT_PATH} (${entries.length} entries, fetched ${items.length})`);
}

main();
