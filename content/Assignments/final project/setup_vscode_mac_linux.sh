#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v conda >/dev/null 2>&1; then
  echo "Conda/Miniconda is required. Install it, reopen the terminal, and run this script again."
  exit 1
fi
conda env update -f environment.yml --prune
conda run -n beyond-buffer python -m ipykernel install --user --name beyond-buffer --display-name "Python (beyond-buffer)"
echo "Setup complete. In VS Code choose the kernel: Python (beyond-buffer)."
