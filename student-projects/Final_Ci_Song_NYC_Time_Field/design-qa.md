# Design QA — Compact Neighborhood Ranking

## Comparison target

- Source visual truth: the user-provided 2026-07-31 compact-neighborhood reference screenshot.
- User direction: remove the duplicated Route anatomy panel, retain route detail in the map popup, and replace the remaining Neighborhood field with two sorted side-by-side tables that use substantially less vertical space.
- Source pixels: `1394 × 2322`.
- Source normalized for comparison: `432 × 720`.
- Desktop implementation: `1280 × 720 CSS px`, device scale factor 1.
- Mobile implementation: `390 × 844 CSS px`, device scale factor 1.
- The committed comparison evidence is in `methodology/design-qa-comparison.png`.
- State: Columbia destination, Subway, Weekday AM, 35 minutes, time-remaining height.

## Full-view comparison evidence

- The source dedicates an entire tall glass panel to an empty Route anatomy state.
- The implementation contains no `.route-panel` element and no visible `Route anatomy` heading.
- Neighborhood field now spans the complete results width and contains two parallel tables with six ranked neighborhoods each.
- The desktop ranking panel measures approximately `1232 × 523 px`, including its heading, table headers, and all 12 records.
- The ordering remains explicit: reachable residential share descending, then median modeled commute time ascending.
- The Research anchor now begins below the fixed `68 px` header: section top `83.96 px`, metric strip top `108.96 px`.

## Focused comparison evidence

- Desktop table headers align four stable fields: Rank, Neighborhood, Time, and Reach.
- Each row keeps neighborhood, borough, primary station, median time, reachable range, reachable share, and a proportional share rule.
- At `390 px`, the two tables stack into one `328 px` track; all 12 rows remain available and document width equals the `390 px` viewport.
- The mobile column widths were reduced after the first pass so Neighborhood and Time no longer collide.

## Findings

- No actionable P0, P1, or P2 findings remain.
- No P3 visual issue blocks this scoped simplification.

## Required fidelity surfaces

- Fonts and typography: existing Helvetica/Geist hierarchy, optical weights, muted labels, and monospace data labels remain unchanged. Compact table type retains readable line height and truncates only long secondary labels on narrow screens.
- Spacing and layout rhythm: the approved glass radius, border, padding, and background remain. Six rows per desktop column reduce vertical depth while preserving consistent `58 px` rows.
- Colors and visual tokens: the frosted dark surface, subtle row selection state, blue-to-cream reach indicator, and NYC route background remain unchanged.
- Image quality and asset fidelity: no raster or vector assets were replaced; the single NYC route background and fixed dot texture retain their approved scale and sharpness.
- Copy and content: the redundant Route anatomy copy is removed. Ranking labels now state both the visible top-12 count and the sorting rule.
- Accessibility: two native tables expose column headers; each neighborhood remains a keyboard-operable button. Mobile has no horizontal overflow.

## Primary interactions checked

- Two desktop tables render with row counts `6 + 6`.
- Clicking Morningside Heights creates exactly one selected table row.
- Route anatomy panel and heading are absent.
- Desktop document width equals the `1280 px` viewport.
- Mobile document width equals the `390 px` viewport.
- Existing map popup route-generation code remains intact and was not moved into the deleted results panel.
- Automated model/render suite: 7 tests passed.
- ESLint, TypeScript, and whitespace checks passed.

## Comparison history

### Pass 1

- Removed the Route anatomy panel and converted the 12-item vertical list into two parallel six-row tables.
- Added explicit Rank, Neighborhood, Time, and Reach columns and documented the sort order.

### Pass 2

- Earlier P2: narrow-screen table headers and cells were too close together.
- Fix: reduced mobile Rank, Time, and Reach tracks and compacted cell padding and header tracking.
- Post-fix evidence: `390 × 844` capture with one full-width table track and zero horizontal overflow.

### Pass 3

- Earlier P2: navigating directly to Research allowed the fixed site header to overlap the beginning of the section.
- Fix: added section scroll margins based on the shared header-height token.
- Post-fix evidence: header bottom `68 px`, Research top `83.96 px`, metric strip top `108.96 px`.

## Implementation checklist

- [x] Remove Route anatomy from the results section.
- [x] Preserve popup route detail.
- [x] Keep the top 12 neighborhood ranking.
- [x] Split the ranking into two desktop tables of six rows.
- [x] Preserve deterministic reachable-share and median-time sorting.
- [x] Stack tables on narrow screens.
- [x] Prevent sticky-header and horizontal-overflow regressions.
- [x] Verify interactions, responsive layout, lint, typecheck, and tests.

final result: passed
