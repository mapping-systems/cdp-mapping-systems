#!/usr/bin/env npx tsx
/**
 * Fetch are.na channels and convert each to an Astro content collection page.
 *
 * Channels are configured in resources.config.ts (sibling to the project
 * root). Auth is optional: ARENA_TOKEN env var is sent if present, public
 * channels work without it.
 *
 * Usage:
 *   npm run build:arena
 *   # or directly:
 *   ARENA_TOKEN=xxx tsx scripts/fetch-arena.ts
 *
 * Output:
 *   src/content/resources/<slug>.md  (one per channel)
 *   referenced images are kept as remote are.na URLs (they're CDN-hosted
 *   and stable as long as the blocks exist).
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { ARENA_CHANNELS, type ArenaChannelConfig } from '../resources.config.js';

const OUTPUT_DIR = 'src/content/resources';
const JSON_OUTPUT_DIR = 'src/data/arena';

// ---------------------------------------------------------------------------
// API types — only the fields we use
// ---------------------------------------------------------------------------

interface ArenaImage {
  original: { url: string };
  display: { url: string };
  thumb: { url: string };
}

interface ArenaBlock {
  id: number;
  title: string | null;
  updated_at: string;
  class: 'Image' | 'Text' | 'Link' | 'Media' | 'Attachment' | 'Channel';
  content: string | null;
  content_html: string | null;
  description: string | null;
  source: { url: string; title?: string | null } | null;
  image: ArenaImage | null;
}

interface ArenaChannel {
  id: number;
  title: string;
  slug: string;
  metadata: { description: string } | null;
  contents: ArenaBlock[];
  length: number;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchChannel(slug: string): Promise<ArenaChannel> {
  const token = process.env.ARENA_TOKEN;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Are.na's API caps at 100 per page; for larger channels we'd paginate.
  const response = await fetch(
    `https://api.are.na/v2/channels/${slug}?per=100`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch channel "${slug}": ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Block → markdown rendering
// ---------------------------------------------------------------------------

function escapeYaml(value: string): string {
  // Quote and escape inner double quotes; sufficient for titles and slugs.
  return `"${value.replace(/"/g, '\\"')}"`;
}

function blockToMarkdown(block: ArenaBlock): string {
  const parts: string[] = [];

  switch (block.class) {
    case 'Image': {
      if (block.image) {
        const alt = block.title || block.description?.slice(0, 80) || 'Image';
        parts.push(`![${alt}](${block.image.display.url})`);
      }
      if (block.title) parts.push(`**${block.title}**`);
      if (block.description) parts.push(block.description);
      break;
    }
    case 'Text': {
      if (block.title) parts.push(`### ${block.title}`);
      if (block.content) parts.push(block.content);
      break;
    }
    case 'Link': {
      if (block.source?.url) {
        const title = block.title || block.source.title || block.source.url;
        parts.push(`[${title}](${block.source.url})`);
      }
      if (block.description) parts.push(block.description);
      break;
    }
    case 'Media': {
      if (block.source?.url) {
        parts.push(`[${block.title || 'Media'}](${block.source.url})`);
      }
      if (block.description) parts.push(block.description);
      break;
    }
    case 'Attachment': {
      if (block.image) {
        parts.push(`![${block.title || 'Attachment'}](${block.image.display.url})`);
      }
      if (block.title) parts.push(`**${block.title}**`);
      if (block.description) parts.push(block.description);
      break;
    }
    case 'Channel': {
      // Sub-channel reference — just link out to are.na.
      if (block.title) {
        parts.push(`📁 **[${block.title} (channel)](https://are.na/channel/${block.id})**`);
      }
      break;
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

function pickHeroImage(channel: ArenaChannel): string | null {
  // First Image block's display URL — used as the channel's thumbnail on the
  // resources index. Fall back to the first Attachment with an image.
  for (const block of channel.contents) {
    if (block.class === 'Image' && block.image) return block.image.display.url;
    if (block.class === 'Attachment' && block.image) return block.image.display.url;
  }
  return null;
}

function channelToMarkdown(channel: ArenaChannel, config: ArenaChannelConfig): string {
  const title = config.title ?? channel.title;
  const description = config.description ?? channel.metadata?.description ?? '';
  const hero = pickHeroImage(channel);
  // urlSlug overrides the arena slug for the published URL; defaults to
  // the arena slug if unset.
  const urlSlug = config.urlSlug ?? channel.slug;

  const frontmatter: string[] = [
    `title: ${escapeYaml(title)}`,
    `slug: ${escapeYaml(urlSlug)}`,
    `source: arena`,
    `arenaId: ${channel.id}`,
    `blockCount: ${channel.length}`,
    `lastFetched: ${escapeYaml(new Date().toISOString())}`,
  ];
  if (description) frontmatter.push(`description: ${escapeYaml(description)}`);
  if (hero) frontmatter.push(`heroImage: ${escapeYaml(hero)}`);
  if (config.tags && config.tags.length > 0) {
    frontmatter.push(`tags:\n${config.tags.map((t) => `  - ${escapeYaml(t)}`).join('\n')}`);
  }

  const body = channel.contents
    .map(blockToMarkdown)
    .filter((md) => md.trim().length > 0)
    .join('\n\n---\n\n');

  return `---\n${frontmatter.join('\n')}\n---\n\n${body}\n`;
}

/** Compact block representation that the channel detail page uses to render
    a grid (instead of a vertical markdown flow). */
