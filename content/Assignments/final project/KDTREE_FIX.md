# Chapter 13 KDTree fix

This version replaces Chapter 13's polygon spatial join and chunked full distance matrix with `scipy.spatial.cKDTree`.

It also replaces the following scatter-plot cell with a VSCode-safe version that saves at 180 DPI and closes the figure after rendering.

Run the project with the `Python (beyond-buffer)` kernel. If the existing environment predates this package, update it with:

```bash
pip install scipy
```
