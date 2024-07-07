# CDP Mapping Systems Summer 2024

Repository for CDP Mapping Systems summer 2024 course

## Important Links

- [Syllabus](Syllabus/syllabus.md): this is the source of truth for the course. It contains the schedule, learning objectives, and other important information.
- [Assignment Descriptions](Assignment_Descriptions): this folder contains the descriptions for all assignments in the course.
- [Assignments](Assignments): You will submit your assignments here, based on the assignment descriptions.
- [Tutorial Notebooks](Tutorials): this folder contains the tutorial notebooks for the course. These are the notebooks that we will work through in class.

## Getting started

1. Install [VSCode](https://code.visualstudio.com/)
2. Join course [Github page](https://github.com/mapping-systems/cdp-mapping-systems) from the invitation email I send. Fork the repository to your account and clone it to your local machine.
3. Create a new Python environment. I recommend using [Conda](https://conda.io/projects/conda/en/latest/user-guide/install/index.html) for this, but you can also use virtualenv. This will protect our system Python installation from any changes we make.
   1. If you're using Conda, you can create a new environment with the following command:
      ```
      conda create -n [pick-a-name] python=3.12
      ```
4. In VSCode, install `Black Formatter`. Using a consistent formatter will help us keep our code clean and readable and reduce minor changes in our commits. We will use `Black` as our default formatter
