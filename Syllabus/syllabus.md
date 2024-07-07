# Mapping Systems Summer 2024

Tuesday and Thursdays, 6-8pm @ 300 Buell South

Instructor: Mario Giampieri (mag2382@columbia.edu)

## Introduction

_Mapping Systems_ will introduce CDP students to programming concepts and methods for spatial analysis, as well as their role in the production and interpretation of spatial data.

The course will focus on building proficiency in Python-based workflows focused on finding, describing, and visualizing spatial data; manipulating and drawing meaning from data layers; understanding distance and spatial relatedness; and measuring change over time. While a primary goal of this course is to introduce students to practical tools and workflows and build fluency in their use, the course will also introduce students to some historical and conceptual context, as well as case studies.

The course will require students to complete exercises to gain proficiency in spatial analytic tools in service of being able to use said tools in their computational design practice.

## Learning Objectives

At the most basic level, the goal of this class is to introduce students to mapping in Python and demonstrate how to explore, analyze, and visualize spatial data. By the end of the course, students should be able to:

- Load, explore, and visualize spatial data in Python
- Understand and apply basic geoprocessing techniques
- Measure distance and spatial relatedness
- Analyze change over time

Furthermore, students should develop a deeper understanding of how spatial data is used in decision-making, and challenges associated with using data to inform arguments (agency in mapping; objective vs subjective / abstract vs experiential).

## Course Organization / Communication

Class meets on Tuesdays and Thursday in 300 Buell South from 6-8pm. Weeks will generally be organized as follows:
**Tuesday**: Lecture, reading discussion, review of technical concepts
**Thursday**: Tutorials, desk crits for exercises and colloquium final project

Conversation topics that pertain to the entire class, such as meeting time/location or technical difficulties / troubleshooting can live in the course Discord channel. All other questions can be sent to me directly via email at mag2382@columbia.edu.

All slides and tutorials will be posted to the course's [Github repository](https://github.com/mapping-systems/cdp-mapping-systems). All exercises will be saved and managed via Github (details below).

## Office Hours

Office hours are by appointment, and preferable on Tuesday or Thursdays before or after class. Email me to schedule a time to chat.

## Schedule

### Week 01

Getting started- IDE, environment, loading and visualizing data

#### Class 01: Introductions

- Introductions, review of syllabus
- Orientation to course Github
- A brief history of GIS + computer mapping
- Projections
- Vector data types

  **Exercise** [Getting Started](/Assignment_Descriptions/00_Getting_Started.md) (to be completed by next class)

  **Readings**

  - (optional) Edwards, P.N., 2010. Introduction, in: A Vast Machine: Computer Models, Climate Data, and the Politics of Global Warming. The MIT Press.

#### Class 02: Loading, exploring, visualizing data (Tutorial)

- Finding open data for NYC
- Explore spatial and non-spatial attributes of tax lot dataset, MapPLUTO
- Create static and interactive visualizations of dataset
- Saving data

  **Exercise:** [01_Loading and visualizing data](/Assignment_Descriptions/01_Loading_Visualizing.md)

### Week 02

Geoprocessing / vector data analysis basics using `geopandas`, `pyogrio`, `pandas`, `matplotlib`, and `lonboard`

#### Class 03: Why we map

