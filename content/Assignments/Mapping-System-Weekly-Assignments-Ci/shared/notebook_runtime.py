"""Run generated notebooks with the Python interpreter invoking the builder."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def current_python_kernel() -> Iterator[tuple[str, dict[str, str]]]:
    """Expose a temporary Jupyter kernel that points at ``sys.executable``.

    This keeps the builders portable across Conda and virtual environments. A
    reviewer does not need to register an environment with the literal name
    ``cdp`` before running the notebooks.
    """

    with tempfile.TemporaryDirectory(prefix="mapping-systems-kernel-") as temporary:
        root = Path(temporary)
        data_dir = root / "jupyter-data"
        config_dir = root / "jupyter-config"
        runtime_dir = root / "jupyter-runtime"
        kernel_name = "mapping-systems-current-python"
        kernel_dir = data_dir / "kernels" / kernel_name
        kernel_dir.mkdir(parents=True)
        config_dir.mkdir()
        runtime_dir.mkdir()
        (kernel_dir / "kernel.json").write_text(
            json.dumps(
                {
                    "argv": [
                        sys.executable,
                        "-m",
                        "ipykernel_launcher",
                        "-f",
                        "{connection_file}",
                    ],
                    "display_name": "Python (current environment)",
                    "language": "python",
                    "metadata": {"debugger": True},
                }
            ),
            encoding="utf-8",
        )

        environment = os.environ.copy()
        environment.update(
            {
                "JUPYTER_CONFIG_DIR": str(config_dir),
                "JUPYTER_DATA_DIR": str(data_dir),
                "JUPYTER_RUNTIME_DIR": str(runtime_dir),
                "JUPYTER_PATH": os.pathsep.join(
                    filter(None, [str(data_dir), environment.get("JUPYTER_PATH")])
                ),
                "PATH": os.pathsep.join(
                    [str(Path(sys.executable).parent), environment.get("PATH", "")]
                ),
            }
        )
        yield kernel_name, environment
