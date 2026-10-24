# ---- 1. Settings ------------------------------------------------------------
# Prepares the road layers drawn on the map: the OpenStreetMap road network
# (background) and the WSDOT traffic-count sections (AADT, drawn by traffic
# volume). Both are reprojected to the CRS of the distance raster and cropped to
# the area covered by all animals, not the smaller area used in the static
# figures. A matching crop of the distance raster is also saved.
#
# INPUT : anim/checkpoints/tracks_master.rds   from anim_01_prepare_tracks.R
#         road data and raster paths           set in anim_00_config.R
# OUTPUT: anim/checkpoints/spatial_layers.rds  osm_roads, aadt_roads (sf) and ext_vec (extent as numbers)
#         anim/checkpoints/dist_raster_full.tif  cropped raster (not used by the final map; kept for reference)
# Run order: after anim_01_prepare_tracks.R.

source("anim_00_config.R")   # paths and CRS source  

library(sf)
library(terra)
library(dplyr)

tracks <- readRDS(file.path(anim_dir, "checkpoints", "tracks_master.rds"))

# ---- 2. Map extent --------------------------------------------------------------
# Bounding box of all fixes plus 8% padding, so tracks near the edge are not
# flush against the frame border.
pad <- 0.08 * max(diff(range(tracks$x)), diff(range(tracks$y)))
ext_full <- terra::ext(min(tracks$x) - pad, max(tracks$x) + pad,
                       min(tracks$y) - pad, max(tracks$y) + pad)
cat("Full animation extent (raster CRS units):\n"); print(ext_full)

dist_raster <- terra::rast(dist_raster_path)
dist_raster_full <- terra::crop(dist_raster, ext_full)   # crop can only shrink a raster, never extend it

# ---- 3. OpenStreetMap roads (background) ------------------------------------------
cat("\nLayers available in", osm_road_gpkg, ":\n")
print(st_layers(osm_road_gpkg))
cat("If the layer used below is not a roads (lines) layer, set osm_road_layer in",
    "anim_00_config.R to the correct name from the list above and rerun.\n\n")

osm_layer_to_use <- if (!is.null(osm_road_layer)) osm_road_layer else st_layers(osm_road_gpkg)$name[1]
osm_roads <- st_read(osm_road_gpkg, layer = osm_layer_to_use, quiet = TRUE) %>%
  st_transform(crs(dist_raster)) %>%
  st_crop(st_bbox(ext_full))
cat("OSM road features in extent:", nrow(osm_roads), "\n")

# ---- 4. WSDOT traffic-count sections (AADT) -----------------------------------------
aadt_roads <- st_read(aadt_vector_path, quiet = TRUE) %>%
  st_transform(crs(dist_raster)) %>%
  st_crop(st_bbox(ext_full))
cat("AADT sections in extent:", nrow(aadt_roads), "\n")
cat("AADT attribute columns (the traffic-volume column is named in aadt_volume_col):\n")
print(names(aadt_roads))

# ---- 5. Save ----------------------------------------------------------------------
# terra objects (rasters and extents) hold pointers that do not survive
# saveRDS()/readRDS() between R sessions; reloading one gives "NULL value passed
# as symbol address". So the raster goes to its own .tif and the extent is saved
# as four plain numbers. sf objects are ordinary data frames and save normally.
dist_raster_path_full <- file.path(anim_dir, "checkpoints", "dist_raster_full.tif")
terra::writeRaster(dist_raster_full, dist_raster_path_full, overwrite = TRUE)

ext_vec <- as.vector(ext_full)   # c(xmin, xmax, ymin, ymax)

saveRDS(list(osm_roads = osm_roads, aadt_roads = aadt_roads, ext_vec = ext_vec),
        file.path(anim_dir, "checkpoints", "spatial_layers.rds"))
cat("\nSaved raster to:", dist_raster_path_full, "\n")
cat("Saved vector layers and extent to:", file.path(anim_dir, "checkpoints", "spatial_layers.rds"), "\n")
