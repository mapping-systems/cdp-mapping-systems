#!/usr/bin/env python3
"""
Build content from the unified content/ directory.

Handles both:
  - .ipynb notebooks → executed and converted to markdown
  - .md files → copied with frontmatter validation/generation

Outputs:
  - Markdown files → src/content/lessons/
  - Image assets → public/lesson-assets/

Section is inferred from parent directory (tutorials/, advanced/, etc.)
Order is inferred from filename prefix (01-, 02-, etc.)
Explicit frontmatter overrides defaults.

Usage:
    python scripts/build-content.py
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

# ============================================================================
# CONFIGURATION
# ============================================================================

# Student-facing content directory (tracked in git)
CONTENT_DIR = Path("content")

# Generated output (gitignored)
OUTPUT_DIR = Path("src/content/lessons")
ASSETS_DIR = Path("public/lesson-assets")

DEFAULT_SECTION = "tutorials"

# ============================================================================
# Setup
# ============================================================================


def setup_output_dirs():
    """Create or clean output directories."""
    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir(parents=True)

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)


# ============================================================================
# Utilities
# ============================================================================


def get_section_from_path(file_path: Path) -> str:
    """Infer section from file's parent directory."""
    # Get the immediate parent directory name
    parent = file_path.parent.name

    # If directly in content/, use default
    if parent == "content" or parent == CONTENT_DIR.name:
        return DEFAULT_SECTION

    return parent


def get_order_from_filename(file_path: Path) -> int | None:
    """Extract order from filename prefix (e.g., '01-intro.ipynb' → 1)."""
    match = re.match(r"^(\d+)", file_path.stem)
    if match:
        return int(match.group(1))
    return None


def clean_slug(filename: str) -> str:
    """Convert filename to clean URL slug."""
    # Remove numeric prefix
    slug = re.sub(r"^\d+[-_]?", "", filename)
    # Convert underscores and spaces to hyphens
    slug = re.sub(r"[_\s]+", "-", slug)
    # Remove any non-alphanumeric characters except hyphens
    slug = re.sub(r"[^a-zA-Z0-9-]", "", slug)
    # Lowercase
    return slug.lower()


def clean_title(filename: str) -> str:
    """Convert filename to readable title."""
    # Remove extension
    name = Path(filename).stem
    # Remove numeric prefix
    name = re.sub(r"^\d+[-_]?\s*", "", name)
    # Convert separators to spaces
    name = re.sub(r"[-_]+", " ", name)
    # Title case
    return name.title()


# ============================================================================
# Markdown File Processing
# ============================================================================


def process_markdown_file(md_path: Path) -> str:
    """Process a plain markdown file, ensuring valid frontmatter."""
    print(f"Processing {md_path}...")

    content = md_path.read_text(encoding="utf-8")

    # Check if file has frontmatter
    if content.startswith("---"):
        # Parse existing frontmatter
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                existing_fm = yaml.safe_load(parts[1])
                if existing_fm is None:
                    existing_fm = {}
            except yaml.YAMLError:
                existing_fm = {}
            body = parts[2].strip()
        else:
            existing_fm = {}
            body = content
    else:
        existing_fm = {}
        body = content

    # Build frontmatter with defaults
    frontmatter = {
        "title": clean_title(md_path.name),
        "slug": clean_slug(md_path.stem),
        "section": get_section_from_path(md_path),
    }

    # Add order if detectable
    order = get_order_from_filename(md_path)
    if order is not None:
        frontmatter["order"] = order

    # Existing frontmatter overrides defaults
    frontmatter.update(existing_fm)

    # Reassemble
    frontmatter_yaml = yaml.dump(
        frontmatter, default_flow_style=False, allow_unicode=True
    )
    return f"---\n{frontmatter_yaml}---\n\n{body}\n"


# ============================================================================
# Notebook Processing
# ============================================================================


def execute_notebook(nb_path: Path) -> nbformat.NotebookNode:
    """Execute a notebook and return the executed version."""
    print(f"  Executing {nb_path.name}...")

    with open(nb_path) as f:
        nb = nbformat.read(f, as_version=4)

    ep = ExecutePreprocessor(timeout=600, kernel_name="python3", allow_errors=False)

    try:
        ep.preprocess(nb, {"metadata": {"path": nb_path.parent}})
    except Exception as e:
        print(f"  ⚠️  Execution error in {nb_path.name}: {e}")
        raise

    return nb


def extract_notebook_frontmatter(nb: nbformat.NotebookNode, nb_path: Path) -> dict:
    """Extract or generate frontmatter for a notebook."""
    frontmatter = {
        "title": clean_title(nb_path.name),
        "slug": clean_slug(nb_path.stem),
        "section": get_section_from_path(nb_path),
    }

    order = get_order_from_filename(nb_path)
    if order is not None:
        frontmatter["order"] = order

    # Check first cell for explicit frontmatter
    if nb.cells and nb.cells[0].cell_type == "raw":
        source = nb.cells[0].source.strip()
        if source.startswith("---"):
            try:
                yaml_content = source.split("---")[1]
                explicit = yaml.safe_load(yaml_content)
                if explicit:
                    frontmatter.update(explicit)
            except Exception as e:
                print(f"  ⚠️  Could not parse frontmatter in {nb_path.name}: {e}")

    return frontmatter


