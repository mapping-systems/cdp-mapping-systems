# Assignment 04 — Networks

## Close Is Not the Same as Reachable

This notebook compares Euclidean distance and walking-network distance from
Avery Hall to selected small urban refuge spaces.

## Teacher-method alignment

The notebook follows the course tutorial's OSMnx workflow:

- `ox.graph_from_point()`
- `ox.graph_to_gdfs()`
- `ox.distance.nearest_nodes()`
- `ox.shortest_path(..., weight="length")`
- `ox.plot_graph_route()`
- `ox.routing.route_to_gdf()`
- `DataFrame.apply()`
- `pd.concat()`

## Run

The OSMnx graph must be downloaded from OpenStreetMap, so the notebook needs an
internet connection during the first full run.

In VS Code or Jupyter:

1. Open `04_networks_small_refuges_teacher_method.ipynb`
2. Select the Python environment used for class
3. Run the install cell only if packages are missing
4. Choose **Restart Kernel and Run All**
5. Save the completed notebook

The first OSMnx download can take several minutes.

## Files

- `04_networks_small_refuges_teacher_method.ipynb`
- `data/small_refuges.geojson`
- `requirements.txt`
