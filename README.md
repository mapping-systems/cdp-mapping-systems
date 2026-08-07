# CDP Mapping Systems

## Ci Song — Final Project: NYC TIME FIELD

- **View the live project:** [NYC TIME FIELD on this repository's GitHub Pages](https://cisanotheraccount.github.io/cdp-mapping-systems_Ci/)
- **Read the project README and browse the source:** [student-projects/Final_Ci_Song_NYC_Time_Field/](student-projects/Final_Ci_Song_NYC_Time_Field/)
- **Review the upstream submission:** [mapping-systems/cdp-mapping-systems#68](https://github.com/mapping-systems/cdp-mapping-systems/pull/68)

The submitted project is on branch [`ci/nyc-time-field`](https://github.com/Cisanotheraccount/cdp-mapping-systems_Ci/tree/ci/nyc-time-field). The project README explains both ways to view it: open the published site immediately, or download the source and run it locally.

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
