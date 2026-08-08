from pathlib import Path

import nbformat


PROJECT_DIR = Path(__file__).resolve().parents[1]
NOTEBOOK_PATH = PROJECT_DIR / "notebooks" / "culture_after_six_analysis.ipynb"


def markdown(text):
    return nbformat.v4.new_markdown_cell(text.strip() + "\n")


def code(text):
    return nbformat.v4.new_code_cell(text.strip() + "\n")


notebook = nbformat.read(NOTEBOOK_PATH, as_version=4)

notebook.cells[0].source = """# Culture After Six NYC

## tl;dr

This project asks: **When is geographic proximity a poor measure of cultural
access, and how do departure time, subway travel, admission, opening hours,
step-free proximity, and personal interest change where someone can actually
go?**

The analytical pilot contains 25 visit profiles with structured weekly hours and
admission rules. The public-use product expands discovery and routing to **161
screened cultural places across all five boroughs**, each with a public address,
description, official website, current-program link, category, source-backed
visit information, and modeled route. One hundred six of those public venues include
structured weekly hours. A separate editorial layer contains **16 date-checked
current programs**.

Within the 25-profile analysis, the median venue is **394 meters from a subway
stop** but **604 meters from an ADA-accessible stop**. Walking-network trips
from Columbia are typically **15% longer than straight-line distance**. In the
example Friday-evening scenario, **9 of 25 pilot venues** are both open and
affordable.

The key finding is not that New York lacks culture. It is that cultural
abundance, geographic proximity, and practical cultural access are different
things.
"""

notebook.cells[1].source = """## Context & Methods

This final expands the **Networks** assignment into a public-facing cultural
access tool. The personal starting point is a common after-class question:
where could a Columbia student realistically go tonight?

### Key Assumptions

- Twenty-five pilot venues support the detailed weekly hours-and-price analysis;
  the larger 161-place product supports routing, discovery, source-backed visit
  information, official links, and personalized recommendations. One hundred six
  public venues have structured weekly hours for arrival-time filtering.
- Subway travel uses a typical weekday MTA GTFS schedule, plus four minutes for
  initial waiting and modeled transfer penalties. It is not live trip planning.
- Up to eight nearby destination stations are compared so the geometrically
  nearest stop does not automatically determine the route.
- Pay-what-you-wish admission is represented as $1 for numeric comparison.
- Public access, addresses, and official links were checked on August 1, 2026.
  Hours, prices, programs, and transit conditions can change.
- Being nearby, open, and affordable still cannot measure whether a space feels
  socially welcoming or whether its programming is culturally relevant.
"""

notebook.cells[3].source = """## Data

The analytical pilot begins with NYC Department of Cultural Affairs data,
DCLA's admission guide, official venue pages, MTA stations and GTFS schedules,
and OpenStreetMap walking paths. The public-use layer was then individually
screened and expanded with additional museums, galleries, cinemas, performance
spaces, cultural centers, archives, artist-run spaces, and community arts
organizations.

Three cultural layers remain distinct:

1. **25 structured weekly profiles** contain regular hours and price rules for
   reproducible time-and-budget analysis.
2. **161 screened public places** contain public addresses, descriptions,
   categories, official websites, program links, admission and opening-schedule
   information, and the fields needed for browser-side route calculation.
   One hundred six have structured weekly schedules.
3. **16 current programs** form a date-checked editorial sample with official
   links and automatic expiration dates.

The larger 2,268-point DCLA coordinate layer remains useful for coverage
analysis, but a directory coordinate may be an office or mailing address and is
not automatically treated as a visitable venue.
"""

