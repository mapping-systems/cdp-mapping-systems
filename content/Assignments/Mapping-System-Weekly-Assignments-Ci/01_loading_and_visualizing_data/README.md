# Assignment 01 — Loading and Visualizing Data

## View the code and executed results on GitHub

**[Open the executed Jupyter Notebook](assignment01_nyc_rent_analysis.ipynb)**

That Notebook is the primary assignment. Like the course's Python Tutorials, it
contains the narrative, all Python code cells, validation tables, and saved
outputs in one GitHub-renderable file. GitHub displays the recorded execution;
it does not rerun the code when the page opens.

## Question and observed result

How did median asking rent and rental inventory change across New York City's
five boroughs from July 2016 through June 2026?

| Borough | July 2016 rent | June 2026 rent | Nominal growth | Inventory change |
|---|---:|---:|---:|---:|
| Manhattan | $3,400 | $4,965 | 46.0% | -31.6% |
| Brooklyn | $2,699 | $3,900 | 44.5% | +5.2% |
| Queens | $2,305 | $3,350 | 45.3% | +15.3% |
| Bronx | $1,700 | $2,995 | 76.2% | +42.2% |
| Staten Island | $2,050 | $3,300 | 61.0% | -24.0% |

The executed Notebook directly renders the borough map, the monthly timeline,
indexed rent/inventory paths, endpoint comparisons, year-over-year
distributions, and within-borough relationship plots. See the
[data dictionary and evidence limits](DATA_DICTIONARY.md) for field definitions.

## What the code does

The executed Notebook loads the frozen 600-row table, validates five boroughs ×
120 continuous months, derives endpoint change and baseline indices, dissolves
the reference geometry by borough, and produces both map and non-map
visualizations. It also displays the Lonboard layer when run locally. Because
GitHub does not run custom widgets, the directly plotted GeoPandas map remains
visible in the committed execution while the interactive widget state is not
committed.

## Reproduce

```bash
python build_notebook.py
```

The command rebuilds the Notebook with the current Python environment, executes
every code cell, and checks that none was skipped or errored. No registered
kernel named `cdp` or machine-specific absolute input path is required.

Inputs and machine-readable outputs:

- [Frozen monthly asking-rent table](../data/source/nyc_rent_monthly.csv)
- [Derived borough summary](outputs/borough_change_summary.csv)
- [Derived monthly table](outputs/nyc_rent_monthly_derived.csv)
- [Mapped borough output](outputs/borough_rent_growth.geojson)

StreetEasy asking rent describes advertised listings rather than rent paid by
all tenants. Dollar values are nominal, rental inventory is a platform listing
sample, and every relationship shown here is descriptive rather than causal.
