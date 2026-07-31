@echo off
cd /d %~dp0
where conda >nul 2>nul
if errorlevel 1 (
  echo Conda or Miniconda is required. Install it, reopen this terminal, and run again.
  exit /b 1
)
call conda env update -f environment.yml --prune
call conda run -n beyond-buffer python -m ipykernel install --user --name beyond-buffer --display-name "Python (beyond-buffer)"
echo Setup complete. In VS Code choose the kernel: Python (beyond-buffer).
