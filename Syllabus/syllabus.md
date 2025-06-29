# Mapping Systems Summer 2025

Tuesday and Thursdays, 6-8pm @ 209 Fayerweather

Instructor: Mario Giampieri (mag2382@columbia.edu)

## Introduction

_Mapping Systems_ introduces CDP students to programming concepts and methods for spatial analysis, using urban planning challenges as a basis for learning. The course will also explore the social, political, and ethical implications of mapping technologies, as well as our role as practitioners in the production and interpretation of spatial data.

The course will focus on building proficiency in Python-based workflows focused on finding, describing, and visualizing spatial data; manipulating and drawing meaning from data layers; understanding distance and spatial relatedness; and measuring change over time. The course will also introduce web-based methods for visualizing and interacting with data. While a primary goal of this course is to introduce students to practical tools and workflows and build fluency in their use, we will maintain a critical perspective and also introduce students to some historical and conceptual context, as well as case studies.

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

Class meets on Tuesdays and Thursdays in 200 Fayerweather from 6-8pm. Weeks will generally be organized as follows:
- **Tuesday**: Lecture, reading discussion, review of technical concepts
- **Thursday**: Technical tutorials and desk crits

Conversation topics that pertain to the entire class, such as meeting time/location or technical difficulties / troubleshooting should live in the course Discord channel. All other questions can be sent to me directly via email at mag2382@columbia.edu.

All reading materials and slides will be posted to Canvas, and tutorials will be posted to the course's [Github repository](https://github.com/mapping-systems/cdp-mapping-systems) (i.e. this website). All exercises will be saved and managed via Github (details below).

## Office Hours

Office hours are by appointment on Fridays, or before class on Tuesday or Thursday. Email me to schedule a time to chat.

## Schedule

### Week 01

Introductions + getting started: IDE and environment setup, loading and visualizing data

#### Class 01: Introductions

- Introductions, review of syllabus
- Orientation to course Github
- A brief history of GIS + computer mapping
- Projections
- Vector data types

  **Exercise** [Getting Started](../Assignments/00_Getting_Started.md) (to be completed by next class)

  **Readings**

  - (optional) Edwards, P.N., 2010. Introduction, in: A Vast Machine: Computer Models, Climate Data, and the Politics of Global Warming. The MIT Press.

#### Class 02: Loading, exploring, visualizing data (Tutorial)

- [Tutorial](/Tutorials/01_vector_data_apis.ipynb) on loading, exploring, and visualizing data using `geopandas`, `pandas`, `matplotlib`, `lonboard`, and `folium`
- Finding open data for New York City
- Explore spatial and non-spatial attributes of tax lot dataset, `MapPLUTO`
- Create static and interactive visualizations of the dataset
- Saving data

  **Exercise:** [01_Loading and visualizing data](../Assignments/01_Loading_Visualizing.md)

### Week 02

Geoprocessing / vector data analysis basics using `geopandas` and `shapely`

#### Class 03: Mapping as a critical and creative process

