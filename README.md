# Bobcat and coyote mortality explorer

An interactive, scrolling explainer of how road exposure, season and species overlap relate to human-caused mortality in GPS-collared bobcats and coyotes in northern Washington (2018–2022). Built for QUT MXB362 *Advanced Visualisation and Data Science*.

[Live page](https://nmcilear.github.io/Interactive_Mortality_Scrollr/)

currently refactoring to improve reproducibility and hierarchy

R_Workflow_early_versions directory holds R scripts for ctmm workflow and abandoned animation attempts,
dependencies and time constraints meant separating and rerunning was not feasible.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | Page structure and text; loads everything below. |
| `css/style.css` | All styles and design tokens. |
| `data/animals.js` | Per-animal table, overlap pairs, death rates (precomputed). |
| `data/tracks.js` | GPS tracks, roads, territory outlines (precomputed). |
| `data/monthly_distance.js` | Monthly distance-to-road quantiles (precomputed). |
| `js/01_state_and_helpers.js` | Shared state, helpers, shapes, glossary. |
| `js/02_charts.js` | Charts A, B, C, E, F, M. |
| `js/03_risk_model.js` | Live Poisson risk model and bootstrap, chart D. |
| `js/04_map.js` | Animated map and close-up. |
| `js/05_render.js` | Redraw-everything orchestration. |
| `js/06_scrolly_scenes.js` | Scrolling story and explainer diagrams. |
| `js/07_explorer.js` | Linked full explorer at the end. |
| `risk_curve_model.py`, `individual_exposure.csv` | Stand-alone model and its input. |
| `tools/make_single_file.py` | Bundles the page into one HTML file. |



## Reproduce the risk curve

```bash
pip install numpy pandas
python risk_curve_model.py
```

## How the page was made

- Territories were estimated in R with continuous-time movement models and autocorrelated kernel density estimation (`ctmm`).
- Road exposure is the share of each animal's territory within 250 m of a vehicle-capable road (OpenStreetMap), weighted by the probability of use.
- The risk model, group medians with bootstrap intervals, the overlap shuffle test, the diagrams and the maps all run in the browser.
- Each finding is tagged **Shown**, **Suggested** or **Not testable here** based on significance revealed by data
- HTML followed tutorials and inspired by (https://github.com/ONSvisual/svelte-scrolly/) and (https://digitalblog.ons.gov.uk/2021/06/02/how-we-build-scrollytelling-articles/)
## Limits  

- The public Movebank dataset holds 70 animals; the source paper reports 72.
- Wolf and cougar locations are not public, so why animals near roads die more often cannot be tested here.
- Overlap is shared space, not contact in time.
- Hunting and trapping season dates still need confirming for 2018–22.

## Data and credits

- GPS data: Movebank, *GPS tracking of bobcats and coyotes in northern Washington* [Prugh et al. 2023](https://doi.org/10.1126/science.adf2472)
- CC0.
- Roads: © OpenStreetMap contributors.
- Layout inspired by the ONS article "Exploring local income deprivation". [see here](https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/incomeandwealth/articles/mappingincomedeprivationatalocalauthoritylevel/2021-05-24) 
- Typeface: Open Sans.
- Colours: Okabe–Ito colour-blind-safe palette for species; outcomes also differ by shape.

## Author

Nicola Mcilear, QUT.
