# CDP Mapping Systems

Course materials for **CDP Mapping Systems** at Columbia GSAPP's Computational Design Practices program.

All course content lives in [content/](content/) and is available at the [course website](https://mappings-systems.org):

- [content/Syllabus/](content/Syllabus/) — syllabus and schedule
- [content/Tutorials/](content/Tutorials/) — Jupyter notebooks worked through in class
- [content/Assignments/](content/Assignments/) — assignment briefs

To run the tutorials locally, see [content/Assignments/00_Getting_Started.md](content/Assignments/00_Getting_Started.md).

### Maintaining course resources

Three external sources feed the site:

- **are.na channels** → `/resources/<slug>` (masonry card grid)
- **GitHub Star Lists** → `/resources/<slug>` (repo card grid)
- **Zotero collection** → `/bibliography` (Chicago Author-Date, with sub-collection sections and search)

Configure all three in [resources.config.ts](resources.config.ts). Credentials live in `.env` (gitignored) — copy [.env.example](.env.example) to get started. Are.na and Zotero public sources work unauthenticated; GitHub Lists always need a token (`GITHUB_TOKEN=$(gh auth token)` is the quickest path).

To refresh and commit:

```bash
npm run build:resources   # fetch arena + github + zotero
git add src/content/resources/ src/data/
git commit -m "refresh: resources"
git push
```

Cloudflare doesn't fetch from any of these — it just serves what's committed. Refresh whenever you add to a channel, list, or Zotero collection.

To refresh one source at a time:

```bash
npm run build:arena
npm run build:github
npm run build:zotero
```

### Inline citations

In any lesson markdown (.md file or notebook markdown cell), write pandoc-style citations using the Zotero **BibTeX citation key** as the identifier:

```markdown
A foundational text on cartographic semiotics [@bertinSemiologyGraphicsDiagrams2011]
sets the visual variables we still use today.
```

This renders as `(Bertin 2011)`, linked to `/bibliography#bib-bertinSemiologyGraphicsDiagrams2011`. Clicking the citation lands on the matching entry on the bibliography page; if the page's tag/search filter is active and would have hidden the entry, the filter clears so the entry is visible, and the entry briefly highlights.

**The citation key comes from Zotero**, not the alphanumeric "Item Key". To find or set it: open the item in Zotero, look in the right-hand metadata panel for the **Citation Key** field. Patterns like `surnameTitlefragmentYear` (e.g., `bertinSemiologyGraphicsDiagrams2011`) are typical; the Better BibTeX plugin generates these automatically.

Tokens inside fenced code blocks (` ``` `) and inline code spans (`` ` ``) are left verbatim so you can quote the syntax in docs.

If you type a key that doesn't exist in `src/data/zotero.json`, the build prints a warning naming the lesson and the unknown key, and renders the token as `[?@unknown_key]` (visibly broken) so it's easy to spot and fix.

Existing prose reading-list entries (e.g., the per-week reading lists in the syllabus) are not affected — the new syntax is additive. Use it wherever you want a compact inline pointer; keep full prose references where you want them.
