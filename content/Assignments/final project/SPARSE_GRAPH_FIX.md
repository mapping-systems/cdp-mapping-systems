# Sparse graph runtime fix

The previous project repeatedly ran NetworkX Dijkstra for every unique H3 origin, which could occupy the kernel for more than 30 minutes. Chapter 12 now:

- builds one directed SciPy CSR graph using minimum parallel-edge lengths;
- processes unique origin nodes in batches of 24;
- retains only distances to unique store nodes;
- prints batch progress and elapsed time;
- stops on abnormal input sizes;
- caches results to `data/chapter12_network_access.csv`;
- keeps Chapter 13 as a single-threaded cKDTree query.

Open `Final_Project_Beyond_the_Buffer_SPARSE_FIXED.ipynb` and use **Restart Kernel and Run All Cells**.
