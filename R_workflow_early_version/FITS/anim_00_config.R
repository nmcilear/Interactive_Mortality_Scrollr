# ---- 1. Settings ------------------------------------------------------------
# Shared settings for the animation scripts and the exposure scripts.
# Every other script starts with source("anim_00_config.R"), so folders, data
# file names, colours and frame settings are defined once, here. Nothing needs
# to be run on its own from this file.
#
# To reproduce on another computer:
#   1. Put the two Movebank CSV files and the road_data folder in base_dir.
#   2. Change base_dir (below) to that folder.
#   3. Set the R working directory to the folder that holds these scripts.

# ---- 2. Packages --------------------------------------------------------------
 
library(readr); library(data.table); library(janitor); library(lubridate)    
library(dplyr); library(tidyr); library(stringr); library(forcats)           
library(ggplot2); library(ggthemes); library(patchwork); library(scales); library(ggpubr)    
library(sf); library(terra); library(ggspatial)                             
library(ctmm); library(move2); library(MODISTools)       

# ---- 3. Folders ---------------------------------------------------------------
base_dir <- "C:/Users/Nic/Documents/ctmm/FITS"    # change this one line on another computer
out_dir  <- file.path(base_dir, "out")            # run_ctmm_full.R writes its results here
anim_dir <- file.path(base_dir, "anim")           # animation frames and checkpoints go here
dir.create(anim_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(file.path(anim_dir, "checkpoints"), showWarnings = FALSE)   # saved R objects passed between scripts

# ---- 4. Colours and fonts -----------------------------------------------------
species_colors <- c(Bobcat = "#D55E00", Coyote = "#0072B2")   # Okabe-Ito colour-blind-safe pair

 

anim_font <- "sans"    

# ---- 5. Animation timing --------------------------------------------------------
# Animals were collared in different years (2017 to 2022), so the animation uses
# one shared calendar timeline: an animal appears when its collar starts and
# disappears when it ends. One frame per day would give about 1,800 frames,
# which is too slow to render, so each frame is one week (208 frames in the
# final run).  
FRAME_UNIT <- "week"   # a lubridate::floor_date() unit: "day", "week" or "month"

# Number of earlier frames kept as a fading trail behind each animal's current position.
TRAIL_FRAMES <- 6

# ---- 6. Data files ------------------------------------------------------------
# Movebank study data (doi 10.5441/001/1.gm93267b), same files as run_ctmm_full.R.
event_file <- "GPS tracking of bobcats and coyotes in northern Washington.csv"                  # GPS fixes
ref_file   <- "GPS tracking of bobcats and coyotes in northern Washington-reference-data.csv"   # one row per animal
HDOP_MAX   <- 10   # fixes with horizontal dilution of precision above this are dropped (same as run_ctmm_full.R)

# Road data. Two layers are used for different jobs:
#   aadt_vector_path  WSDOT traffic-count sections. Only state-monitored roads, but each has a
#                     traffic volume (AADT, vehicles per day). Drawn with line width by volume.
#   osm_road_gpkg     OpenStreetMap roads for Washington State. Covers the whole network, so it is
#                     drawn as thin grey lines underneath.
aadt_vector_path <- file.path(base_dir, "road_data",
                              "WSDOT_-_Traffic_Sections_(AADT)_Current",
                              "WSDOT_-_Traffic_Sections_(AADT)_Current.shp")
osm_road_gpkg    <- file.path(base_dir, "road_data", "washington-260912.gpkg")
osm_road_layer   <- NULL   # NULL = use the first layer in the gpkg. If st_layers(osm_road_gpkg) lists
                           # several, set this to the roads layer name (for example "lines").

# Distance-to-road raster used to give every GPS fix a distance to the nearest road.
# This is the 30 m raster made by build_fine_distance_rasters.R; run that script first.
dist_raster_path <- file.path(base_dir, "checkpoints", "dist_traffic_raster_30m.tif")

aadt_volume_col <- "AADT"   # name of the traffic-volume column in the WSDOT shapefile

# ---- 7. Theme for the animation panels ----------------------------------------
# Dark, quiet background so the animals and roads are the brightest things in each frame.
anim_bg       <- "#0b0d12"   # page background
anim_panel    <- "#11141b"   # plot panel background
anim_grid     <- "#20242e"   # grid lines
anim_text     <- "#e7e7ea"   # main text
anim_text_dim <- "#9a9ea8"   # axis labels and secondary text

theme_anim <- function(base_size = 13) {
  theme_minimal(base_size = base_size, base_family = anim_font) +
    theme(
      plot.background   = element_rect(fill = anim_bg, colour = NA),
      panel.background  = element_rect(fill = anim_panel, colour = NA),
      panel.grid.major  = element_line(colour = anim_grid, linewidth = 0.25),
      panel.grid.minor  = element_blank(),
      axis.text         = element_text(colour = anim_text_dim, size = rel(0.8)),
      axis.title        = element_text(colour = anim_text_dim, size = rel(0.85)),
      plot.title        = element_text(colour = anim_text, face = "bold", size = rel(1.05)),
      plot.subtitle     = element_text(colour = anim_text_dim, size = rel(0.8)),
      legend.background = element_rect(fill = anim_bg, colour = NA),
      legend.key        = element_rect(fill = anim_bg, colour = NA),
      legend.text       = element_text(colour = anim_text_dim, size = rel(0.75)),
      legend.title      = element_text(colour = anim_text, size = rel(0.8)),
      plot.title.position = "plot"
    )
}

# ---- 8. Cause-of-death groups and colours ----------------------------------------
# Fate labels come from build_fates.R. "Other" and "Unknown" share one bar and colour.
death_bar_group <- c("Human"           = "Human-caused",
                     "Large carnivore" = "Large carnivore",
                     "Other"           = "Other / unknown",
                     "Unknown"         = "Other / unknown")
death_bar_colors <- c("Human-caused"    = "#e67e22",
                      "Large carnivore" = "#8c5a3c",
                      "Other / unknown" = "#5b7a8c")
# Colour for each fate label, used for the death markers on the map.
fate_colors <- setNames(death_bar_colors[death_bar_group], names(death_bar_group))
