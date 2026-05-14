#!/usr/bin/env npx tsx
/**
 * Fetch Zotero collection as BibTeX.
 * 
 * Usage:
 *   ZOTERO_USER=xxx ZOTERO_KEY=xxx npx tsx scripts/fetch-zotero.ts
 * 
 * Configure collection ID below.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ============================================================================
// CONFIGURATION - Edit these values
// ============================================================================

// Your Zotero user ID (find at zotero.org/settings/keys)
const ZOTERO_USER = process.env.ZOTERO_USER || '';

// Collection ID to fetch (from URL: zotero.org/users/xxx/collections/THIS_PART)
const COLLECTION_ID = ''; // e.g., 'ABC123XY'

// Output path
const OUTPUT_PATH = 'src/data/references.bib';

// ============================================================================
// Main
// ============================================================================

async function fetchBibtex(): Promise<string> {
  const apiKey = process.env.ZOTERO_KEY;
  
  if (!ZOTERO_USER) {
    throw new Error('ZOTERO_USER environment variable required');
  }
  
  if (!apiKey) {
    throw new Error('ZOTERO_KEY environment variable required');
  }
  
  if (!COLLECTION_ID) {
    throw new Error('COLLECTION_ID not configured in script');
  }
  
  const url = `https://api.zotero.org/users/${ZOTERO_USER}/collections/${COLLECTION_ID}/items?format=bibtex&limit=100`;
  
  const response = await fetch(url, {
    headers: {
      'Zotero-API-Key': apiKey,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Zotero API error: ${response.status}`);
  }
  
  return response.text();
}

async function main() {
  console.log('Fetching Zotero bibliography...\n');
  
  // Check if configured
  if (!COLLECTION_ID) {
    console.log('No collection configured. Edit COLLECTION_ID in scripts/fetch-zotero.ts');
    console.log('Skipping Zotero fetch.\n');
    return;
  }
  
  try {
    const bibtex = await fetchBibtex();
    
    // Ensure output directory exists
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    
    writeFileSync(OUTPUT_PATH, bibtex, 'utf-8');
    
    // Count entries
    const entryCount = (bibtex.match(/@\w+\{/g) || []).length;
    console.log(`  ✓ ${OUTPUT_PATH} (${entryCount} entries)\n`);
    
  } catch (error) {
    console.error('  ✗ Error:', error);
    // Don't exit with error - Zotero is optional
  }
}

main();
