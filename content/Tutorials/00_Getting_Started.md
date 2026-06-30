# 01. Setting up your environment

1. Install an IDE. [VSCode](https://code.visualstudio.com/) is a recommended and is popular choice, allowing flexibility with a robust plugin ecosystem.
2. Create a new Python environment. I *strongly* recommend using [Conda or Miniconda](https://www.anaconda.com/download/success?reg=skipped)  for this, but you can also use virtualenv. This will protect our system Python installation from any changes we make.
   - If you're using Conda, you can create a new environment with the following command (with no brackets around the name). You could choose a name like `gis` or `cdp` for example:
      ```
      conda create -n [pick-a-name] python=3.14 pip
      ```
    Be sure to replace `[pick-a-name]` with a name of your choice for the environment. You can activate the environment (with no brackets around the name) with:
      ```
      conda activate [pick-a-name]
      ```
    It is important to do this step before installing any packages, as it ensures that all packages are installed in the new environment rather than the system Python installation.
3. Install the required packages for the course. You can do this by running the following command in your terminal from the root of the repository:
   ```
   pip install -r requirements.txt && pip install -e .
   ```
   This is a two-part command (joined together by the `&&`). The first part installs all the packages listed in the `requirements.txt` file, which includes all the packages we will use in the course. The second part installs the current package in editable mode, allowing you to make changes to the code and have them immediately reflected without reinstalling. This ensures that everyone is using the same versions of the packages, which helps avoid compatibility issues. (This is a primary reason to use a virtual environment, as packages change over time and we want to avoid breaking changes, **and** your system Python installation remains untouched in case it requires other versions of packages). The second part allows us to continue to add to the `cdptools` package (in the repo root) as we go through the course, and have those changes immediately available in our environment. We will be adding to the `cdptools` package throughout the course, and this setup allows us to do that without having to reinstall the package every time we make a change.

4. In VSCode, install `Ruff`. Ruff is a linter that will help us catch errors in our code and enforce coding standards. It is a fast and efficient linter that works well with Python. You can install it by searching for "Ruff" in the VSCode extensions marketplace.
5. In VSCode, install `Black Formatter`. Using a consistent formatter will help us keep our code clean and readable and reduce minor changes in our commits. We will use `Black` as our default formatter. You can install it by searching for "Black Formatter" in the VSCode extensions marketplace.
6. Make sure that your vscode settings are set to use `Black` as the default formatter. You can do this by adding the following lines to your `settings.json` file in the root of the repository (you can access this file by going to `Code > Preferences > Settings` and then clicking on the `{}` icon in the top right corner to open the `settings.json` file):
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