# CDP Mapping Systems

Course materials for **CDP Mapping Systems** at Columbia GSAPP's Center for Spatial Research.

## For students

All course content lives in [content/](content/):

- [content/Syllabus/](content/Syllabus/) — syllabus and schedule
- [content/Tutorials/](content/Tutorials/) — Jupyter notebooks worked through in class
- [content/Assignments/](content/Assignments/) — assignment briefs

To run the tutorials locally, see [content/Assignments/00_Getting_Started.md](content/Assignments/00_Getting_Started.md).

## For instructors

The published site is built with Astro. Everything in `src/` is the site; everything in `content/` is the source material that students see and that the build pipeline converts into pages.

```bash
npm install
npm run build:content   # convert content/ notebooks + markdown → src/content/lessons/
npm run dev              # http://localhost:4321
```

### Maintaining course resources

Three external sources feed the site:

- **are.na channels** → `/resources/<slug>` (masonry card grid)
- **GitHub Star Lists** → `/resources/<slug>` (uniform repo card grid)
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
