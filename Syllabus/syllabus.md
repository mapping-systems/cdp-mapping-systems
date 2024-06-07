## Introduction

*Mapping Systems* will introduce CDP students to programming concepts and methods for spatial analysis, as well as their role in the production and interpretation of spatial data. 

The course will focus on building proficiency in Python-based workflows focused on finding, describing, and visualizing spatial data; manipulating and drawing meaning from data layers; understanding distance and spatial relatedness; and measuring change over time. While a primary goal of this course is to introduce students to practical tools and workflows and build fluency in their use, the course will also introduce students to some historical and conceptual context, as well as case studies. 

The course will require students to complete exercises to gain proficiency in spatial analytic tools, and will culminate in a final project investigating a spatial research question.

## Learning Objectives


At the most basic level, the goal of this class is to introduce students to mapping in Python and demonstrate how to explore, analyze, and visualize spatial data. By the end of the course, students should be able to:
- Load, explore, and visualize spatial data in Python
- Understand and apply basic geoprocessing techniques
- Measure distance and spatial relatedness
- Analyze change over time
- Articulate some combination of the above in a final project

Furthermore, students should develop a deeper understanding of how spatial data is used in decision-making, and challenges associated with using data to inform arguments (agency in mapping; objective vs subjective / abstract vs experiential).
##  Course Organization / Communication

Class meets on Tuesdays and Thursday at **xx_where_xx** from 6-8pm. Weeks will generally be organized as follows:
**Tuesday**: Lecture, reading discussion, review of technical concepts
**Thursday**: Tutorials, desk crits for exercises and final project

Conversation topics that pertain to the entire class, such as meeting time/location or technical difficulties / troubleshooting can live in the course Discord thread. All other questions can be sent to me directly via email at mag2382@columbia.edu.

All slides and tutorials will be posted to the course's [Github repository](https://github.com/mapping-systems/cdp-mapping-systems). All exercises, as well as final project progress, will be saved and managed in Github as well (details below).

## Office Hours 

Office hours are by appointment, and preferable on Tuesday or Thursdays before or after class. Email me to schedule a time to chat.


## Final Project

Your final project will require you to develop a spatial research question and methodology, find the appropriate datasets to explore your question, and then analyze and visualize your results. You will present your findings in a final presentation, and submit a Github Pages site that includes your presentation and the notebook(s) you used to conduct your analysis. More information can be found in the [final project description](/Assignment_Descriptions/05_Final_Project.md). 

### Final Project Schedule
- Week 01 Class 01: Introduce final project
- Week 02 Class 04: Research Question + Data Sources due
- Week 03 Class 06: Methodology due
- Week 04 Class 07: Desk crits
- Week 04 Class 08: Desk crits
- Week 05 Class 09: Final presentations
- Week 05 Class 10: Final presentations



## Schedule

### Week 01
Getting started- IDE, environment, loading, and visualizing data
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
- Explore spatial and non-spatial attributes of tax lot dataset, MapPLUTO
- Create static and interactive visualizations of dataset
- Saving data
  
	**Exercise:** [01_Loading and visualizing data](/Assignment_Descriptions/01_Loading_Visualizing.md)
	
### Week 02
Geoprocessing / vector data analysis basics using `pyogrio`, `pandas`, `matplotlib`, and `lonboard`
#### Class 03: The power of mapping
- Mapping as creative process, critical practice, and counter-narrative
- Case study: Environmental Justice in New York City and New York State
  
	**Readings**: 
	- Miller, H.J., 2004. Tobler’s First Law and Spatial Analysis. Annals of the Association of American Geographers 94, 284–289.
	- Maantay, J., Ziegler, J., 2006. Spatial Data and Basic Mapping Concepts, in: GIS for the Urban Environment.
	- Corner, J., 2011. The Agency of Mapping: Speculation, Critique and Invention, in: Dodge, M., Kitchin, R., Perkins, C. (Eds.), The Map Reader. Wiley, pp. 89–101. [https://doi.org/10.1002/9780470979587.ch12](https://doi.org/10.1002/9780470979587.ch12)
	- (optional) Batlle-Baptiste, W., Rusert, B. (Eds.), 2018. WEB Du Bois’s Data Portraits: Visualizing Black America. Princeton Architectural Press.
	- (optional) Entrikin, J.N., 19291. The Betweenness of Place, in: Entrikin, J.N. (Ed.), The Betweenness of Place: Towards a Geography of Modernity. Macmillan Education UK, London, pp. 6–26. [https://doi.org/10.1007/978-1-349-21086-2_2](https://doi.org/10.1007/978-1-349-21086-2_2
	- (optional) Lynch, K., 1960. The city and its elements, in: The Image of the City. The MIT Press, Cambridge MA.
	- (optional) Tuan, Y.-F., 1975. Place: An Experiential Perspective. Geographical Review 65, 151–165. [https://doi.org/10.2307/213970](https://doi.org/10.2307/213970)

#### Class 04: Geoprocessing (Tutorial)
- Manipulate, reshape, and combine datasets together using spatial and non-spatial characteristics using `geopandas` and `shapely`

 	**Exercise:** [Geoprocessing](/Assignment_Descriptions/02_Geoprocessing.md)
  
	**Final Project Deliverable**: Research question and draft data manifest due


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
- **Desk crits** on final projects
  
	**Exercise:** [Networks](/Assignment_Descriptions/03_Networks.md)

	**Final Project Deliverable:** Conceptual methodology due

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


#### Class 08: Supervised classification using earth observation (EO) data
- Use `geemap`, `rasterio`, `ipyleaflet` to find, download, classify, and analyze raster data
- **Desk crits** 

### Week 05

Wrapping up + the things we didn't get to

#### Class 09: Final Presentations
- Final project presentations part one


#### Class 10: Final Presentations + Looking Forward
- Final project presentations part two
- Implications for practice
- Connections to other kinds of computational design practices

