1. Install [VSCode](https://code.visualstudio.com/)
2. Clone the repository
3. Create a new Python environment. I recommend using [Conda](https://conda.io/projects/conda/en/latest/user-guide/install/index.html) for this, but you can also use virtualenv. This will protect our system Python installation from any changes we make.
    1. If you're using Conda, you can create a new environment with the following command:
        
        ```
        conda create -n [pick-a-name] python=3.11
        ```
        
4. In VSCode, install `Black Formatter`. Using a consistent formatter will help us keep our code clean and readable and reduce minor changes in our commits. We will use `Black` as our default formatter
5. Join course [Github page](https://github.com/mapping-systems/cdp-mapping-systems). (details to come on whether it's a fork situation or using the github course functionality)