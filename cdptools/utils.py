import matplotlib.pyplot as plt
import numpy as np
from shapely import contains_xy, prepare, MultiPoint


def random_points_in_geom(geom, n_points, rng=None, max_batches=100):
    """Return a MultiPoint of n_points sampled uniformly inside geom.

    Designed to be applied row-wise. Uses rejection sampling against the
    bounding box, vectorized per batch, with the oversample factor tuned
    to the geometry's fill ratio so sparse shapes don't loop forever.
    """
    if rng is None:
        rng = np.random.default_rng()
    n_points = int(n_points)
    if geom is None or geom.is_empty or n_points <= 0:
        return MultiPoint()

    minx, miny, maxx, maxy = geom.bounds
    bbox_area = (maxx - minx) * (maxy - miny)
    if bbox_area <= 0:
        return MultiPoint()

    prepare(geom)  # speeds repeated point tests
    fill = max(geom.area / bbox_area, 1e-3)  # acceptance rate estimate

    xs, ys = np.empty(0), np.empty(0)
    for _ in range(max_batches):
        if len(xs) >= n_points:
            break
        need = n_points - len(xs)
        batch = int(np.ceil(need / fill * 1.3)) + 16
        bx = rng.uniform(minx, maxx, batch)
        by = rng.uniform(miny, maxy, batch)
        m = contains_xy(geom, bx, by)
        xs = np.concatenate([xs, bx[m]])
        ys = np.concatenate([ys, by[m]])

    return MultiPoint(np.column_stack([xs[:n_points], ys[:n_points]]))


def set_axis_off():
    """
    Set the default matplotlib settings to turn off axes and ticks.
    This function modifies the global matplotlib configuration to hide axes and ticks
    for all plots created after this function is called.
    """
    # set axis off by default
    plt.rcParams["axes.axisbelow"] = False
    plt.rcParams["axes.axisbelow"] = False
    plt.rcParams["axes.spines.left"] = False
    plt.rcParams["axes.spines.right"] = False
    plt.rcParams["axes.spines.top"] = False
    plt.rcParams["axes.spines.bottom"] = False

    # set tick params off by default
    plt.rcParams["xtick.bottom"] = False
    plt.rcParams["xtick.top"] = False
    plt.rcParams["xtick.labelbottom"] = False
    plt.rcParams["xtick.labeltop"] = False
    plt.rcParams["ytick.left"] = False
    plt.rcParams["ytick.right"] = False
    plt.rcParams["ytick.labelleft"] = False
    plt.rcParams["ytick.labelright"] = False
