# Migration Plan: Jupyter Book → Astro

## Overview

This document outlines the migration of the Mapping Systems course site from Jupyter Book 2 (MyST) to Astro. The goal is to achieve a polished, fast-loading site with smooth page transitions while preserving the notebook-based authoring workflow.

**Current State:** Jupyter Book 2 / MyST with `.ipynb` notebooks, deployed to Cloudflare Pages
**Target State:** Astro with View Transitions, pre-executed notebook content, are.na/Zotero integrations

---

## Architecture

### Content Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AUTHORING LAYER                              │
│                                                                      │
│   notebooks/                                                         │
│   ├── tutorials/                                                     │
│   │   ├── 01-intro.ipynb          ← You author here (Jupyter/VSCode)│
│   │   └── 02-geopandas.ipynb                                        │
│   └── advanced/                                                      │
│       └── 01-network-analysis.ipynb                                  │
│                                                                      │
│   Optional: Jupytext sync to .md:myst for cleaner diffs             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BUILD PIPELINE                               │
│                                                                      │
│   1. Python: Execute notebooks → Markdown with embedded outputs     │
│      (scripts/build-lessons.py)                                     │
│                                                                      │
│   2. TypeScript: Fetch are.na channels → Resource pages             │
│      (scripts/fetch-arena.ts)                                       │
│                                                                      │
│   3. TypeScript: Fetch Zotero collection → references.bib           │
│      (scripts/fetch-zotero.ts)                                      │
│                                                                      │
│   4. Astro: Build static site with View Transitions                 │
│      (astro build)                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         OUTPUT                                       │
│                                                                      │
│   dist/                          → Deployed to Cloudflare Pages     │
│   ├── index.html                                                    │
│   ├── lessons/                                                      │
│   │   ├── intro/index.html                                         │
│   │   └── geopandas/index.html                                     │
│   ├── resources/                                                    │
│   │   └── cartography-refs/index.html                              │
│   └── lesson-assets/             → Generated notebook images        │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Notebook execution | Build-time (Python) | Outputs embedded in markdown, no runtime kernel needed |
| Section organization | Directory convention + frontmatter override | Intuitive structure, flexible when needed |
| Image storage | `public/lesson-assets/` | Hashed filenames, served statically |
| Styling | Tailwind CSS | Rapid iteration, consistent design system |
| Deployment | Cloudflare Pages | Already in use, fast global CDN |
| Package manager | npm + pip | npm for Astro, pip for notebook execution |

---

## Directory Structure

```
mapping-systems/
├── astro.config.mjs              # Astro configuration
├── tailwind.config.mjs           # Tailwind configuration
├── package.json                  # Node dependencies + scripts
├── requirements.txt              # Python dependencies (existing)
├── tsconfig.json                 # TypeScript config
│
├── notebooks/                    # SOURCE: Your Jupyter notebooks
│   ├── tutorials/
│   │   ├── 01-intro.ipynb
│   │   ├── 02-geopandas-basics.ipynb
│   │   ├── 03-spatial-joins.ipynb
│   │   └── ...
│   ├── advanced/
│   │   ├── 01-network-analysis.ipynb
│   │   ├── 02-raster-processing.ipynb
│   │   └── ...
│   └── reference/
│       ├── crs-guide.ipynb
│       └── file-formats.ipynb
│
├── scripts/                      # Build scripts
│   ├── build-lessons.py          # Execute + convert notebooks
│   ├── fetch-arena.ts            # Fetch are.na content
│   └── fetch-zotero.ts           # Fetch Zotero bibliography
│
├── src/
│   ├── content/                  # GENERATED: Astro content collections
│   │   ├── config.ts             # Collection schemas
│   │   ├── lessons/              # ← Generated from notebooks/
│   │   │   ├── 01-intro.md
│   │   │   ├── 02-geopandas-basics.md
│   │   │   └── ...
│   │   └── resources/            # ← Generated from are.na
│   │       └── cartography-references.md
│   │
│   ├── components/               # Reusable Astro components
│   │   ├── Navigation.astro
│   │   ├── LessonCard.astro
│   │   ├── CodeBlock.astro
│   │   └── OutputBlock.astro
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro      # HTML shell, View Transitions
│   │   ├── LessonLayout.astro    # Lesson page layout
│   │   └── ResourceLayout.astro  # Resource page layout
│   │
│   ├── pages/
│   │   ├── index.astro           # Homepage
│   │   ├── lessons/
│   │   │   ├── index.astro       # Lesson listing (grouped by section)
│   │   │   └── [...slug].astro   # Dynamic lesson pages
│   │   └── resources/
│   │       ├── index.astro       # Resource listing
│   │       └── [...slug].astro   # Dynamic resource pages
│   │
│   ├── styles/
│   │   └── global.css            # Global styles + Tailwind imports
│   │
│   └── data/
│       └── references.bib        # ← Generated from Zotero
│
├── public/
│   ├── lesson-assets/            # ← Generated images from notebooks
│   │   ├── 01-intro-3-0-a1b2c3d4.png
│   │   └── ...
│   ├── favicon.svg
│   └── fonts/
│
└── .github/
    └── workflows/
        └── deploy.yml            # GitHub Actions (optional, if using GH)
```

