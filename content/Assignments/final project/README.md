# IMPORTANT: use the sparse-fixed notebook

Open `Final_Project_Beyond_the_Buffer_SPARSE_FIXED.ipynb`. Older notebook names have been removed.

# Beyond the Buffer — VSCode Final Fixed

Open `Beyond_the_Buffer.code-workspace`, select the **Python (beyond-buffer)** kernel, then open `Final_Project_Beyond_the_Buffer_FINAL_FIXED.ipynb` and choose **Restart Kernel and Run All Cells**.

This regeneration fixes the Socrata county query, duplicate geometry rename, CRS alignment, rerun-safe merges, and the Chapter 13 slowdown. Chapter 13 now uses a chunked NumPy distance calculation instead of polygon buffering plus `gpd.sjoin`.

# VS Code-ready package

For the most reliable direct run, open `Beyond_the_Buffer.code-workspace` and follow `RUN_IN_VSCODE.md`. The included Conda environment uses Python 3.12 and registers the notebook kernel as **Python (beyond-buffer)**.

# Beyond the Buffer — 100-Point Submission Version
## Mapping Systems Final Project — Yizhang Mu

### Topic
**Door-to-door food retail accessibility, residential demand, and network resilience in Upper Manhattan.**

This revision fixes the original draft's main methodological weakness and expands the project beyond a one-origin network exercise. It includes:

- proportional allocation of MapPLUTO residential units to H3 cells;
- centroid-versus-proportional allocation diagnostics;
- corrected door-to-door network distance with origin and store snap distances;
- ten-minute access calculated for individual stores rather than store nodes;
- Euclidean-buffer overcount and detour analysis;
- three transparent priority-weight scenarios and rank-stability tests;
- three large-store closure stress tests;
- representative route reconstruction;
- automatically generated findings based on actual outputs;
- saved figures, review tables, GeoJSON, and a MapLibre interface;
- a submission validator.

## Package contents

- `Final_Project_Beyond_the_Buffer_100.ipynb` — final course-style notebook
- `project_diagram.png` / `project_diagram.svg` — required project diagram
- `web/index.html` — MapLibre page structure
- `web/main.js` — interactive map logic
- `web/style.css` — visual presentation
- `web/data/` — populated by the notebook export cell
- `figures/` — created by the notebook
- `tables/` — created by the notebook
- `validate_submission.py` — final artifact checker
- `run_and_validate.sh` — executes the notebook and runs all submission checks
- `STATIC_VALIDATION.md` — checks completed before live GIS execution
- `requirements.txt` — required Python packages

## Run the project

1. Open a terminal in this folder.
2. Activate the course Conda environment used for the tutorials.
3. Install missing packages:

   ```bash
   pip install -r requirements.txt
   ```

4. Open `Final_Project_Beyond_the_Buffer_100.ipynb` in VS Code or Jupyter.
5. Run **all cells from top to bottom** with internet access on the first run.
6. Inspect the allocation residual, snap exclusions, distance-consistency check, extreme cases, and generated findings.
7. Run:

   ```bash
   python validate_submission.py
   ```

8. Or run the automated execution command from the project folder:

   ```bash
   ./run_and_validate.sh
   ```

9. Open `web/index.html` with VS Code Live Server and test every control.
10. Save the executed notebook with all outputs visible before submission.

## Important honesty note

The notebook code and artifact structure have been statically validated in the preparation environment. Live execution requires the course GIS environment because it depends on OSMnx, H3, and online source APIs. A score of 100 cannot be guaranteed by formatting alone; the submitted notebook must contain successful live outputs and the generated findings must be visually checked.

## 中文说明

这是优化后的正式版本。主要修正包括：

- 不再只把住宅地块按中心点放进一个 H3，而是进行面积比例分配；
- 网络距离包含起点和商店到街道节点的距离；
- 十分钟可达性按每一家商店的完整门到门距离计算；
- 增加三套 Priority Index 权重和敏感性比较；
- 增加三种大型商店关闭情景；
- 自动生成真实结果总结、地图、表格和 Web 数据；
- 提供最终提交检查脚本。

运行 Notebook 后，必须确保所有输出都保存，再提交。


## Chapter 13 fast build

Open `Final_Project_Beyond_the_Buffer_CH13_FAST.ipynb`. Chapter 13 uses `cKDTree.sparse_distance_matrix` and NumPy `bincount`; it does not create a Pandas DataFrame inside a per-origin loop. It prints input sizes, pair count, and elapsed seconds, and fails immediately if an upstream merge has exploded.
