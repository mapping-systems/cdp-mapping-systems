# Getting Started

1. Install [VSCode](https://code.visualstudio.com/)
2. Join course [Github page](https://github.com/mapping-systems/cdp-mapping-systems) using the invitation email. Fork the repository to your account and clone it to your local machine.
3. Create a new Python environment. I recommend using [Conda](https://conda.io/projects/conda/en/latest/user-guide/install/index.html) for this, but you can also use virtualenv. This will protect our system Python installation from any changes we make.

   1. If you're using Conda, you can create a new environment with the following command:

      ```
      conda create -n [pick-a-name] python=3.11
      ```

4. In VSCode, install `Black Formatter`. Using a consistent formatter will help us keep our code clean and readable and reduce minor changes in our commits. We will use `Black` as our default formatter
