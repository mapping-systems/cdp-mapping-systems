# Mapping Systems Summer 2025

Wednesdays and Fridays, 11am-1pm @ 209 Fayerweather

Instructor: Mario Giampieri (mag2382@columbia.edu)

## Introduction

_Mapping Systems_ introduces CDP students to programming concepts and methods for spatial analysis, using urban planning challenges as a basis for learning. The course will also explore the social, political, and ethical implications of mapping technologies, as well as our role as practitioners in the production and interpretation of spatial data.

The course will focus on building proficiency in Python-based workflows focused on finding, describing, and visualizing spatial data; manipulating and drawing meaning from data layers; understanding distance and spatial relatedness; and measuring change over time. The course will also introduce web-based methods for visualizing and interacting with data. While a primary goal of this course is to introduce students to practical tools and workflows and build fluency in their use, we will maintain a critical perspective grounded in foundational readings, historical and conceptual context, as well as case studies.

The course will require students to complete weekly exercises to gain proficiency in spatial analytic methods in service of being able to use said methods in their computational design practice. Students will be asked to further develop one exercise into a final project, described in more detail below.

## Final Project

The final project will expand upon one of the exercises and further explore the methods and tools used. This may mean conducting a more in-depth analysis of a dataset, applying the methods to a different (and/or multiple) dataset, or extending the functionality of web-based visualizations. You will be asked to diagram your project, write a short description of your goals, and reflect on how you intend to further explore these methods through the following semesters.

## Learning Objectives

At the most basic level, the goal of this class is to introduce students to mapping in Python and Javascript and demonstrate how to explore, analyze, and visualize spatial data. By the end of the course, students should be able to:

- Load, explore, and visualize spatial data in Python and Javascript
- Understand and apply basic geoprocessing techniques
- Measure distance and spatial relatedness
- Understand the role of web mapping and APIs in spatial data visualization

Furthermore, students should develop a deeper understanding of how spatial data is used in decision-making, and challenges associated with using data to inform arguments (agency in mapping; objective vs subjective / abstract vs experiential).

This is primarily a methods course, however students will be expected to complete weekly readings and come prepared to discuss them in class. There are several optional readings listed for each week; it is not expected that students will read all of these, but they are provided for those who wish to explore the topics in more depth.

## Course Organization / Communication

Class meets on Wednesdays and Fridays in 209 Fayerweather from 11am-1pm. Weeks will generally be organized as follows:
- **Wednesday**: Lecture, reading discussion, review of technical concepts
- **Friday**: Technical tutorials and desk crits

Conversation topics that pertain to the entire class, such as meeting time/location or technical difficulties / troubleshooting should live in the course Discord channel. All other questions can be sent to me directly via email at mag2382@columbia.edu.

All reading materials and slides will be posted to Canvas, and tutorials will be posted to the course's [Github repository](https://github.com/mapping-systems/cdp-mapping-systems) (i.e. this website). All exercises will be saved and managed via Github (details below).

## Office Hours

Office hours are by appointment. Email me to schedule a time to chat.

## Schedule

### Week 01

Introductions + getting started: IDE and environment setup, loading and visualizing data

#### Class 01: Introductions (Wednesday 7/1/2026)

- Introductions, review of syllabus
- Orientation to course Github
- A brief history of GIS + computer mapping
- Projections
- Vector data types

  **Exercise** [Getting Started](../Tutorials/00_Getting_Started.md) (to be completed by class on 7/7/2026)

  **Readings**

  - (optional) Edwards, P.N., 2010. Introduction, in: A Vast Machine: Computer Models, Climate Data, and the Politics of Global Warming. The MIT Press.

#### No class due to July 4th holiday (Friday7/3/2026)

### Week 02

Geoprocessing / vector data analysis basics using `geopandas` and `shapely`

#### Class 02: Loading, exploring, visualizing data (Wednesday 7/8/2026)

- [In-class Tutorial](../Tutorials/01_comparing-census-variables.ipynb) on loading, exploring, and visualizing Census data using `geopandas`, `matplotlib`, and `lonboard`
- Interpret and visualize spatial data
- Explore spatial and non-spatial attributes of Census data
- Create static and interactive visualizations of the dataset
- Saving data

  **Exercise:** [01_Loading and visualizing data](../Assignments/01-loading-and-visualizing-data.md)

