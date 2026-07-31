# Run directly in VS Code

## First-time setup

1. Extract the ZIP completely. Do not run the notebook from inside the ZIP preview.
2. Open `Beyond_the_Buffer.code-workspace` in VS Code.
3. Install the recommended Python, Jupyter, Pylance, and Live Server extensions when prompted.
4. Open the VS Code terminal in this project folder.
5. Run one setup command:

### macOS / Linux

```bash
./setup_vscode_mac_linux.sh
```

### Windows

```bat
setup_vscode_windows.bat
```

6. Open `Final_Project_Beyond_the_Buffer_100.ipynb`.
7. Click **Select Kernel** in the upper-right corner and choose **Python (beyond-buffer)**.
8. Click **Run All**. Keep internet access enabled during the first run.

The first run downloads MapPLUTO, New York State retail-store records, and the OpenStreetMap pedestrian graph. Later runs use files cached in `data/`.

## Validate the final submission

After Run All finishes, open the Command Palette and choose:

`Tasks: Run Task` → `Validate final project`

To execute the notebook and validate it in one command, choose:

`Tasks: Run Task` → `Execute notebook and validate`

## Open the web map

After the notebook exports GeoJSON files:

1. Right-click `web/index.html`.
2. Choose **Open with Live Server**.
3. Do not open `index.html` by double-clicking it in Finder or File Explorer, because browsers may block local GeoJSON requests.

## Common fixes

- **Kernel not visible:** reload VS Code, then select `Python (beyond-buffer)`.
- **ModuleNotFoundError:** rerun the setup script and confirm the selected kernel name.
- **API or OSM error:** check internet access and rerun the failed cell. Successfully downloaded files remain cached.
- **Wrong output folder:** open the extracted project folder or the included `.code-workspace` file; the notebook also automatically locates its own project directory.

## Important update for the retail-store API

The earlier notebook used a case-sensitive server query and could return zero records. This version filters Manhattan locally and supports the current `georeference` format. Before the first run of this corrected version, delete the old `data/manhattan_retail_food_stores.geojson` file if it exists, restart the kernel, and click **Run All**.