- Mapping as creative process, critical practice, and counter-narrative
- Case study: Environmental Justice in New York City and New York State

  **Readings**:

  - Iconoclasistas, 2016. Manual of Collective Mapping: Critical cartographic resources for territorial processes of collaborative creation.
  - Wilson, M.O., 2018. The Cartography of W.E.B. Dubois’ Color Line, in: Batlle-Baptiste, W., Rusert, B. (Eds.), WEB Du Bois’s Data Portraits: Visualizing Black America. Princeton Architectural Press.
  - (Optional) Miller, H.J., 2004. Tobler’s First Law and Spatial Analysis. Annals of the Association of American Geographers 94, 284–289.
  - (optional) Entrikin, J.N., 1991. The Betweenness of Place, in: Entrikin, J.N. (Ed.), The Betweenness of Place: Towards a Geography of Modernity. Macmillan Education UK, London, pp. 6–26. [https://doi.org/10.1007/978-1-349-21086-2_2](https://doi.org/10.1007/978-1-349-21086-2_2)
  - (optional) Maantay, J., Ziegler, J., 2006. Spatial Data and Basic Mapping Concepts, in: GIS for the Urban Environment.
  - (optional) Corner, J., 2011. The Agency of Mapping: Speculation, Critique and Invention, in: Dodge, M., Kitchin, R., Perkins, C. (Eds.), The Map Reader. Wiley, pp. 89–101. [https://doi.org/10.1002/9780470979587.ch12](https://doi.org/10.1002/9780470979587.ch12)

#### Class 04: Geoprocessing (Tutorial)

- Manipulate, reshape, and combine datasets together using spatial and non-spatial characteristics using `geopandas` and `shapely`

  **Exercise:** [02_Geoprocessing](../Assignments/02_Geoprocessing.md)

### Week 03

Web mapping, interactive visualization, and crowd-sourced information

#### Class 05: Web mapping part 1

- Introduction to web mapping
- Web 2.0 and the rise of interactive mapping
- Web map basic components

  **Readings**

  - NEOGEOGRAPHY AND THE PALIMPSESTS OF PLACE: WEB 2.0 AND THE CONSTRUCTION OF A VIRTUAL EARTH - GRAHAM - 2010 - Tijdschrift voor Economische en Sociale Geografie - Wiley Online Library [WWW Document], 2010. URL https://onlinelibrary-wiley-com.libproxy.mit.edu/doi/full/10.1111/j.1467-9663.2009.00563.x (accessed 6.15.25).

#### Class 06: Web mapping (Tutorial part 1)

- Use `leaflet` to create interactive web maps
- Load data via API
- Launching a basic web map
  **Exercise:** [03_Web Mapping](../Assignments/03_Web_Mapping.md)

### Week 04

APIs and website deployment

#### Class 07: Web mapping part 2

- Data production and governance
- Elements of an API
- Case study: OpenStreetMap and the Humanitarian OpenStreetMap Team
- **Desk Crits** + checking in

  **Readings**

  - Schröder-Bergen, S., Glasze, G., Michel, B., Dammann, F., 2022. De/colonizing OpenStreetMap? Local mappers, humanitarian and commercial actors and the changing modes of collaborative mapping. GeoJournal 87, 5051–5066. https://doi.org/10.1007/s10708-021-10547-7
  - (optional) Haklay, M., Weber, P., 2008. OpenStreetMap: User-generated street maps. IEEE Pervasive Computing 7, 12–18. [https://doi.org/10.1109/MPRV.2008.80](https://doi.org/10.1109/MPRV.2008.80)

#### Class 08: Developing an API and site deployment (Tutorial)

- Use `supabase` to create a simple API
- Deploy a simple website using `github pages`, `cloudflare`, or `render`
- **Desk crits**

### Week 05

Conceiving of and measuring distance and spatial relatedness

#### Class 09: Distance, Adjacency, Networks

- Euclidean and network distance
- Introduction to graph theory
- Different kinds of adjacency
- Case study: CitiBike usage before and during the COVID-19 pandemic

  **Readings**:

  - Barabási, A.-L., 2016. Graph Theory, in: Network Science. Cambridge University Press, Cambridge, United Kingdom. Available online [here](https://networksciencebook.com/chapter/2)
  - Xin, R., Ai, T., Ding, L., Zhu, R., Meng, L., 2022. Impact of the COVID-19 pandemic on urban human mobility - A multiscale geospatial network analysis using New York bike-sharing data. Cities 126, 103677. [https://doi.org/10.1016/j.cities.2022.103677](https://doi.org/10.1016/j.cities.2022.103677)

#### Class 10: Measuring Distance (Tutorial)

- Introduce `osmnx`, `networkx`, `libpysal`, `h3` to calculate distance from Fayerweather to local points of interest
- **Desk crits** on final colloquium projects

  **Exercise:** [04_Networks](../Assignments/04_Networks.md)

### Week 06

Preparing for final colloquium presentations + presentations on August 6th

#### Class 11: Desk crits / work session

- Work session for final projects
- Wrapping up and looking forward
