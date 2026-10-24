# first gganimate attempt; it is not part of
# the final pipeline. draws the whole map (distance raster, about 165,000 OSM
# road features, 743 AADT sections and the animal trails) in one gganimate call.
# gganimate redraws every layer on every frame, so 15 test frames had an
# estimated render time of 2 hours and the full run would have taken over a day.
 
#
# Map design in this version: distance-to-road raster in muted blues, thin grey
# OSM roads, AADT sections in orange with line width showing traffic volume, and
# one coloured point per animal per week with a fading wake.
#
# INPUT : anim/checkpoints/tracks_master.rds, spatial_layers.rds, dist_raster_full.tif
# OUTPUT: anim/frames_map/map_0001.png, ...
# Run order: not used. Needs anim_01 and anim_02 to have been run.

source("anim_00_config.R")   # anim_dir, species_colors, aadt_volume_col, TRAIL_FRAMES, theme_anim()

library(sf)
library(terra)
library(tidyterra)
library(dplyr)
library(ggplot2)
library(gganimate)

# Test on a short range first. Drawing the raster, the road layers and all the
# trajectories on every frame is slow, so 15 frames show a problem much sooner
# than the full run.
TEST        <- TRUE
TEST_NFRAME <- 15

tracks <- readRDS(file.path(anim_dir, "checkpoints", "tracks_master.rds"))
sp     <- readRDS(file.path(anim_dir, "checkpoints", "spatial_layers.rds"))
# The cropped raster is read from its own .tif. terra objects cannot be saved in
# an .rds file and reloaded in a new session (see anim_02_prepare_spatial.R).
dist_raster_full <- terra::rast(file.path(anim_dir, "checkpoints", "dist_raster_full.tif"))
osm_roads  <- sp$osm_roads
aadt_roads <- sp$aadt_roads
ext_vec    <- sp$ext_vec   # c(xmin, xmax, ymin, ymax) in metres

TOTAL_FRAMES <- max(tracks$frame_idx)
render_frames <- if (TEST) TEST_NFRAME else TOTAL_FRAMES
cat("Rendering", render_frames, "of", TOTAL_FRAMES, "total frames",
    if (TEST) "(TEST subset)" else "(FULL RUN)", "\n")

# ---- 2. Points to animate ---------------------------------------------------------
# One point per animal per frame: the first fix of that week.
frame_pts <- tracks %>%
  filter(frame_idx <= render_frames) %>%
  group_by(id, frame_idx) %>%
  slice(1) %>%
  ungroup() %>%
  select(id, species, frame_idx, x, y)

road_ramp <- c("#031626", "#0b3d60", "#2f6a8f", "#6fa8bf", "#cfe4ea")   # distance raster colours, dark to light

# ---- 3. Plot and render -----------------------------------------------------------
# Road width, not colour, shows traffic volume, so colour stays free for species.
p_map <- ggplot() +
  geom_spatraster(data = dist_raster_full) +
  scale_fill_gradientn(colours = road_ramp, na.value = NA, trans = "sqrt",
                       name = "Distance to\nroad (m)") +
  geom_sf(data = osm_roads, colour = "grey45", linewidth = 0.12, alpha = 0.55,
          inherit.aes = FALSE) +
  geom_sf(data = aadt_roads, aes(linewidth = .data[[aadt_volume_col]]),
          colour = "#f2a65a", alpha = 0.75, inherit.aes = FALSE) +
  scale_linewidth(range = c(0.15, 2.0), name = "AADT\n(veh/day)") +
  geom_point(data = frame_pts, aes(x = x, y = y, colour = species, group = id),
             size = 2.4) +
  scale_colour_manual(values = species_colors, name = "Species") +
  coord_sf(xlim = ext_vec[1:2], ylim = ext_vec[3:4], expand = FALSE) +
  # wake_length is a fraction of the total number of frames, not a frame count.
  # exclude_layer = c(1, 2, 3) keeps the raster and the two road layers from getting a wake.
  shadow_wake(wake_length = TRAIL_FRAMES / TOTAL_FRAMES, alpha = TRUE, size = TRUE,
              exclude_layer = c(1, 2, 3)) +
  transition_manual(frame_idx) +
  labs(title = "Movement through the landscape") +
  theme_anim() +
  theme(axis.title = element_blank(), axis.text = element_blank(),
        panel.grid = element_blank())

frames_dir <- file.path(anim_dir, "frames_map")
dir.create(frames_dir, showWarnings = FALSE)

# Frames are saved as numbered PNGs rather than one gif so that other panels can be combined frame by frame.
anim <- animate(p_map, nframes = render_frames, fps = 8,
                width = 1400, height = 1400, res = 150,
                renderer = file_renderer(dir = frames_dir, prefix = "map_", overwrite = TRUE))

cat("Map panel frames written to:", frames_dir, "\n")
