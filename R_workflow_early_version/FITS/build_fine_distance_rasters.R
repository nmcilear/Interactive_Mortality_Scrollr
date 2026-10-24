# ---- 1. Settings ------------------------------------------------------------
# Rebuilds the two distance-to-road rasters on a 30 m grid.
#
#  the earlier rasters used the 164.4 m cells of the NDVI stack
# (03_distance_to_road_surfaces.Rmd: template <- ndvi_stack_utm[[1]]), so every
# distance was a multiple of 164 m (0, 164, 233, 329 ...) and "within 250 m"
# meant "within about 1.4 cells".  
# The road geometry is read from the saved file checkpoints/osm_roads_utm.rds 
#
# INPUT : checkpoints/dist_traffic_raster.tif   original raster; its extent and CRS are reused
#         checkpoints/osm_roads_utm.rds         OSM roads in UTM coordinates (sf)
# OUTPUT: checkpoints/dist_road_raster_30m.tif     distance to any OSM road, including paths
#         checkpoints/dist_traffic_raster_30m.tif  distance to vehicle-capable roads only
#         The original rasters are not changed.
# Run order: before anim_01_prepare_tracks.R, build_individual_table.R and ud_exposure.R.
#            dist_raster_path in anim_00_config.R must point at the traffic file.
#
#  at 30 m the grid is about 9,100 x 4,900 = 45 million cells 

source("anim_00_config.R")   # base_dir
suppressPackageStartupMessages({ library(terra); library(sf); library(dplyr) })

RES <- 30   # cell size in metres
checkpoint_dir <- file.path(base_dir, "checkpoints")

old   <- terra::rast(file.path(checkpoint_dir, "dist_traffic_raster.tif"))   # original 164 m raster, used only for extent and CRS
roads <- readRDS(file.path(checkpoint_dir, "osm_roads_utm.rds"))              # all OSM road lines

# ---- 2. New grid --------------------------------------------------------------------
# Same extent and CRS as the original, finer cells.
template <- terra::rast(terra::ext(old), resolution = RES, crs = terra::crs(old))
cat("New grid:", terra::nrow(template), "x", terra::ncol(template), "=",
    format(terra::ncell(template), big.mark = ","), "cells\n")

# OSM "highway" classes that vehicles cannot use. Same list as the Rmd. These are
# kept in the all-road raster and removed from the traffic raster.
non_vehicle_classes <- c("footway", "path", "steps", "cycleway", "pedestrian",
                         "bridleway", "corridor", "elevator", "proposed",
                         "planned", "construction")

# ---- 3. Distance rasters -------------------------------------------------------------
# sf_roads = road lines to use, name = layer name in the file, file = output path.
# Roads are rasterised onto the grid and terra::distance() then gives each cell its
# distance to the nearest road cell.
build <- function(sf_roads, name, file) {
  cat("Rasterising and calculating distance:", name, "...\n")
  mask <- terra::rasterize(terra::vect(sf_roads), template, field = 1, background = NA)
  d <- terra::distance(mask)
  names(d) <- name
  terra::writeRaster(d, file, overwrite = TRUE, datatype = "FLT4S")
  d
}

d_all <- build(roads, "dist_to_road_m",
               file.path(checkpoint_dir, sprintf("dist_road_raster_%dm.tif", RES)))
d_veh <- build(roads %>% filter(!(highway %in% non_vehicle_classes)), "dist_to_traffic_road_m",
               file.path(checkpoint_dir, sprintf("dist_traffic_raster_%dm.tif", RES)))

# ---- 4. Check ---------------------------------------------------------------------------
 
cat("\nCheck on the traffic raster:\n")
print(summary(terra::values(d_veh)[, 1]))
cat("Distinct values in a 100,000-cell sample:",
    length(unique(round(terra::spatSample(d_veh, 1e5, na.rm = TRUE)[, 1], 1))), "\n")
cat("\nNext: make sure dist_raster_path in anim_00_config.R points at the new traffic raster,",
    "then run anim_01_prepare_tracks.R, build_individual_table.R and ud_exposure.R.\n")