notebook.cells[4].source = """venues = gpd.read_file(DATA_DIR / "venues.geojson")
public_places = gpd.read_file(DATA_DIR / "cultural_places.geojson")
stations = gpd.read_file(DATA_DIR / "subway_stations.geojson")
directory = gpd.read_file(DATA_DIR / "dcla_organizations.geojson")
transit_routes = gpd.read_file(DATA_DIR / "columbia_transit_routes.geojson")
current_programs = pd.DataFrame(
    json.loads((DATA_DIR / "current_programs.json").read_text())
)
summary = json.loads((DATA_DIR / "analysis_summary.json").read_text())
subway_network = json.loads((DATA_DIR / "subway_network.json").read_text())

venues["hours"] = venues["hours"].apply(
    lambda value: json.loads(value) if isinstance(value, str) else value
)
venues["access_programs"] = venues["access_programs"].apply(
    lambda value: json.loads(value) if isinstance(value, str) else value
)
venues["data_checked"] = pd.to_datetime(venues["data_checked"]).dt.date

print(f"Screened public places with routes: {len(public_places):,}")
print(f"Full hours-and-price profiles: {len(venues):,}")
print(f"Date-checked current programs: {len(current_programs):,}")
print(f"Geocoded DCLA directory records: {len(directory):,}")
print(f"Subway station records: {len(stations):,}")
print(
    "Station-line network: "
    f"{summary['subway_network_node_count']:,} nodes / "
    f"{summary['subway_network_edge_count']:,} directed edges"
)
print("Public-place data checked: 2026-08-01")
display(
    public_places[
        ["name", "category", "venue_type", "borough", "neighborhood"]
    ].head(8)
)
"""

notebook.cells[17].source = """## Coverage, scale, and data honesty

The full DCLA dataset contains 2,535 funded cultural organizations, including
2,268 records (89.5%) with usable coordinates. That citywide layer is valuable
for understanding institutional concentration, but it does **not** reliably
provide public entrances, current hours, admission, or visitable programming.

The final product therefore uses 161 individually screened public places rather
than showing the full directory as though every record were a destination. All
161 have source-backed admission and opening-schedule information; 106 have
structured weekly hours, and a 25-venue analytical pilot also has detailed
discount rules for reproducible scenario analysis.
For event and screening venues, the honest value is often a schedule or pricing
structure rather than one false fixed ticket price.
"""

notebook.cells[22].source = """## A transparent, personalized access score

The sensitivity analysis below tests the earlier four-component pilot score:
availability, cost, journey, and ADA-station proximity. It demonstrates that
there is no neutral ranking because the same venues move when weights change.

The current public interface extends this logic with a fifth component:
**interest match**. Its default profile weights journey at 35%, interest at 25%,
availability at 20%, cost at 10%, and ADA-station proximity at 10%. A step-free
profile changes those weights, while an optional smaller-space preference
boosts artist-run, nonprofit, residency, and community venues. The interface
exposes these choices instead of presenting one universal ranking.
"""

notebook.cells[24].source = """## Takeaways

1. **Abundance is not access.** The product can route to 161 screened cultural
   places, but route availability alone cannot establish that a venue is open,
   affordable, or socially welcoming.
2. **Hours are a structural barrier.** Several free or suggested-admission
   pilot venues close by 5 or 6 PM, reducing after-work and after-class access.
3. **Price programs can reverse the map.** Weekly free nights can make a
   normally expensive institution more practical than a low-cost venue that is
   already closed.
4. **The nearest station is not always the best station.** Comparing multiple
   destination stations avoids routes with unnecessary transfers.
5. **ADA access changes proximity.** The median nearest-station walk rises from
   394 to 604 meters when the destination station must be ADA-accessible.
6. **Rankings are choices.** Journey, interest, availability, cost, mobility,
   and preference for smaller spaces produce different recommendation orders.
7. **Current programming needs provenance.** The 16-program editorial sample
   links to official pages and expires by date rather than pretending to be an
   error-free live ticket feed.
8. **Coverage must remain visible.** The 161-place public layer, the 25-profile
   analytical layer, and the 2,268-point directory answer different questions.

### What this analysis cannot tell us

The data cannot measure how welcoming a venue feels, cultural relevance,
language access, crowding, personal safety, event sellouts, or full physical
accessibility. The network excludes live service changes, elevator outages,
buses, ferries, and platform-level paths. Official event pages and real-world
directions remain necessary for confirmation.
"""

