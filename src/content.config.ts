import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const lessons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    section: z.string().default('tutorials'),
    order: z.number().optional(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const resources = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/resources' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    source: z.enum(['arena', 'zotero', 'manual']),
    description: z.string().optional(),
    lastFetched: z.string().optional(),
    arenaId: z.number().optional(),
    blockCount: z.number().optional(),
  }),
});

export const collections = { lessons, resources };
