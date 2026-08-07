# Final reflection

NYC TIME FIELD began with a simple interaction: pick a destination and ask what
fits inside a fixed commute budget. Building the model showed that the answer
changes with the mode. Street access, station entrances, headways, express
patterns, one-way roads, and water barriers all reshape the same thirty minutes.

The project’s main contribution is explanatory rather than predictive. It lets
the reader switch directly between subway, walking, and free-flow driving.
Travel mode controls color and reach. A separate control changes 3D height
between the remaining time budget and an H3-level ACS rent estimate, preventing
housing context from being confused with travel time.

Residential weighting also changed the interpretation. A neighborhood is not
called reachable because its centroid happens to fall inside a polygon. Its
share is calculated from the residential units represented by reachable H3
cells, while the interface still shows the spread of modeled times.

The model remains partial. Scheduled headways are not reliability, free-flow
road speed is not a lived driving trip, ACS rent is not asking rent, MapPLUTO
is not lived housing experience, and walking speed is not the same for every
body. A next version should add accessibility-aware routing, observed transit
reliability, traffic and parking, and licensed asking-rent data while preserving
the current transparency about assumptions.
