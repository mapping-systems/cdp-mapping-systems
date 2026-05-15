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

Two external sources are pulled into the site as part of the build:

- **are.na channels** → rendered as `/resources/<slug>` pages
- **Zotero collection** → rendered as the `/bibliography` page (Chicago Author-Date)

Configure both in [resources.config.ts](resources.config.ts). Auth is optional and only needed for private libraries — see [.env.example](.env.example).

To refresh resources from the latest external state and commit the result:

```bash
npm run build:resources   # fetch arena + zotero
git add src/content/resources/ src/data/zotero.json
git commit -m "refresh: arena + zotero"
```

Refresh whenever you add to the are.na channel or update the Zotero collection. Cloudflare doesn't fetch — it just serves what's been committed.

To refresh just one source:

```bash
npm run build:arena
npm run build:zotero
```