product_extension_cells = [
    markdown("""## Public-use product extension

The final interface turns the analytical method into an everyday cultural
planner. Before treating the expanded layer as usable, the checks below verify
that every record has the core public information required by the product and
that every current program resolves to a known venue.
"""),
    code("""required_public_fields = [
    "id",
    "name",
    "category",
    "venue_type",
    "borough",
    "neighborhood",
    "description",
    "address",
    "website",
    "events_url",
    "schedule_type",
    "hours_label",
    "admission_label",
    "visit_source",
    "visit_checked",
]

missing_by_field = public_places[required_public_fields].isna().sum()
duplicate_ids = int(public_places["id"].duplicated().sum())
unknown_program_venues = sorted(
    set(current_programs["venue_id"]) - set(public_places["id"])
)
public_structured_hours = int(public_places["hours"].notna().sum())

product_checks = pd.Series(
    {
        "screened public places": len(public_places),
        "public structured weekly schedules": public_structured_hours,
        "analytical pilot profiles": len(venues),
        "date-checked current programs": len(current_programs),
        "missing required public fields": int(missing_by_field.sum()),
        "duplicate place ids": duplicate_ids,
        "programs with unknown venue ids": len(unknown_program_venues),
    },
    name="value",
).to_frame()
display(product_checks)

assert len(public_places) == 161
assert public_structured_hours == 106
assert len(venues) == 25
assert len(current_programs) == 16
assert missing_by_field.sum() == 0
assert duplicate_ids == 0
assert not unknown_program_venues

category_counts = public_places["category"].value_counts().sort_values()
category_colors = {
    "Art & Exhibitions": GREEN,
    "Museums & Heritage": "#7259C8",
    "Performance & Music": CORAL,
    "Film & Media": BLUE,
    "Cultural Centers": "#DC4F86",
    "Design, Books & Architecture": "#D8A624",
    "Community Arts": "#25889A",
}

fig, ax = plt.subplots(figsize=(10, 6.2))
bars = ax.barh(
    category_counts.index,
    category_counts.values,
    color=[category_colors.get(label, GREEN) for label in category_counts.index],
)
ax.bar_label(bars, padding=5, fontsize=10)
ax.set_title("The 161-place public layer includes seven cultural categories", loc="left", pad=14)
ax.set_xlabel("Screened public places")
ax.spines[["top", "right", "left"]].set_visible(False)
ax.grid(axis="x", color="#DDDCD5", linewidth=0.8)
ax.set_axisbelow(True)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "10_public_place_categories.png", dpi=180, bbox_inches="tight")
plt.show()
"""),
    markdown("""The expanded layer is intentionally broader than a museum
directory. Art and exhibition spaces are the largest category, but film,
performance, design and books, cultural centers, community arts, and heritage
venues remain visible. This diversity is also why personalization matters: one
global ranking would treat very different cultural intentions as equivalent.

The zero-missing-field and zero-unmatched-program checks support the interface
handoff. They do not predict daily schedule changes, event sellouts, or live
transit conditions; official program links remain attached for confirmation.
"""),
]

existing_extension_index = next(
    (
        index
        for index, cell in enumerate(notebook.cells)
        if cell.cell_type == "markdown"
        and cell.source.startswith("## Public-use product extension")
    ),
    None,
)
if existing_extension_index is not None:
    existing_sources_index = next(
        index
        for index, cell in enumerate(notebook.cells)
        if index > existing_extension_index
        and cell.cell_type == "markdown"
        and cell.source.startswith("## Sources")
    )
    del notebook.cells[existing_extension_index:existing_sources_index]

source_index = next(
    index
    for index, cell in enumerate(notebook.cells)
    if cell.cell_type == "markdown" and cell.source.startswith("## Sources")
)
notebook.cells[source_index:source_index] = product_extension_cells

source_cell = next(
    cell
    for cell in notebook.cells
    if cell.cell_type == "markdown" and cell.source.startswith("## Sources")
)
source_cell.source = """## Sources

- [NYC DCLA Cultural Organizations](https://data.cityofnewyork.us/Recreation/DCLA-Cultural-Organizations/u35m-9t32)
- [NYC DCLA Free and Suggested Admission](https://www.nyc.gov/site/dcla/resources/free-and-suggested-admission.page)
- [MTA Subway Stations](https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f)
- [MTA Static GTFS](https://data.ny.gov/Transportation/MTA-General-Transit-Feed-Specification-GTFS-Static/fgm6-ccue)
- [OpenStreetMap](https://www.openstreetmap.org/) walking network via OSMnx
- Individually screened venue sources are stored in
  `data/curated_places.json`.
- Current program records and official event links are stored in
  `data/current_programs.json`.
"""

nbformat.validate(notebook)
nbformat.write(notebook, NOTEBOOK_PATH)
print(f"Updated {NOTEBOOK_PATH} with {len(notebook.cells)} cells")
