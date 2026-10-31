# Resources and references

All links were used in this project. Full citations are in the report's reference list.

## Data

| Resource | Link |
|---|---|
| GPS tracking of bobcats and coyotes in northern Washington (Prugh Lab, 2023), CC0 | https://doi.org/10.5441/001/1.gm93267b |
| Washington Predator-Prey Project (WDFW) | https://wdfw.wa.gov/hunting/management/predator-prey-study |
| OpenStreetMap, Washington State extract (Geofabrik) | https://download.geofabrik.de/north-america/us/washington.html |
| OpenStreetMap copyright and licence | https://www.openstreetmap.org/copyright |
| Movebank | https://www.movebank.org |
| WSDOT Traffic Sections (AADT), Current: search this title on the WSDOT GeoData portal | https://geoportal.wsdot.wa.gov |

## The source study

- Prugh, L. R., et al. (2023). Fear of large carnivores amplifies human-caused mortality for mesopredators. *Science*, 380(6646), 754–758. https://doi.org/10.1126/science.adf2472

## Movement modelling (R: ctmm)

| Resource | Link |
|---|---|
| ctmm on CRAN | https://cran.r-project.org/package=ctmm |
| ctmm source | https://github.com/ctmm-initiative/ctmm |
| ctmm learning materials (Fleming & Lin) | https://github.com/ctmm-initiative/ctmmlearn |
| Calabrese, Fleming & Gurarie (2016), the ctmm paper | https://doi.org/10.1111/2041-210X.12559 |
| Fleming et al. (2015), autocorrelated kernel density estimation | https://doi.org/10.1890/14-2010.1 |
| Fleming et al. (2019), small effective sample sizes | https://doi.org/10.1111/2041-210X.13270 |

## Other R packages used

| Package | Used for | Link |
|---|---|---|
| terra | Rasters, distance surfaces | https://cran.r-project.org/package=terra |
| sf | Road and track geometry | https://cran.r-project.org/package=sf |
| dplyr, tidyr, lubridate, readr, stringr, forcats | Data handling | https://www.tidyverse.org/packages/ |
| ggplot2 | Static figures | https://cran.r-project.org/package=ggplot2 |
| gganimate (Pedersen & Robinson, 2025) | Animation attempts | https://doi.org/10.32614/CRAN.package.gganimate |
| moveVis (Schwalb-Willmann et al., 2020) | Animation attempts | https://doi.org/10.1111/2041-210X.13374 |
| patchwork, cowplot | Combining panels | https://cran.r-project.org/package=patchwork |
| magick, av, ragg | Image and video handling | https://cran.r-project.org/package=magick |
| data.table | Fast tables | https://cran.r-project.org/package=data.table |
| suncalc | Day and night times (diel plots) | https://cran.r-project.org/package=suncalc |

Example animation code that informed the prototypes: https://github.com/wesleygreentree/telemetry-animations

## Python packages used

| Package | Used for | Link |
|---|---|---|
| pandas, numpy, scipy | Tables, arrays, statistics | https://pandas.pydata.org · https://numpy.org · https://scipy.org |
| statsmodels | Poisson rate model | https://www.statsmodels.org |
| geopandas, pyogrio, shapely | Roads and geometry for the page data | https://geopandas.org · https://pyogrio.readthedocs.io · https://shapely.readthedocs.io |
| rdata | Reading ctmm fits (`.RData`) in Python | https://github.com/vnmabus/rdata |

## Page design and scrollytelling

| Resource | Link |
|---|---|
| Vickery (2021), What makes for a good scrollytelling article? | https://digitalblog.ons.gov.uk/2021/05/24/what-makes-for-a-good-scrollytelling-article |
| Barclay (2021), How we build scrollytelling articles | https://digitalblog.ons.gov.uk/2021/06/02/how-we-build-scrollytelling-articles |
| ONS example: Exploring local income deprivation | https://www.ons.gov.uk/visualisations/dvc1371/ |
| ONS svelte-scrolly (structure re-implemented in plain JavaScript here) | https://github.com/ONSvisual/svelte-scrolly |
| Okabe & Ito (2008), colour-blind-safe palette | https://jfly.uni-koeln.de/color/ |

## Visualisation theory

| Reference | Link |
|---|---|
| Segel & Heer (2010), narrative visualisation (martini glass) | https://doi.org/10.1109/TVCG.2010.179 |
| Shneiderman (1996), overview first, details on demand | https://doi.org/10.1109/VL.1996.545307 |
| Healey & Enns (2012), attention and visual memory | https://doi.org/10.1109/TVCG.2011.127 |
| Padilla, Kay & Hullman (2022), uncertainty visualisation | https://doi.org/10.1002/9781118445112.stat08296 |
| Cleveland & McGill (1984), graphical perception | https://doi.org/10.1080/01621459.1984.10478080 |
| Sweller (1988), cognitive load | https://doi.org/10.1207/s15516709cog1202_4 |
| Mayer (2009), Multimedia learning | https://doi.org/10.1017/CBO9780511811678 |
| Munzner (2014), Visualization analysis and design | https://www.routledge.com/Visualization-Analysis-and-Design/Munzner/p/book/9781466508910 |
| Tufte (1983), The visual display of quantitative information | https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/ |

## This project

- Repository: https://github.com/nmcilear/Interactive_Mortality_Scrollr
- Live page: https://nmcilear.github.io/Interactive_Mortality_Scrollr/
- Diagrams: [WORKFLOW.md](WORKFLOW.md) · Limits: [LIMITATIONS.md](LIMITATIONS.md)
