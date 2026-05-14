#!/usr/bin/env npx tsx
/**
 * Fetch are.na channels and convert to markdown resource pages.
 * 
 * Usage:
 *   ARENA_TOKEN=xxx npx tsx scripts/fetch-arena.ts
 * 
 * Configure channels in CHANNELS array below.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION - Edit these values
// ============================================================================

const CHANNELS: string[] = [
  // Add your are.na channel slugs here
  // 'mapping-references',
  // 'cartographic-inspiration',
];

const OUTPUT_DIR = 'src/content/resources';

// ============================================================================
// Types
// ============================================================================

interface ArenaBlock {
  id: number;
  title: string | null;
  updated_at: string;
  class: 'Image' | 'Text' | 'Link' | 'Media' | 'Attachment';
  content: string | null;
  content_html: string | null;
  description: string | null;
  source: { url: string } | null;
  image: {
    original: { url: string };
    display: { url: string };
    thumb: { url: string };
  } | null;
}

interface ArenaChannel {
  id: number;
  title: string;
  slug: string;
  metadata: { description: string } | null;
  contents: ArenaBlock[];
  length: number;
}

// ============================================================================
// Fetching
// ============================================================================

async function fetchChannel(slug: string): Promise<ArenaChannel> {
  const token = process.env.ARENA_TOKEN;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(
    `https://api.are.na/v2/channels/${slug}?per=100`,
    { headers }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch channel ${slug}: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// Conversion
// ============================================================================

function blockToMarkdown(block: ArenaBlock): string {
  const parts: string[] = [];
  
  switch (block.class) {
    case 'Image':
      if (block.image) {
        const alt = block.title || block.description || 'Image';
        parts.push(`![${alt}](${block.image.original.url})`);
      }
      if (block.description) {
        parts.push(`\n*${block.description}*`);
      }
      break;
      
    case 'Text':
      if (block.content) {
        parts.push(block.content);
      }
      break;
      
    case 'Link':
      if (block.source?.url) {
        const title = block.title || block.source.url;
        parts.push(`[${title}](${block.source.url})`);
        if (block.description) {
          parts.push(`\n${block.description}`);
        }
      }
      break;
      
    case 'Media':
      if (block.source?.url) {
        parts.push(`[${block.title || 'Media'}](${block.source.url})`);
      }
      break;
      
    case 'Attachment':
      if (block.image) {
        parts.push(`![${block.title || 'Attachment'}](${block.image.original.url})`);
      }
      break;
  }
  
  return parts.join('\n');
}

function channelToMarkdown(channel: ArenaChannel): string {
  const frontmatter = {
    title: channel.title,
    slug: channel.slug,
    source: 'arena',
    arenaId: channel.id,
    blockCount: channel.length,
    lastFetched: new Date().toISOString(),
  };
  
  const description = channel.metadata?.description || '';
  
  const blocks = channel.contents
    .map(blockToMarkdown)
    .filter(Boolean)
    .join('\n\n---\n\n');
  
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
    .join('\n');
  
  return `---
${yaml}
---

${description}

${blocks}
`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Fetching are.na channels...\n');
  
  if (CHANNELS.length === 0) {
    console.log('No channels configured. Edit CHANNELS in scripts/fetch-arena.ts');
    return;
  }
  
  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  for (const slug of CHANNELS) {
    try {
      console.log(`  Fetching: ${slug}`);
      const channel = await fetchChannel(slug);
      const markdown = channelToMarkdown(channel);
      
      const outputPath = join(OUTPUT_DIR, `${slug}.md`);
      writeFileSync(outputPath, markdown, 'utf-8');
      
      console.log(`  ✓ ${outputPath} (${channel.length} blocks)\n`);
    } catch (error) {
      console.error(`  ✗ Error fetching ${slug}:`, error);
    }
  }
  
  console.log('Done.');
}

main();
