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

import argparse
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


def section_slug(section: str) -> str:
    """Slugify a section name for URL/filename use."""
    return re.sub(r"[^a-z0-9-]", "-", section.lower()).strip("-") or "misc"


def namespaced_slug(section: str, file_slug: str) -> str:
    """Compose a unique slug like 'tutorials/web-mapping'.

    This prevents collisions between sections that have similarly-named files
    (e.g. an assignment and a tutorial both called 'web-mapping').

    A "section index" file — one whose slug matches the section name (e.g.
    Syllabus/syllabus.md, Tutorials/Tutorials.md) — gets a flat slug so its
    URL collapses from /lessons/syllabus/syllabus to /lessons/syllabus.
    """
    sec = section_slug(section)
    if file_slug == sec:
        return sec
    return f"{sec}/{file_slug}"


def strip_leading_title(body: str, title: str) -> str:
    """Drop the body's first H1 when it duplicates the lesson title.

    Authors typically start each notebook/markdown with `# Some Title`. The
    LessonLayout already renders the title in its header, so we strip the
    duplicate to avoid two stacked H1s.
    """
    body = body.lstrip()
    if not body.startswith("#"):
        return body

    first_line, _, rest = body.partition("\n")
    match = re.match(r"^\s*#\s+(.+?)\s*$", first_line)
    if not match:
        return body

    def normalize(s: str) -> str:
        # Strip a leading numeric prefix like "02." or "00:" or "1 ", then
        # lowercase and collapse to alphanumerics for a lenient match.
        s = re.sub(r"^\s*\d+[\.\-:]?\s*", "", s)
        return re.sub(r"[^a-z0-9]", "", s.lower())

    if normalize(match.group(1)) == normalize(title):
        return rest.lstrip()
    return body


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
# Image asset rewriting (shared by markdown + notebook processing)
# ============================================================================


# Matches markdown image syntax: ![alt](path "optional title")
# Captures: 1=alt, 2=path, 3=optional title (with surrounding quotes preserved separately)
_IMG_PATTERN = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(\s+\"[^\"]*\")?\)")


def _is_external(url: str) -> bool:
    return url.startswith(("http://", "https://", "//", "data:", "/"))


def rewrite_relative_images(body: str, source_dir: Path, section: str) -> str:
    """Find relative image refs, copy the files into ASSETS_DIR, and rewrite paths.

    Files are namespaced under ASSETS_DIR/<section-slug>/ to avoid collisions
    between sections that both have an `images/` directory.
    """
    section_slug = clean_slug(section) or "misc"

    def replace(match: re.Match) -> str:
        alt = match.group(1)
        url = match.group(2)
        title = match.group(3) or ""

        if _is_external(url):
            return match.group(0)

        # Resolve against the source markdown's directory
        resolved = (source_dir / url).resolve()

        if not resolved.exists():
            print(f"  ⚠️  Missing image: {url} (resolved to {resolved})")
            return match.group(0)

        # Build a stable destination path: assets/<section>/<original-relative-url>
        # Use the URL as-is for the relative path so e.g. images/foo/bar.png is preserved.
        dest_rel = Path(section_slug) / url.lstrip("./")
        dest = ASSETS_DIR / dest_rel
        dest.parent.mkdir(parents=True, exist_ok=True)

        if not dest.exists():
            shutil.copy2(resolved, dest)

        new_url = "/lesson-assets/" + dest_rel.as_posix()
        return f"![{alt}]({new_url}{title})"

    return _IMG_PATTERN.sub(replace, body)


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
    section = get_section_from_path(md_path)
    frontmatter = {
        "title": clean_title(md_path.name),
        "slug": namespaced_slug(section, clean_slug(md_path.stem)),
        "section": section,
    }

    # Add order if detectable
    order = get_order_from_filename(md_path)
    if order is not None:
        frontmatter["order"] = order

    # Existing frontmatter overrides defaults
    frontmatter.update(existing_fm)

    # Rewrite relative image references and copy files into public/lesson-assets/
    body = rewrite_relative_images(body, md_path.parent, frontmatter["section"])

    # Drop the leading H1 when it duplicates the title (the layout renders one)
    body = strip_leading_title(body, frontmatter["title"])

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
    section = get_section_from_path(nb_path)
    frontmatter = {
        "title": clean_title(nb_path.name),
        "slug": namespaced_slug(section, clean_slug(nb_path.stem)),
        "section": section,
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


def process_notebook(nb_path: Path, execute: bool = False) -> str:
    """Process a notebook file, optionally executing it before conversion.

    When ``execute`` is False (default), the notebook's cached cell outputs
    are used as-is. This makes builds fast and CI-friendly: authors run the
    notebook locally, save it with outputs, and commit. When ``execute`` is
    True, the notebook is re-run from scratch — useful for full rebuilds and
    for catching code that no longer runs against current data/dependencies.
    """
    print(f"Processing {nb_path}...")

    if execute:
        nb = execute_notebook(nb_path)
    else:
        with open(nb_path) as f:
            nb = nbformat.read(f, as_version=4)

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

    # Rewrite any relative image refs that came from markdown cells
    content = rewrite_relative_images(content, nb_path.parent, frontmatter["section"])

    # Drop the leading H1 when it duplicates the title (the layout renders one)
    content = strip_leading_title(content, frontmatter["title"])

    return f"---\n{frontmatter_yaml}---\n\n{content}"


# ============================================================================
# Main
# ============================================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Re-execute notebooks before conversion. Default uses cached outputs from each .ipynb.",
    )
    return parser.parse_args()


def main():
    """Process all content files."""
    args = parse_args()

    print("=" * 60)
    print("Building content" + (" (with execution)" if args.execute else " (using cached outputs)"))
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
            md_content = process_notebook(nb_path, execute=args.execute)
            section = get_section_from_path(nb_path)
            slug = namespaced_slug(section, clean_slug(nb_path.stem))
            output_path = OUTPUT_DIR / f"{slug}.md"
            output_path.parent.mkdir(parents=True, exist_ok=True)
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
            section = get_section_from_path(md_path)
            slug = namespaced_slug(section, clean_slug(md_path.stem))
            output_path = OUTPUT_DIR / f"{slug}.md"
            output_path.parent.mkdir(parents=True, exist_ok=True)
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
