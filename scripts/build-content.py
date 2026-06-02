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
from pathlib import Path
import base64
import hashlib
import html as html_module
import re
import yaml
import shutil
import sys

# nbconvert is imported lazily inside execute_notebook() so that no-execute
# builds (the default, used on Cloudflare) don't pay for it. nbconvert pulls
# in jupyter-client and a kernel layer that's only needed when actually
# running notebooks locally.

# ============================================================================
# CONFIGURATION
# ============================================================================

# Student-facing content directory (tracked in git)
CONTENT_DIR = Path("content")

# Generated output (gitignored)
OUTPUT_DIR = Path("src/content/lessons")
ASSETS_DIR = Path("public/lesson-assets")

# Lonboard interactive map HTML output. Committed (not gitignored) so the
# no-execute Cloudflare build can serve them without re-running Python.
# Regenerated on every `--execute` build.
MAPS_DIR = Path("public/maps")

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


def setup_maps_dir_for(lesson_slug: str) -> Path:
    """Clean and create the per-lesson map output directory.

    Called only on `--execute` runs. On no-execute builds the existing
    committed map HTMLs are served as-is.
    """
    lesson_maps_dir = MAPS_DIR / lesson_slug
    if lesson_maps_dir.exists():
        shutil.rmtree(lesson_maps_dir)
    lesson_maps_dir.mkdir(parents=True)
    return lesson_maps_dir


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


def _lonboard_capture_preamble(maps_dir_abs: Path) -> str:
    """Python source injected as the first cell of each notebook before
    execution. Monkey-patches lonboard.Map._repr_mimebundle_ so every Map
    that gets displayed also writes its standalone HTML to disk, indexed
    in display order. The static-site converter reads that same index to
    emit <iframe> embeds. Wrapped in try/except so notebooks that don't
    use lonboard don't break."""
    return (
        "# Auto-injected by build-content.py — capture lonboard maps as HTML.\n"
        "import os as _os\n"
        f"_os.environ['_LONBOARD_HTML_DIR'] = {str(maps_dir_abs)!r}\n"
        "try:\n"
        "    from lonboard._map import Map as _LbMap\n"
        "    _orig_repr = _LbMap._repr_mimebundle_\n"
        "    _lb_counter = [0]\n"
        "    def _wrapped_repr(self, *a, **kw):\n"
        "        idx = _lb_counter[0]\n"
        "        _lb_counter[0] += 1\n"
        "        out_dir = _os.environ['_LONBOARD_HTML_DIR']\n"
        "        _os.makedirs(out_dir, exist_ok=True)\n"
        "        try:\n"
        "            self.to_html(_os.path.join(out_dir, f'map-{idx:03d}.html'))\n"
        "        except Exception as _e:\n"
        "            print(f'[lonboard-capture] failed to save map {idx}: {_e}')\n"
        "        return _orig_repr(self, *a, **kw)\n"
        "    _LbMap._repr_mimebundle_ = _wrapped_repr\n"
        "except ImportError:\n"
        "    pass  # lonboard not in env; nothing to capture\n"
    )


def execute_notebook(nb_path: Path, lesson_slug: str) -> nbformat.NotebookNode:
    """Execute a notebook and return the executed version.

    `lesson_slug` is used to compute the per-lesson maps output dir
    (`public/maps/<slug>/`) which the injected lonboard-capture preamble
    writes to. The preamble cell is prepended before execution and removed
    afterwards so it doesn't appear in the rendered lesson.
    """
    from nbconvert.preprocessors import ExecutePreprocessor

    print(f"  Executing {nb_path.name}...")

    with open(nb_path) as f:
        nb = nbformat.read(f, as_version=4)

    # Lonboard map capture: clean the maps dir for this lesson and prepend
    # a setup cell that registers the to_html() side effect.
    lesson_maps_dir = setup_maps_dir_for(lesson_slug)
    preamble_cell = nbformat.v4.new_code_cell(
        source=_lonboard_capture_preamble(lesson_maps_dir.resolve()),
        metadata={"tags": ["build-injected"]},
    )
    nb.cells.insert(0, preamble_cell)

    ep = ExecutePreprocessor(timeout=600, kernel_name="python3", allow_errors=False)

    try:
        ep.preprocess(nb, {"metadata": {"path": nb_path.parent}})
    except Exception as e:
        print(f"  ⚠️  Execution error in {nb_path.name}: {e}")
        raise
    finally:
        # Drop the injected preamble so the conversion step doesn't see it.
        if nb.cells and nb.cells[0].metadata.get("tags") == ["build-injected"]:
            nb.cells.pop(0)

    # Persist the executed notebook back to disk so the cached widget outputs
    # are committed. Without this, the no-execute build (which Cloudflare
    # runs) wouldn't see the lonboard widget MIME types and would skip the
    # iframe emission — even though the HTML files exist in public/maps/.
    # Memory addresses in text/plain reprs are normalized to keep diffs sane.
    _normalize_text_plain_addresses(nb)
    with open(nb_path, "w", encoding="utf-8") as f:
        nbformat.write(nb, f)

    return nb