- Mapping as creative process, critical practice, and counter-narrative
- Case study: Environmental Justice in New York City and New York State

  **Readings**:

  - Miller, H.J., 2004. Tobler’s First Law and Spatial Analysis. Annals of the Association of American Geographers 94, 284–289.
  - Wilson, M.O., 2018. The Cartography of W.E.B. Dubois’ Color Line, in: Batlle-Baptiste, W., Rusert, B. (Eds.), WEB Du Bois’s Data Portraits: Visualizing Black America. Princeton Architectural Press.
  - (optional) Entrikin, J.N., 1991. The Betweenness of Place, in: Entrikin, J.N. (Ed.), The Betweenness of Place: Towards a Geography of Modernity. Macmillan Education UK, London, pp. 6–26. [https://doi.org/10.1007/978-1-349-21086-2_2](https://doi.org/10.1007/978-1-349-21086-2_2)
  - (optional) Maantay, J., Ziegler, J., 2006. Spatial Data and Basic Mapping Concepts, in: GIS for the Urban Environment.
  - (optional) Corner, J., 2011. The Agency of Mapping: Speculation, Critique and Invention, in: Dodge, M., Kitchin, R., Perkins, C. (Eds.), The Map Reader. Wiley, pp. 89–101. [https://doi.org/10.1002/9780470979587.ch12](https://doi.org/10.1002/9780470979587.ch12)

#### Class 04: Geoprocessing (Tutorial)

- Manipulate, reshape, and combine datasets together using spatial and non-spatial characteristics using `geopandas` and `shapely`

  **Exercise:** [02_Geoprocessing](/Assignment_Descriptions/02_Geoprocessing.md)

### Week 03

Ways to think about and measure distance and spatial relatedness

#### Class 05: Distance, Adjacency, Networks

- Euclidean and network distance
- Introduction to graph theory
- Different kinds of adjacency
- Case study: CitiBike usage before and during the COVID-19 pandemic

  **Readings**:

  - Barabási, A.-L., 2016. Graph Theory, in: Network Science. Cambridge University Press, Cambridge, United Kingdom.
  - Xin, R., Ai, T., Ding, L., Zhu, R., Meng, L., 2022. Impact of the COVID-19 pandemic on urban human mobility - A multiscale geospatial network analysis using New York bike-sharing data. Cities 126, 103677. [https://doi.org/10.1016/j.cities.2022.103677](https://doi.org/10.1016/j.cities.2022.103677)

#### Class 06: Measuring Distance (Tutorial)

- Introduce `osmnx`, `networkx`, `libpysal`, `h3` to calculate distance from Avery to local points of interest
- **Desk crits** on final colloquium projects

  **Exercise:** [03_Networks](/Assignment_Descriptions/03_Networks.md)

### Week 04

Raster analysis, STAC specification, change over time

#### Class 07: Measuring Change

- Introduction to raster data
- Historical context for measuring change over time
- Case study: National Land Cover Dataset
- **Desk Crits** + checking in

  **Readings**

  - Couclelis, H., 1992. People manipulate objects (but cultivate fields): Beyond the raster-vector debate in GIS, in: Frank, A.U., Campari, I., Formentini, U. (Eds.), Theories and Methods of Spatio-Temporal Reasoning in Geographic Space, Lecture Notes in Computer Science. Springer Berlin Heidelberg, Berlin, Heidelberg, pp. 65–77. [https://doi.org/10.1007/3-540-55966-3_3](https://doi.org/10.1007/3-540-55966-3_3)
  - Homer, C., Dewitz, J., Jin, S., Xian, G., Costello, C., Danielson, P., Gass, L., Funk, M., Wickham, J., Stehman, S., Auch, R., Riitters, K., 2020. Conterminous United States land cover change patterns 2001–2016 from the 2016 National Land Cover Database. ISPRS Journal of Photogrammetry and Remote Sensing 162, 184–199. [https://doi.org/10.1016/j.isprsjprs.2020.02.019](https://doi.org/10.1016/j.isprsjprs.2020.02.019)

#### Class 08: Supervised classification using earth observation (EO) data (Tutorial)

- Use `leafmap`, `rasterio`, `ipyleaflet` to find, download, classify, composite, and analyze raster data
- **Desk crits**

### Week 05

Wrapping up + developing future practice

#### Class 09: Wrapping up + Looking Forward

- Additional workshop on advanced topic or guest lecture (TBD based on class interest)

#### Class 10: Desk crits / work session

### Week 06

Preparing for final colloquium presentations + presentations on August 14th

#### Class 11: Desk crits / work session

- Work session for final projects