---
#### Class 03: Mapping as a critical and creative process (Friday 7/10/2026 - meeting 3-5pm in Ware)
- Mapping as creative process, critical practice, and counter-narrative
- Case study: Environmental Justice in New York City and New York State

  **Readings**:
  - Wilson, M.O., 2018. The Cartography of W.E.B. Dubois’ Color Line, in: Batlle-Baptiste, W., Rusert, B. (Eds.), WEB Du Bois’s Data Portraits: Visualizing Black America. Princeton Architectural Press. [@wilsonCartographyWEBDubois2018]
  - (optional) Iconoclasistas, 2016. Manual of Collective Mapping: Critical cartographic resources for territorial processes of collaborative creation. [@iconoclasistasManualCollectiveMapping2016]
  - (Optional) Miller, H.J., 2004. Tobler’s First Law and Spatial Analysis. Annals of the Association of American Geographers 94, 284–289. [millerToblersFirstLaw2004a]
  - (optional) Maantay, J., Ziegler, J., 2006. Spatial Data and Basic Mapping Concepts, in: GIS for the Urban Environment. [@maantaySpatialDataBasic2006]
  - (optional) Corner, J., 2011. The Agency of Mapping: Speculation, Critique and Invention, in: Dodge, M., Kitchin, R., Perkins, C. (Eds.), The Map Reader. Wiley, pp. 89–101. [https://doi.org/10.1002/9780470979587.ch12](https://doi.org/10.1002/9780470979587.ch12) [@cornerAgencyMappingSpeculation2011]

#### Class 04: Geoprocessing (Wednesday 7/15/2026) 

- [In-class tutorial](../Tutorials/02_flood_vulnerability_proportional_split.ipynb) on manipulating, reshaping, and combining datasets together using spatial and non-spatial characteristics using `geopandas` and `shapely`

  **Exercise:** [02_Geoprocessing](../Assignments/02-geoprocessing.md)

### Week 03

Web mapping, interactive visualization, and crowd-sourced information

#### Class 04: Web mapping part 1 (Friday 7/17/2026)

- Introduction to web mapping
- Web 2.0 and the rise of interactive mapping
- Web map basic components

  **Readings**

  - NEOGEOGRAPHY AND THE PALIMPSESTS OF PLACE: WEB 2.0 AND THE CONSTRUCTION OF A VIRTUAL EARTH - GRAHAM - 2010 - Tijdschrift voor Economische en Sociale Geografie - Wiley Online Library [WWW Document], 2010. [@NEOGEOGRAPHYPALIMPSESTSPLACE2009]

#### Class 05: Web mapping (Wednesday 7/22/2026)

- [In-class tutorial](../Tutorials/03_web_mapping_with_maplibre.md) using `maplibre` to create interactive an interacative web map
- Load data via API
- Launching a basic web map
  **Exercise:** [03_Web Mapping](../Assignments/04-web-mapping.md)

### Week 04

Understanding and measuring distance and spatial relatedness

#### Class 06: Distance, Adjacency, Networks (Friday 7/24/2026)

- Euclidean and network distance
- Introduction to graph theory
- Different kinds of adjacency
- Case study: CitiBike usage before and during the COVID-19 pandemic

  **Readings**:

  - Boeing, G., 2025. Modeling and Analyzing Urban Networks and Amenities With OSMnx. Geographical Analysis 57, 567–577. https://doi.org/10.1111/gean.70009 [@boeingModelingAnalyzingUrban2025]
  - Xin, R., Ai, T., Ding, L., Zhu, R., Meng, L., 2022. Impact of the COVID-19 pandemic on urban human mobility - A multiscale geospatial network analysis using New York bike-sharing data. Cities 126, 103677. [https://doi.org/10.1016/j.cities.2022.103677](https://doi.org/10.1016/j.cities.2022.103677) [@xinImpactCOVID19Pandemic2022]
  - (Optional) Barabási, A.-L., 2016. Graph Theory, in: Network Science. Cambridge University Press, Cambridge, United Kingdom. Available online [here](https://networksciencebook.com/chapter/2) [@barabasiNetworkScience2016]

#### Class 07: Measuring Distance (Tutorial) (Wednesday 7/29/2026)

- [In-class tutorial](../Tutorials/04_networks.ipynb) introducing `osmnx`, `networkx`, `libpysal`, `h3` to calculate transit deserts
- **Desk crits** on final colloquium projects

  **Exercise:** [04_Networks](../Assignments/03-networks.md)

### Week 05

Preparing for final colloquium presentations + presentations on August 5th
#### Class 08: Wrapping up and looking forward (Friday 7/31/2026)
- Work session for final projects
- Wrapping up and looking forward