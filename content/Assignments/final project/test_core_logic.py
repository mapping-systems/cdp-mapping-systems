from itertools import count
import heapq
import math
import networkx as nx
import pandas as pd


def edge_length(graph, u, v):
    data = graph.get_edge_data(u, v)
    if graph.is_multigraph():
        return min(float(attrs.get('length', 1.0)) for attrs in data.values())
    return float(data.get('length', 1.0))


def multi_source_store_dijkstra(graph, stores_frame):
    ordered = stores_frame.copy()
    ordered['_known_sqft'] = ordered['square_footage'].fillna(-1)
    ordered = ordered.sort_values(['snap_distance_m', '_known_sqft'], ascending=[True, False])
    best_distance, nearest_store, toward_store = {}, {}, {}
    queue = []
    serial = count()
    for row in ordered.itertuples():
        node, offset = row.network_node, float(row.snap_distance_m)
        if offset < best_distance.get(node, math.inf):
            best_distance[node] = offset
            nearest_store[node] = row.license_number
            toward_store[node] = None
            heapq.heappush(queue, (offset, next(serial), node, row.license_number))
    while queue:
        distance, _, node, store_license = heapq.heappop(queue)
        if distance > best_distance.get(node, math.inf) + 1e-9:
            continue
        for neighbor in graph.neighbors(node):
            candidate = distance + edge_length(graph, node, neighbor)
            if candidate + 1e-9 < best_distance.get(neighbor, math.inf):
                best_distance[neighbor] = candidate
                nearest_store[neighbor] = store_license
                toward_store[neighbor] = node
                heapq.heappush(queue, (candidate, next(serial), neighbor, store_license))
    return best_distance, nearest_store, toward_store


G = nx.MultiGraph()
G.add_edge(0, 1, length=100)
G.add_edge(1, 2, length=100)
stores = pd.DataFrame([
    {'license_number': 'A', 'network_node': 2, 'snap_distance_m': 20, 'square_footage': 10000},
    {'license_number': 'B', 'network_node': 0, 'snap_distance_m': 50, 'square_footage': 5000},
])

distance, nearest, toward = multi_source_store_dijkstra(G, stores)
origin_snap = 10
assert nearest[1] == 'A', nearest
assert abs(origin_snap + distance[1] - 130) < 1e-9
assert toward[1] == 2

remaining = stores[stores.license_number != 'A']
closure_distance, closure_nearest, _ = multi_source_store_dijkstra(G, remaining)
assert closure_nearest[1] == 'B'
assert abs(origin_snap + closure_distance[1] - 160) < 1e-9

# Door-to-door threshold: A is reachable within 150 m, B is not.
graph_lengths = nx.single_source_dijkstra_path_length(G, 1, cutoff=150, weight='length')
reachable = []
for row in stores.itertuples():
    total = origin_snap + graph_lengths[row.network_node] + row.snap_distance_m
    if total <= 150:
        reachable.append(row.license_number)
assert reachable == ['A'], reachable

print('PASS: corrected multi-source distance, closure rerun, and threshold logic')