---

## Scripts

### scripts/build-lessons.py

Executes notebooks and converts them to Astro-compatible markdown.

```python
#!/usr/bin/env python3
"""
Execute Jupyter notebooks and convert to Astro-compatible markdown.

Outputs:
  - Markdown files → src/content/lessons/
  - Image assets → public/lesson-assets/

Section is inferred from parent directory (tutorials/, advanced/, etc.)
Order is inferred from filename prefix (01-, 02-, etc.)
Explicit frontmatter in notebook's first raw cell overrides defaults.
"""

import nbformat
from nbconvert.preprocessors import ExecutePreprocessor
from pathlib import Path
import base64
import hashlib
import re
import yaml
import shutil
import sys

# Configuration
NOTEBOOKS_DIR = Path("notebooks")
OUTPUT_DIR = Path("src/content/lessons")
ASSETS_DIR = Path("public/lesson-assets")
DEFAULT_SECTION = "tutorials"

# Ensure clean output directories
def setup_output_dirs():
    """Create or clean output directories."""
    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir(parents=True)
    
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)


def execute_notebook(nb_path: Path) -> nbformat.NotebookNode:
    """Execute a notebook and return the executed version."""
    print(f"  Executing {nb_path.name}...")
    
    with open(nb_path) as f:
        nb = nbformat.read(f, as_version=4)
    
    ep = ExecutePreprocessor(
        timeout=600,
        kernel_name='python3',
        allow_errors=False  # Set True to continue on cell errors
    )
    
    try:
        ep.preprocess(nb, {'metadata': {'path': nb_path.parent}})
    except Exception as e:
        print(f"  ⚠️  Execution error in {nb_path.name}: {e}")
        raise
    
    return nb


def get_section_from_path(nb_path: Path) -> str:
    """Infer section from notebook's parent directory."""
    parent = nb_path.parent.name
    if parent == "notebooks" or parent == NOTEBOOKS_DIR.name:
        return DEFAULT_SECTION
    return parent


def get_order_from_filename(nb_path: Path) -> int | None:
    """Extract order from filename prefix (e.g., '01-intro.ipynb' → 1)."""
    match = re.match(r'^(\d+)', nb_path.stem)
    if match:
        return int(match.group(1))
    return None


def clean_slug(filename: str) -> str:
    """Convert filename to clean URL slug."""
    # Remove numeric prefix
    slug = re.sub(r'^\d+[-_]?', '', filename)
    # Convert underscores and spaces to hyphens
    slug = re.sub(r'[_\s]+', '-', slug)
    # Remove any non-alphanumeric characters except hyphens
    slug = re.sub(r'[^a-zA-Z0-9-]', '', slug)
    # Lowercase
    return slug.lower()


def extract_frontmatter(nb: nbformat.NotebookNode, nb_path: Path) -> dict:
    """Extract or generate frontmatter for the lesson."""
    # Defaults from path/filename
    frontmatter = {
        'title': nb_path.stem.replace('-', ' ').replace('_', ' ').title(),
        'slug': clean_slug(nb_path.stem),
        'section': get_section_from_path(nb_path),
    }
    
    # Add order if detectable from filename
    order = get_order_from_filename(nb_path)
    if order is not None:
        frontmatter['order'] = order
    
    # Clean up title (remove numeric prefix)
    frontmatter['title'] = re.sub(r'^\d+\s*', '', frontmatter['title']).strip()
    
    # Check first cell for explicit frontmatter (overrides defaults)
    if nb.cells and nb.cells[0].cell_type == 'raw':
        source = nb.cells[0].source.strip()
        if source.startswith('---'):
            try:
                # Parse YAML between --- markers
                yaml_content = source.split('---')[1]
                explicit = yaml.safe_load(yaml_content)
                if explicit:
                    frontmatter.update(explicit)
            except Exception as e:
                print(f"  ⚠️  Could not parse frontmatter in {nb_path.name}: {e}")
    
    return frontmatter


def output_to_markdown(output: dict, nb_stem: str, cell_idx: int, out_idx: int) -> str:
    """Convert a cell output to markdown."""
    output_type = output.get('output_type', '')
    
    # Stream output (print statements, logs)
    if output_type == 'stream':
        text = output.get('text', '')
        if text.strip():
            return f'<div class="output-stream">\n\n```\n{text.rstrip()}\n```\n\n</div>\n'
        return ''
    
    # Execution result or display_data (plots, dataframes, etc.)
    if output_type in ('execute_result', 'display_data'):
        data = output.get('data', {})
        
        # PNG images (most common for matplotlib)
        if 'image/png' in data:
            img_data = data['image/png']
            img_hash = hashlib.md5(img_data.encode()).hexdigest()[:8]
            img_filename = f"{nb_stem}-{cell_idx}-{out_idx}-{img_hash}.png"
            img_path = ASSETS_DIR / img_filename
            
            # Decode and save
            img_path.write_bytes(base64.b64decode(img_data))
            
            return f'<figure class="output-figure">\n\n![Output](/lesson-assets/{img_filename})\n\n</figure>\n'
        
        # SVG images
        if 'image/svg+xml' in data:
            svg = data['image/svg+xml']
            return f'<figure class="output-figure output-svg">\n\n{svg}\n\n</figure>\n'
        
        # HTML output (pandas DataFrames, widgets)
        if 'text/html' in data:
            html = data['text/html']
            # Wrap in container for styling
            return f'<div class="output-html">\n\n{html}\n\n</div>\n'
        
        # Plain text fallback
        if 'text/plain' in data:
            text = data['text/plain']
            # Skip memory address repr strings
            if re.match(r'^<.+ at 0x[0-9a-f]+>$', text.strip()):
                return ''
            if text.strip():
                return f'<div class="output-text">\n\n```\n{text.rstrip()}\n```\n\n</div>\n'
    
    # Error output
    if output_type == 'error':
        traceback = '\n'.join(output.get('traceback', []))
        # Strip ANSI escape codes
        traceback = re.sub(r'\x1b\[[0-9;]*m', '', traceback)
        return f'<div class="output-error">\n\n```\n{traceback}\n```\n\n</div>\n'
    
    return ''


def cell_to_markdown(cell: dict, nb_stem: str, cell_idx: int) -> str:
    """Convert a notebook cell to markdown."""
    cell_type = cell.get('cell_type', '')
    source = cell.get('source', '')
    
    # Markdown cells pass through with minor cleanup
    if cell_type == 'markdown':
        # Ensure proper spacing
        return source.strip() + '\n\n'
    
    # Raw cells (often frontmatter) - skip if first cell
    if cell_type == 'raw':
        return ''
    
    # Code cells
    if cell_type == 'code':
        parts = []
        
        # Check for cell tags
        tags = cell.get('metadata', {}).get('tags', [])
        hide_input = any(t in tags for t in ['hide-input', 'remove-input'])
        hide_output = any(t in tags for t in ['hide-output', 'remove-output'])
        hide_cell = any(t in tags for t in ['hide-cell', 'remove-cell'])
        
        # Completely hidden cell
        if hide_cell:
            return ''
        
        # Code block
        if not hide_input and source.strip():
            parts.append(f'```python\n{source.rstrip()}\n```\n')
        
        # Outputs
        if not hide_output:
            outputs = cell.get('outputs', [])
            for out_idx, output in enumerate(outputs):
                md = output_to_markdown(output, nb_stem, cell_idx, out_idx)
                if md:
                    parts.append(md)
        
        return '\n'.join(parts) + '\n'
    
    return ''


def notebook_to_markdown(nb_path: Path) -> str:
    """Convert a notebook to Astro-compatible markdown."""
    print(f"Processing {nb_path}...")
    
    # Execute the notebook
    nb = execute_notebook(nb_path)
    
    # Extract frontmatter
    frontmatter = extract_frontmatter(nb, nb_path)
    slug = clean_slug(nb_path.stem)
    
    # Convert cells to markdown
    md_parts = []
    start_idx = 0
    
    # Skip first cell if it's frontmatter
    if nb.cells and nb.cells[0].cell_type == 'raw':
        source = nb.cells[0].source.strip()
        if source.startswith('---'):
            start_idx = 1
    
    for idx, cell in enumerate(nb.cells[start_idx:], start=start_idx):
        md = cell_to_markdown(cell, slug, idx)
        if md:
            md_parts.append(md)
    
    # Assemble final markdown
    frontmatter_yaml = yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True)
    content = ''.join(md_parts)
    
    return f"---\n{frontmatter_yaml}---\n\n{content}"


def main():
    """Process all notebooks."""
    print("=" * 60)
    print("Building lessons from notebooks")
    print("=" * 60)
    
    # Check notebooks directory exists
    if not NOTEBOOKS_DIR.exists():
        print(f"Error: {NOTEBOOKS_DIR} not found")
        sys.exit(1)
    
    # Setup clean output
    setup_output_dirs()
    
    # Find all notebooks
    notebooks = list(NOTEBOOKS_DIR.glob("**/*.ipynb"))
    notebooks = [nb for nb in notebooks if '.ipynb_checkpoints' not in str(nb)]
    
    if not notebooks:
        print(f"No notebooks found in {NOTEBOOKS_DIR}")
        sys.exit(1)
    
    print(f"Found {len(notebooks)} notebooks\n")
    
    # Process each notebook
    success_count = 0
    error_count = 0
    
    for nb_path in sorted(notebooks):
        try:
            md_content = notebook_to_markdown(nb_path)
            
            # Write output
            output_filename = f"{clean_slug(nb_path.stem)}.md"
            output_path = OUTPUT_DIR / output_filename
            output_path.write_text(md_content, encoding='utf-8')
            
            print(f"  ✓ {output_path}\n")
            success_count += 1
            
        except Exception as e:
            print(f"  ✗ Error: {e}\n")
            error_count += 1
    
    # Summary
    print("=" * 60)
    print(f"Complete: {success_count} succeeded, {error_count} failed")
    print(f"Lessons: {OUTPUT_DIR}")
    print(f"Assets: {ASSETS_DIR}")
    print("=" * 60)
    
    if error_count > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
```