_MEM_ADDR_RE = re.compile(r"at 0x[0-9a-fA-F]+")


def _normalize_text_plain_addresses(nb: nbformat.NotebookNode) -> None:
    """Replace `<X at 0xDEADBEEF>` with `<X at 0xMEM>` in text/plain outputs
    so re-execution doesn't churn the .ipynb diff."""
    for cell in nb.cells:
        if cell.get("cell_type") != "code":
            continue
        for out in cell.get("outputs", []):
            data = out.get("data", {})
            if "text/plain" in data:
                tp = data["text/plain"]
                if isinstance(tp, list):
                    data["text/plain"] = [_MEM_ADDR_RE.sub("at 0xMEM", s) for s in tp]
                else:
                    data["text/plain"] = _MEM_ADDR_RE.sub("at 0xMEM", tp)


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


# Markdown processors (Astro's MDX engine in our case) don't handle inline
# <style> or <script> tags gracefully — the `{` characters inside CSS rules
# trip up the parser and the rest of the block leaks out as plain text.
# Strip these (and a couple of other pandas-specific leftovers) before
# embedding cell HTML into a markdown body. Our own CSS in global.css under
# `.output-html table` already styles these blocks consistently.
_STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>.*?</style>", re.IGNORECASE | re.DOTALL)
_SCRIPT_BLOCK_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)
_TABLE_BORDER_ATTR_RE = re.compile(r'(<table\b[^>]*?)\s+border="\d+"', re.IGNORECASE)


def sanitize_html_output(html: str) -> str:
    """Remove tags that fight our renderer or leak as text inside markdown."""
    html = _STYLE_BLOCK_RE.sub("", html)
    html = _SCRIPT_BLOCK_RE.sub("", html)
    html = _TABLE_BORDER_ATTR_RE.sub(r"\1", html)
    return html


# Self-contained HTML cell outputs (folium maps, ipyleaflet, similar) inline
# their entire JS + GeoJSON payload into the lesson markdown. A single
# `.explore()` cell can balloon a lesson page past Cloudflare Workers' 25 MiB
# per-file asset limit. We externalize anything over a threshold to its own
# standalone HTML file under `public/maps/<lesson>/embedded-<hash>.html` and
# replace the inline content with a lazy-loaded iframe — same pattern as
# lonboard.
_EMBED_THRESHOLD = 200 * 1024  # 200 KB
_FOLIUM_IFRAME_RE = re.compile(r'<iframe\s+srcdoc="([^"]*)"[^>]*>', re.DOTALL)