def output_to_markdown(output: dict, nb_stem: str, cell_idx: int, out_idx: int) -> str:
    """Convert a cell output to markdown."""
    output_type = output.get("output_type", "")

    if output_type == "stream":
        text = output.get("text", "")
        if text.strip():
            return (
                f'<div class="output-stream">\n\n```\n{text.rstrip()}\n```\n\n</div>\n'
            )
        return ""

    if output_type in ("execute_result", "display_data"):
        data = output.get("data", {})

        if "image/png" in data:
            img_data = data["image/png"]
            img_hash = hashlib.md5(img_data.encode()).hexdigest()[:8]
            img_filename = f"{nb_stem}-{cell_idx}-{out_idx}-{img_hash}.png"
            img_path = ASSETS_DIR / img_filename
            img_path.write_bytes(base64.b64decode(img_data))
            return f'<figure class="output-figure">\n\n![Output](/lesson-assets/{img_filename})\n\n</figure>\n'

        if "image/svg+xml" in data:
            svg = data["image/svg+xml"]
            return f'<figure class="output-figure output-svg">\n\n{svg}\n\n</figure>\n'

        if "text/html" in data:
            html = data["text/html"]
            return f'<div class="output-html">\n\n{html}\n\n</div>\n'

        if "text/plain" in data:
            text = data["text/plain"]
            if re.match(r"^<.+ at 0x[0-9a-f]+>$", text.strip()):
                return ""
            if text.strip():
                return f'<div class="output-text">\n\n```\n{text.rstrip()}\n```\n\n</div>\n'

    if output_type == "error":
        traceback = "\n".join(output.get("traceback", []))
        traceback = re.sub(r"\x1b\[[0-9;]*m", "", traceback)
        return f'<div class="output-error">\n\n```\n{traceback}\n```\n\n</div>\n'

    return ""


def cell_to_markdown(cell: dict, nb_stem: str, cell_idx: int) -> str:
    """Convert a notebook cell to markdown."""
    cell_type = cell.get("cell_type", "")
    source = cell.get("source", "")

    if cell_type == "markdown":
        return source.strip() + "\n\n"

    if cell_type == "raw":
        return ""

    if cell_type == "code":
        parts = []
        tags = cell.get("metadata", {}).get("tags", [])
        hide_input = any(t in tags for t in ["hide-input", "remove-input"])
        hide_output = any(t in tags for t in ["hide-output", "remove-output"])
        hide_cell = any(t in tags for t in ["hide-cell", "remove-cell"])

        if hide_cell:
            return ""

        if not hide_input and source.strip():
            parts.append(f"```python\n{source.rstrip()}\n```\n")

        if not hide_output:
            outputs = cell.get("outputs", [])
            for out_idx, output in enumerate(outputs):
                md = output_to_markdown(output, nb_stem, cell_idx, out_idx)
                if md:
                    parts.append(md)

        return "\n".join(parts) + "\n"

    return ""


def process_notebook(nb_path: Path) -> str:
    """Process a notebook file, executing and converting to markdown."""
    print(f"Processing {nb_path}...")

    nb = execute_notebook(nb_path)
    frontmatter = extract_notebook_frontmatter(nb, nb_path)
    slug = clean_slug(nb_path.stem)

    md_parts = []
    start_idx = 0

    if nb.cells and nb.cells[0].cell_type == "raw":
        source = nb.cells[0].source.strip()
        if source.startswith("---"):
            start_idx = 1

    for idx, cell in enumerate(nb.cells[start_idx:], start=start_idx):
        md = cell_to_markdown(cell, slug, idx)
        if md:
            md_parts.append(md)

    frontmatter_yaml = yaml.dump(
        frontmatter, default_flow_style=False, allow_unicode=True
    )
    content = "".join(md_parts)

    return f"---\n{frontmatter_yaml}---\n\n{content}"


# ============================================================================
# Main
# ============================================================================


def main():
    """Process all content files."""
    print("=" * 60)
    print("Building content")
    print("=" * 60)

    if not CONTENT_DIR.exists():
        print(f"Error: {CONTENT_DIR} not found")
        print(
            f"Create a '{CONTENT_DIR}/' directory with your notebooks and markdown files."
        )
        sys.exit(1)

    setup_output_dirs()

    # Find all content files
    notebooks = list(CONTENT_DIR.glob("**/*.ipynb"))
    notebooks = [nb for nb in notebooks if ".ipynb_checkpoints" not in str(nb)]

    markdown_files = list(CONTENT_DIR.glob("**/*.md"))
    markdown_files = [md for md in markdown_files if not md.name.startswith(".")]

    total_files = len(notebooks) + len(markdown_files)

    if total_files == 0:
        print(f"No content found in {CONTENT_DIR}")
        print("Add .ipynb notebooks or .md files to get started.")
        sys.exit(1)

    print(f"Found {len(notebooks)} notebooks, {len(markdown_files)} markdown files\n")

    success_count = 0
    error_count = 0

    # Process notebooks
    for nb_path in sorted(notebooks):
        try:
            md_content = process_notebook(nb_path)
            output_filename = f"{clean_slug(nb_path.stem)}.md"
            output_path = OUTPUT_DIR / output_filename
            output_path.write_text(md_content, encoding="utf-8")
            print(f"  ✓ {output_path}\n")
            success_count += 1
        except Exception as e:
            print(f"  ✗ Error: {e}\n")
            error_count += 1

    # Process markdown files
    for md_path in sorted(markdown_files):
        try:
            md_content = process_markdown_file(md_path)
            output_filename = f"{clean_slug(md_path.stem)}.md"
            output_path = OUTPUT_DIR / output_filename
            output_path.write_text(md_content, encoding="utf-8")
            print(f"  ✓ {output_path}\n")
            success_count += 1
        except Exception as e:
            print(f"  ✗ Error: {e}\n")
            error_count += 1

    print("=" * 60)
    print(f"Complete: {success_count} succeeded, {error_count} failed")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Assets: {ASSETS_DIR}")
    print("=" * 60)

    if error_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