### scripts/fetch-arena.ts

```typescript
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
```

### scripts/fetch-zotero.ts

```typescript
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
    process.exit(1);
  }
}

main();
```

---

## Astro Configuration

### astro.config.mjs

```javascript
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    mdx(),
    tailwind(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      langs: ['python', 'javascript', 'typescript', 'bash', 'sql', 'json'],
    },
  },
  // If deploying to a subpath, set base here
  // base: '/mapping-systems',
});
```

### src/content/config.ts

```typescript
import { defineCollection, z } from 'astro:content';

const lessons = defineCollection({
  type: 'content',
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
  type: 'content',
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    source: z.enum(['arena', 'zotero', 'manual']),
    lastFetched: z.string().optional(),
    arenaId: z.number().optional(),
    blockCount: z.number().optional(),
  }),
});

export const collections = { lessons, resources };
```

### package.json

```json
{
  "name": "mapping-systems",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev",
    "build:lessons": "python scripts/build-lessons.py",
    "build:arena": "npx tsx scripts/fetch-arena.ts",
    "build:zotero": "npx tsx scripts/fetch-zotero.ts",
    "build:content": "npm run build:lessons && npm run build:arena && npm run build:zotero",
    "build": "npm run build:content && astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "dependencies": {
    "@astrojs/mdx": "^3.1.0",
    "@astrojs/tailwind": "^5.1.0",
    "astro": "^4.8.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "@types/node": "^20.11.0"
  }
}
```