def maybe_externalize_html(html_str: str, state: dict) -> str | None:
    """If `html_str` is a large self-contained interactive viz, save it
    to disk as a standalone HTML file and return iframe markup pointing
    at it. Otherwise return None so the caller inlines it as before.

    Filename is content-hashed so re-runs produce identical files
    (clean git diffs even when build-content is invoked from no-execute).
    """
    if len(html_str) < _EMBED_THRESHOLD:
        return None

    # Folium pattern: `<iframe srcdoc="<entity-encoded full HTML doc>">`.
    # We extract the inner doc and host THAT, not the wrapping iframe.
    m = _FOLIUM_IFRAME_RE.search(html_str)
    if m:
        standalone = html_module.unescape(m.group(1))
    elif re.search(r"<\s*(html|!doctype)\b", html_str[:500], re.IGNORECASE):
        # Already a full HTML doc (some libs emit one directly).
        standalone = html_str
    else:
        # Not recognizable as self-contained — fall back to inline so we
        # don't ship a half-formed file the browser can't render.
        return None

    slug = state["lesson_slug"]
    digest = hashlib.md5(standalone.encode("utf-8")).hexdigest()[:10]
    filename = f"embedded-{digest}.html"
    out_path = MAPS_DIR / slug / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not out_path.exists():
        out_path.write_text(standalone, encoding="utf-8")

    # Surface oversize files: Cloudflare Workers refuses to deploy any asset
    # over 25 MiB. The file is still written + iframed (so authors can preview
    # locally with `astro preview`) but the build will refuse to ship until
    # the source cell is fixed or the asset is moved off Workers static assets.
    size_bytes = out_path.stat().st_size
    if size_bytes > 24 * 1024 * 1024:  # leave 1 MiB of headroom
        print(
            f"  ⚠️  {filename} ({size_bytes / 1024 / 1024:.1f} MiB) exceeds "
            "Cloudflare Workers' 25 MiB per-asset limit. Cell with this output "
            f"in lesson '{slug}' needs to be made smaller "
            "(sample/simplify data, or switch from folium .explore() to "
            "lonboard.Map() which encodes geometries via Arrow ~5x more "
            "compactly), or `public/maps/` needs to be hosted off Workers "
            "static assets (e.g. R2)."
        )

    src = f"/maps/{slug}/{filename}"
    return (
        '<figure class="output-figure output-iframe">\n\n'
        f'<iframe src="{src}" loading="lazy" title="Interactive map" '
        'class="lonboard-frame" width="100%" height="500" '
        'frameborder="0"></iframe>\n\n'
        "</figure>\n"
    )


def is_lonboard_widget(output: dict) -> bool:
    """Heuristic: does this cell output represent a lonboard Map widget?

    The widget MIME (vnd.jupyter.widget-view+json) is shared with many
    anywidget-based libraries, so we additionally check the text/plain
    repr that Jupyter always includes alongside it.
    """
    if output.get("output_type") not in ("execute_result", "display_data"):
        return False
    data = output.get("data", {})
    if "application/vnd.jupyter.widget-view+json" not in data:
        return False
    text = data.get("text/plain", "")
    if isinstance(text, list):
        text = "".join(text)
    return "lonboard" in text


def output_to_markdown(
    output: dict,
    nb_stem: str,
    cell_idx: int,
    out_idx: int,
    state: dict,
) -> str:
    """Convert a cell output to markdown.

    `state` is a mutable dict keyed by 'lonboard_idx' (an in-order counter
    of lonboard map outputs seen in this notebook) and 'lesson_slug' (used
    to compute the iframe src). The counter must match the index the
    in-kernel preamble used when saving HTML files.
    """
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

        # Lonboard interactive map: emit iframe pointing at the standalone
        # HTML the in-kernel preamble dumped during execution. Detect
        # before other handlers so we don't drop into text/html branch.
        if is_lonboard_widget(output):
            idx = state["lonboard_idx"]
            state["lonboard_idx"] += 1
            src = f"/maps/{state['lesson_slug']}/map-{idx:03d}.html"
            return (
                '<figure class="output-figure output-iframe">\n\n'
                f'<iframe src="{src}" loading="lazy" title="Interactive map" '
                'class="lonboard-frame" width="100%" height="500" '
                'frameborder="0"></iframe>\n\n'
                "</figure>\n"
            )

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
            html = sanitize_html_output(data["text/html"])
            # Big self-contained viz (folium, ipyleaflet, etc) — extract
            # to a standalone file + iframe to keep the lesson HTML small
            # enough for Cloudflare Workers' 25 MiB per-file asset limit.
            external = maybe_externalize_html(html, state)
            if external:
                return external
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


def cell_to_markdown(cell: dict, nb_stem: str, cell_idx: int, state: dict) -> str:
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
                md = output_to_markdown(output, nb_stem, cell_idx, out_idx, state)
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

    slug = clean_slug(nb_path.stem)

    if execute:
        nb = execute_notebook(nb_path, slug)
    else:
        with open(nb_path) as f:
            nb = nbformat.read(f, as_version=4)

    frontmatter = extract_notebook_frontmatter(nb, nb_path)

    # State shared with cell_to_markdown / output_to_markdown. The
    # lonboard_idx counter must increment in the same order the in-kernel
    # preamble produced map-NNN.html files during execution.
    state = {"lonboard_idx": 0, "lesson_slug": slug}

    md_parts = []
    start_idx = 0

    if nb.cells and nb.cells[0].cell_type == "raw":
        source = nb.cells[0].source.strip()
        if source.startswith("---"):
            start_idx = 1

    for idx, cell in enumerate(nb.cells[start_idx:], start=start_idx):
        md = cell_to_markdown(cell, slug, idx, state)
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
