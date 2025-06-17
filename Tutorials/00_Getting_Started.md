# 01. Setting up your environment

1. Install [VSCode](https://code.visualstudio.com/)
2. Create a new Python environment. I *strongly* recommend using [Conda](https://conda.io/projects/conda/en/latest/user-guide/install/index.html) for this, but you can also use virtualenv. This will protect our system Python installation from any changes we make.
   - If you're using Conda, you can create a new environment with the following command (with no brackets around the name). You could choose a name like `gis` or `cdp` for example:
      ```
      conda create -n [pick-a-name] python=3.12
      ```
    Be sure to replace `[pick-a-name]` with a name of your choice for the environment. You can activate the environment (with no brackets around the name) with:
      ```
      conda activate [pick-a-name]
      ```
    It is important to do this step before installing any packages, as it ensures that all packages are installed in the new environment rather than the system Python installation.
3. Install the required packages for the course. You can do this by running:
   ```
   pip install -r requirements.txt
   ```
   This will install all the packages listed in the `requirements.txt` file, which includes all the packages we will use in the course. If you open that file, you will see package names and the versions that we will use. This ensures that everyone is using the same versions of the packages, which helps avoid compatibility issues. (This is a primary reason to use a virtual environment, as packages change over time and we want to avoid breaking changes.)

4. In VSCode, install `Ruff`. Ruff is a linter that will help us catch errors in our code and enforce coding standards. It is a fast and efficient linter that works well with Python. You can install it by searching for "Ruff" in the VSCode extensions marketplace.
5. In VSCode, install `Black Formatter`. Using a consistent formatter will help us keep our code clean and readable and reduce minor changes in our commits. We will use `Black` as our default formatter. You can install it by searching for "Black Formatter" in the VSCode extensions marketplace.
6. Make sure that your vscode settings are set to use `Black` as the default formatter. You can do this by adding the following lines to your `settings.json` file:
   ```json
   "[python]": {
        "editor.formatOnType": true,
        "editor.defaultFormatter": "ms-python.black-formatter",
        "editor.formatOnSave": true
    },
    "[jupyter]": {
        "editor.defaultFormatter": "ms-python.black-formatter"
    },
    "notebook.lineNumbers": "on",
    "ruff.importStrategy": "useBundled",
    "black-formatter.importStrategy": "fromEnvironment",
    "notebook.formatOnSave.enabled": true,
    "black-formatter.showNotifications": "always",
    "notebook.formatOnCellExecution": true,
    "notebook.diff.ignoreMetadata": true,
   ```
   This will ensure that your code is automatically formatted with `Black` when you save it, and that `Ruff` is used for linting.