### src/layouts/BaseLayout.astro

```astro
---
import { ViewTransitions } from 'astro:transitions';
import Navigation from '../components/Navigation.astro';
import '../styles/global.css';

interface Props {
  title: string;
  description?: string;
}

const { title, description = 'Mapping Systems Course' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title} | Mapping Systems</title>
    <ViewTransitions />
  </head>
  <body class="min-h-screen bg-white text-gray-900">
    <Navigation />
    <main class="max-w-4xl mx-auto px-4 py-8">
      <slot />
    </main>
  </body>
</html>
```

### src/pages/lessons/[...slug].astro

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export async function getStaticPaths() {
  const lessons = await getCollection('lessons', ({ data }) => !data.draft);
  return lessons.map((lesson) => ({
    params: { slug: lesson.data.slug },
    props: { lesson },
  }));
}

const { lesson } = Astro.props;
const { Content } = await lesson.render();
---
<BaseLayout title={lesson.data.title}>
  <article class="prose prose-lg max-w-none">
    <header class="mb-8">
      <p class="text-sm text-gray-500 uppercase tracking-wide">
        {lesson.data.section}
      </p>
      <h1 class="mt-2">{lesson.data.title}</h1>
      {lesson.data.description && (
        <p class="text-xl text-gray-600">{lesson.data.description}</p>
      )}
    </header>
    <Content />
  </article>
