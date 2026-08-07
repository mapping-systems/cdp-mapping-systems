"""Execute the assignment notebook without opening Jupyter kernel sockets."""

from __future__ import annotations

import traceback
from pathlib import Path

import matplotlib
import nbformat as nbf
from IPython.utils.capture import capture_output
from ipykernel.zmqshell import ZMQInteractiveShell
from matplotlib_inline.backend_inline import configure_inline_support


HERE = Path(__file__).resolve().parent
NOTEBOOK_PATH = HERE / "02_route_wifi_geoprocessing.ipynb"


def execute_notebook() -> None:
    """Run code cells in one IPython process and store notebook-compatible outputs."""
    notebook = nbf.read(NOTEBOOK_PATH, as_version=4)
    shell = ZMQInteractiveShell.instance()

    matplotlib.use("module://matplotlib_inline.backend_inline")
    configure_inline_support(shell, "inline")

    execution_count = 0
    for cell in notebook.cells:
        if cell.cell_type != "code":
            continue

        execution_count += 1
        cell.execution_count = execution_count
        cell.outputs = []

        with capture_output(display=True) as captured:
            result = shell.run_cell(cell.source, store_history=False)

        if captured.stdout:
            cell.outputs.append(nbf.v4.new_output("stream", name="stdout", text=captured.stdout))
        if captured.stderr:
            cell.outputs.append(nbf.v4.new_output("stream", name="stderr", text=captured.stderr))
        for rich_output in captured.outputs:
            cell.outputs.append(
                nbf.v4.new_output(
                    "display_data",
                    data=dict(rich_output.data),
                    metadata=dict(rich_output.metadata),
                )
            )

        error = result.error_before_exec or result.error_in_exec
        if error is not None:
            formatted = traceback.format_exception(type(error), error, error.__traceback__)
            cell.outputs.append(
                nbf.v4.new_output(
                    "error",
                    ename=type(error).__name__,
                    evalue=str(error),
                    traceback=[line.rstrip("\n") for line in formatted],
                )
            )
            nbf.write(notebook, NOTEBOOK_PATH)
            raise RuntimeError(f"Notebook execution failed in code cell {execution_count}") from error

    nbf.write(notebook, NOTEBOOK_PATH)
    print(f"Executed {execution_count} code cells and wrote {NOTEBOOK_PATH}")


if __name__ == "__main__":
    execute_notebook()