interface GridBlock {
  id: number;
  /** Are.na block class — drives how the card is rendered. */
  class: ArenaBlock['class'];
  title: string | null;
  description: string | null;
  /** External URL the block points at — for Link/Media blocks. */
  source_url: string | null;
  /** Image URL (display size, ~1200px wide) — for Image/Attachment blocks
      and as a fallback for Link blocks if the API has one. */
  image_url: string | null;
  /** Smaller thumb (~200px) for layout placeholders. */
  thumb_url: string | null;
  /** Plain text content — for Text blocks. */
  content: string | null;
  /** are.na permalink to the block (always works as a fallback). */
  block_url: string;
}

function blockToGrid(block: ArenaBlock): GridBlock {
  return {
    id: block.id,
    class: block.class,
    title: block.title,
    description: block.description,
    source_url: block.source?.url ?? null,
    image_url: block.image?.display.url ?? null,
    thumb_url: block.image?.thumb.url ?? null,
    content: block.content,
    block_url: `https://www.are.na/block/${block.id}`,
  };
}

function channelToJson(channel: ArenaChannel, config: ArenaChannelConfig) {
  return {
    slug: config.urlSlug ?? channel.slug,
    arenaSlug: channel.slug,
    title: config.title ?? channel.title,
    description: config.description ?? channel.metadata?.description ?? '',
    arenaId: channel.id,
    arenaUrl: `https://www.are.na/channel/${channel.id}`,
    blockCount: channel.length,
    tags: config.tags ?? [],
    fetchedAt: new Date().toISOString(),
    blocks: channel.contents.map(blockToGrid),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('━━━ are.na ━━━');

  if (ARENA_CHANNELS.length === 0) {
    console.log('No channels configured. Edit ARENA_CHANNELS in resources.config.ts');
    return;
  }

  // Fresh run: clear both arena outputs.
  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
  if (existsSync(JSON_OUTPUT_DIR)) rmSync(JSON_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(JSON_OUTPUT_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;
  for (const config of ARENA_CHANNELS) {
    try {
      const channel = await fetchChannel(config.slug);
      const urlSlug = config.urlSlug ?? channel.slug;

      // Markdown for the resources index card frontmatter (and as a fallback
      // SEO/readable view).
      const markdown = channelToMarkdown(channel, config);
      const mdPath = join(OUTPUT_DIR, `${urlSlug}.md`);
      writeFileSync(mdPath, markdown, 'utf-8');

      // JSON consumed by /resources/<slug> to render the grid layout.
      const json = channelToJson(channel, config);
      const jsonPath = join(JSON_OUTPUT_DIR, `${urlSlug}.json`);
      writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8');

      console.log(`  ✓ ${urlSlug} (${channel.length} blocks) → ${mdPath}, ${jsonPath}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${config.slug}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }
  console.log(`Done: ${ok} succeeded, ${failed} failed.`);

  if (failed > 0) process.exit(1);
}

main();