</BaseLayout>
```

### src/pages/lessons/index.astro

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

const lessons = await getCollection('lessons', ({ data }) => !data.draft);

// Group by section and sort
const sections: Record<string, typeof lessons> = {};
for (const lesson of lessons) {
  const section = lesson.data.section;
  if (!sections[section]) {
    sections[section] = [];
  }
  sections[section].push(lesson);
}

// Sort each section by order
for (const section of Object.keys(sections)) {
  sections[section].sort((a, b) => 
    (a.data.order ?? 99) - (b.data.order ?? 99)
  );
}

// Define section display order
const sectionOrder = ['tutorials', 'advanced', 'reference'];
const orderedSections = sectionOrder.filter(s => sections[s]);
---
<BaseLayout title="Lessons">
  <h1 class="text-3xl font-bold mb-8">Lessons</h1>
  
  {orderedSections.map((sectionName) => (
    <section class="mb-12">
      <h2 class="text-2xl font-semibold mb-4 capitalize">{sectionName}</h2>
      <ul class="space-y-3">
        {sections[sectionName].map((lesson) => (
          <li>
            <a 
              href={`/lessons/${lesson.data.slug}`}
              class="block p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <span class="font-medium">{lesson.data.title}</span>
              {lesson.data.description && (
                <p class="text-sm text-gray-600 mt-1">{lesson.data.description}</p>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  ))}
</BaseLayout>
```

