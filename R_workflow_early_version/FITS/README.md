#  R scripts: run order
ctmm workflow and abandoned animation attempts, kept as record and due to dependencies and time constraints,
cannot rewrite/rerun.

## Large input data and generated files are not in this repository:
the OpenStreetMap road extract for Washington State (`Geofabrik, washington-260912`) and the WSDOT traffic-count shapefile (`road_data/`), the NDVI stack (`ndvi_stack_utm.tif`), and the distance rasters, saved `.rds` checkpoints and animation frames, which are rebuilt by running the scripts in the order given above (`build_fine_distance_rasters.R` makes the rasters)


Set the R working directory to this folder before running anything. 
Change `base_dir` in `anim_00_config.R`, `run_ctmm_full.R`, `patch_meta.R` and `run_bootstrap.R` to the folder holding the Movebank CSV files and `road_data/`. 
Every script lists its inputs, outputs and run order in the comment block at the top.

## Home ranges and road exposure

| Step | Script | Makes |
|---|---|---|
| 1 | `run_ctmm_full.R` | movement models and AKDE home ranges per animal (`out/ctmm_summary.csv`, `out/fits/`) |
| 2 | `patch_meta.R` | corrected position timescale and residency flag; species meta-analysis repeated |
| 3 | `run_bootstrap.R` | bootstrap for animals with low effective sample size (`out/boot/`) |
| 4 | `build_fine_distance_rasters.R` | 30 m distance-to-road rasters (needs `dist_traffic_raster.tif` and `osm_roads_utm.rds` from `03_distance_to_road_surfaces.Rmd`) |
| 5 | `build_fates.R` | cause of death per animal (`anim/checkpoints/fates.rds`) |
| 6 | `anim_01_prepare_tracks.R` | one row per GPS fix, with speed, distance to road and weekly frame number |
| 7 | `build_individual_table.R` | one row per animal (not in this folder; sources `anim_00_config.R`) |
| 8 | `ud_exposure.R` | range-weighted road exposure per animal (`anim/ud_exposure.csv`) |

## Animation

| Step | Script | Makes |
|---|---|---|
| 1 | `anim_02_prepare_spatial.R` | road layers and map extent |
| 2 | `anim_03a_map_background.R` | map background image, drawn once |
| 3 | `anim_03b_map_trajectories.R` | animal trails and death markers, transparent frames |
| 4 | `anim_04_line_panels.R` | "Distance to traffic" panel |
| 5 | `anim_04b_mortality_counter.R` | "Deaths by cause" panel |
| 6 | `anim_05_compose.R` | final frames and `hero_animation.mp4` |

`anim_00_config.R` is loaded by the others and is not run on its own. Steps 3 to 5 must use the same `TEST` setting, or step 6 stops.

## Not part of the final run

`attempt_gganimate_single_script.R` is the first gganimate version, kept as a record (estimated over a day to render).
