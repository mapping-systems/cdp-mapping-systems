#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

NOTEBOOK="Final_Project_Beyond_the_Buffer_100.ipynb"

jupyter nbconvert \
  --to notebook \
  --execute "$NOTEBOOK" \
  --inplace \
  --ExecutePreprocessor.timeout=3600 \
  --ExecutePreprocessor.allow_errors=False

python validate_submission.py

echo "Notebook executed, outputs saved, and submission checks passed."