### src/styles/global.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Notebook output styling */
.output-stream,
.output-text,
.output-error {
  @apply my-4 rounded-lg overflow-x-auto;
}

.output-stream pre,
.output-text pre {
  @apply bg-gray-100 p-4 text-sm;
}

.output-error pre {
  @apply bg-red-50 text-red-800 p-4 text-sm;
}

.output-html {
  @apply my-4 overflow-x-auto;
}

/* DataFrame table styling */
.output-html table {
  @apply border-collapse text-sm;
}

.output-html th,
.output-html td {
  @apply border border-gray-300 px-3 py-1;
}

.output-html th {
  @apply bg-gray-100 font-medium;
}

.output-figure {
  @apply my-6;
}

.output-figure img {
  @apply max-w-full rounded-lg shadow-sm;
}

/* Code block styling */
.prose pre {
  @apply bg-gray-900 text-gray-100 rounded-lg;
}

.prose code {
  @apply text-sm;
}

/* Inline code */
.prose :not(pre) > code {
  @apply bg-gray-100 px-1.5 py-0.5 rounded text-gray-800;
}

.prose :not(pre) > code::before,
.prose :not(pre) > code::after {
  content: none;
}
```

---

## Cloudflare Pages Configuration

In Cloudflare Pages dashboard:

| Setting | Value |
|---------|-------|
| **Build command** | `pip install -r requirements.txt && npm install && npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (or subdirectory if monorepo) |
| **Node.js version** | `20` (set via Environment Variable: `NODE_VERSION=20`) |
| **Python version** | `3.11` (set via Environment Variable: `PYTHON_VERSION=3.11`) |

### Environment Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_VERSION` | `20` | Required |
| `PYTHON_VERSION` | `3.11` | Required |
| `ARENA_TOKEN` | Your token | Optional, for are.na |
| `ZOTERO_USER` | Your user ID | Optional, for Zotero |
| `ZOTERO_KEY` | Your API key | Optional, for Zotero |

---

## Migration Steps

### Phase 1: Project Setup

1. [ ] Create new directory for Astro project (or new branch)
2. [ ] Initialize Astro: `npm create astro@latest`
3. [ ] Add integrations: `npx astro add mdx tailwind`
4. [ ] Copy `requirements.txt` from existing project
5. [ ] Create directory structure per this document
6. [ ] Create `astro.config.mjs`, `package.json`, `tsconfig.json`
7. [ ] Create content collection config (`src/content/config.ts`)

### Phase 2: Build Pipeline

8. [ ] Create `scripts/build-lessons.py`
9. [ ] Create `scripts/fetch-arena.ts` (configure channels)
10. [ ] Create `scripts/fetch-zotero.ts` (configure collection)
11. [ ] Test locally: `python scripts/build-lessons.py`
12. [ ] Verify markdown output in `src/content/lessons/`
13. [ ] Verify images in `public/lesson-assets/`

### Phase 3: Astro Templates

14. [ ] Create `src/layouts/BaseLayout.astro` with ViewTransitions
15. [ ] Create `src/pages/index.astro` (homepage)
16. [ ] Create `src/pages/lessons/index.astro` (listing)
17. [ ] Create `src/pages/lessons/[...slug].astro` (lesson pages)
18. [ ] Create `src/styles/global.css` with output styling
19. [ ] Create navigation component

### Phase 4: Local Testing

20. [ ] Copy notebooks to `notebooks/` directory
21. [ ] Run full build: `npm run build`
22. [ ] Preview: `npm run preview`
23. [ ] Verify page transitions are smooth
24. [ ] Verify code highlighting works
25. [ ] Verify images render correctly
26. [ ] Verify DataFrame tables styled properly

