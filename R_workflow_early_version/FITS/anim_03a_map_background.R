# ---- 1. Settings ------------------------------------------------------------
# Draws the map background once: the OpenStreetMap roads and the AADT traffic
# sections. The moving animals are drawn separately in anim_03b and laid over
# this image in anim_05.
#
# the first version drew the roads and the animals in one gganimate
# call (attempt_gganimate_single_script.R). gganimate redraws every layer on
# every frame, and the roads are about 165,000 OSM features plus 743 AADT
# sections, so 15 test frames had an estimated render time of 2 hours and the
# full run would have taken over a day. Drawing the roads once as a PNG removes
# that cost.
#
# INPUT : anim/checkpoints/spatial_layers.rds   from anim_02_prepare_spatial.R
# OUTPUT: anim/map_background.png   1400 x 1400 px, no legend and no title
#         anim/map_legend.png       the AADT line-width legend, cropped, added back in anim_05
# Run order: after anim_02, before anim_05. Independent of anim_03b.

source("anim_00_config.R")   # anim_dir, aadt_volume_col, theme_anim(), colours

library(cowplot)
library(sf)
library(terra)
library(tidyterra)
library(ggplot2)
library(magick)

sp <- readRDS(file.path(anim_dir, "checkpoints", "spatial_layers.rds"))
osm_roads  <- sp$osm_roads    # all OSM roads in the map area (sf)
aadt_roads <- sp$aadt_roads   # WSDOT sections with a traffic volume (sf)
ext_vec    <- sp$ext_vec      # c(xmin, xmax, ymin, ymax) of the map, in metres

# ---- 2. Background map ------------------------------------------------------------
# The distance-to-road raster is not drawn here. The "Distance to traffic" panel
# already shows distance to road, so a coloured raster behind the map repeated it.
# It also caused a hard rectangular edge in the video: terra::crop() cannot extend
# a raster, and the distance raster covers the smaller study area used for the static
# AKDE figure, not the larger area covered by all animals over the full tracking
# period. Outside that footprint the raster was NA and showed as plain background,
# which made the roads look clipped. The road layers cover the whole extent.
cat("Rendering the background once:", nrow(osm_roads), "OSM road features +",
    nrow(aadt_roads), "AADT sections.\n")

base_layers <- list(
  geom_sf(data = osm_roads, colour = "grey45", linewidth = 0.12, alpha = 0.55,
          inherit.aes = FALSE),
  geom_sf(data = aadt_roads, aes(linewidth = .data[[aadt_volume_col]]),
          colour = "#f2a65a", alpha = 0.75, inherit.aes = FALSE),   # line width = traffic volume; colour stays free for species
  scale_linewidth(range = c(0.15, 2.0), name = "AADT\n(veh/day)"),
  coord_sf(xlim = ext_vec[1:2], ylim = ext_vec[3:4], expand = FALSE),
  theme_anim(),
  theme(axis.title = element_blank(), axis.text = element_blank(), panel.grid = element_blank(),
        panel.background = element_rect(fill = anim_panel, colour = NA))
)

# The background has no legend and no title. The trajectory images from
# anim_03b are the same size and contain only the data panel. A legend or title
# here would shrink the data panel, so the same map coordinate would fall on a
# different pixel in each image and the animals would appear to drift off the
# map when the two are combined. The legend is saved separately below and
# placed on the combined frame in anim_05; the title is added there too.
p_bg <- Reduce(`+`, base_layers, ggplot()) + theme(legend.position = "none")

bg_path <- file.path(anim_dir, "map_background.png")
ggsave(bg_path, p_bg, width = 1400 / 150, height = 1400 / 150, dpi = 150, bg = anim_bg)
cat("Saved:", bg_path, "\n")

# ---- 3. Legend as a separate image ---------------------------------------------------
# Only the AADT line-width scale is left. It is drawn on a larger canvas and
# trimmed, so the size does not have to be guessed.
if (!requireNamespace("cowplot", quietly = TRUE)) {
  cat("Package 'cowplot' is not installed (install.packages(\"cowplot\")), so the legend image was skipped.",
      "map_background.png is still correct; rerun this script after installing cowplot to add the legend.\n")
} else {
  p_bg_with_legend <- Reduce(`+`, base_layers, ggplot())
  legend_grob <- cowplot::get_legend(p_bg_with_legend)
  legend_path <- file.path(anim_dir, "map_legend.png")
  ggsave(legend_path, cowplot::ggdraw(legend_grob), width = 3, height = 3, dpi = 150, bg = anim_bg)
  image_write(image_trim(image_read(legend_path)), legend_path)
  cat("Saved legend overlay to:", legend_path, "\n")
}

cat("Open map_background.png and check that roads fill the whole canvas with no",
    "hard-edged box, and that the AADT line widths vary sensibly.\n")