### Phase 5: Deployment

27. [ ] Push to GitHub/GitLab
28. [ ] Configure Cloudflare Pages (see settings above)
29. [ ] Set environment variables in Cloudflare
30. [ ] Trigger build
31. [ ] Verify live site

### Phase 6: Integrations

32. [ ] Configure are.na channels in fetch script
33. [ ] Configure Zotero collection in fetch script
34. [ ] Add environment variables to Cloudflare
35. [ ] Test full build with integrations

### Phase 7: Cleanup

36. [ ] Archive or delete old Jupyter Book repository
37. [ ] Update any external links
38. [ ] Document new workflow for future reference

---

## Verification Checklist

Run through this checklist after migration:

### Build Verification

- [ ] `npm run build` completes without errors
- [ ] All notebooks execute successfully
- [ ] No missing images in output
- [ ] Build time is reasonable (<5 minutes)

### Visual Verification

- [ ] Homepage loads correctly
- [ ] Lesson listing shows all sections
- [ ] Lessons sorted correctly within sections
- [ ] Page transitions are smooth (no flash)
- [ ] Code blocks have syntax highlighting
- [ ] Python code renders correctly
- [ ] Output images display
- [ ] DataFrame tables are styled and scrollable
- [ ] Error outputs styled distinctly
- [ ] Mobile responsive

### Content Verification

- [ ] All notebooks converted
- [ ] Frontmatter extracted correctly
- [ ] Sections assigned correctly
- [ ] Order preserved
- [ ] Markdown formatting preserved
- [ ] Links work
- [ ] Images have alt text

### Integration Verification

- [ ] are.na content fetches (if configured)
- [ ] Zotero bibliography fetches (if configured)
- [ ] Resource pages render

### Deployment Verification

- [ ] Cloudflare build succeeds
- [ ] Site accessible at production URL
- [ ] No console errors
- [ ] Assets load from CDN
- [ ] Environment variables working

---

## Troubleshooting

### Notebook execution fails

```bash
# Test single notebook
python -c "
import nbformat
from nbconvert.preprocessors import ExecutePreprocessor
nb = nbformat.read('notebooks/tutorials/01-intro.ipynb', as_version=4)
ep = ExecutePreprocessor(timeout=600)
ep.preprocess(nb)
print('Success')
"
```

Check:
- Kernel available (`python -m ipykernel install --user`)
- Dependencies in `requirements.txt`
- File paths in notebook are relative to notebook location

### Images not appearing

- Check `public/lesson-assets/` has files after build
- Verify image paths in generated markdown start with `/lesson-assets/`
- Check browser console for 404s

### View Transitions not working

- Ensure `<ViewTransitions />` in `<head>`
- Check no JavaScript errors in console
- Verify navigation uses `<a href>` not JavaScript routing

### Cloudflare build fails

- Check build logs for specific error
- Verify `NODE_VERSION` and `PYTHON_VERSION` set
- Test build locally with same versions
- Ensure `requirements.txt` has all dependencies

---

## Future Enhancements

- [ ] Add search functionality (Pagefind)
- [ ] Add progress tracking for students
- [ ] Add interactive code execution (Pyodide)
- [ ] Add comments/discussion (Giscus)
- [ ] Add RSS feed for updates
- [ ] Add OpenGraph images for social sharing
- [ ] Scheduled are.na/Zotero refresh via GitHub Actions

---

## References

- [Astro Documentation](https://docs.astro.build)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [View Transitions](https://docs.astro.build/en/guides/view-transitions/)
- [nbconvert Documentation](https://nbconvert.readthedocs.io)
- [are.na API](https://dev.are.na/documentation)
- [Zotero API](https://www.zotero.org/support/dev/web_api/v3/start)
