# ---- 1. Settings ------------------------------------------------------------
# Animates the "Distance to traffic" line panel: for each week, the median
# distance to the nearest road for every animal (thin lines) and for each species
# (thick lines). The panel is rendered on its own and matched to the other panels
# only by frame number.
#
# transition_reveal() is used because a line chart is normally read as a line
# drawn along the x-axis (week), and it is cheaper to render than building one
# copy of the data per frame as transition_manual() does.
#
# A movement-rate panel (speed in km/day) was also built from this script and
# then dropped in favour of the mortality counter (anim_04b). The speed columns
# below are left in for that reason, but only distance is plotted.
#
# INPUT : anim/checkpoints/tracks_master.rds   from anim_01_prepare_tracks.R
# OUTPUT: anim/frames_traffic/traffic_0001.png, ...   one per week
# Run order: any time after anim_01. Use the same TEST setting as anim_03b and anim_04b.

source("anim_00_config.R")   # anim_dir, species_colors, theme_anim()

library(dplyr)
library(ggplot2)
library(gganimate)

TEST        <- FALSE   # TRUE = render only the first TEST_NFRAME frames as a quick check
TEST_NFRAME <- 15      # number of frames rendered when TEST is TRUE
# All three panel scripts (anim_03b, this one and anim_04b) must use the same TEST
# value, otherwise anim_05 stops because the frame counts differ.

tracks <- readRDS(file.path(anim_dir, "checkpoints", "tracks_master.rds"))
TOTAL_FRAMES  <- max(tracks$frame_idx)                       # one frame per week of the study
render_frames <- if (TEST) TEST_NFRAME else TOTAL_FRAMES     # frames rendered this run
cat("Rendering", render_frames, "of", TOTAL_FRAMES, "total frames",
    if (TEST) "(TEST subset)" else "(FULL RUN)", "\n")

# ---- 2. Weekly summaries ----------------------------------------------------------------
d <- tracks %>% filter(frame_idx <= render_frames)

# One value per animal per week: the median over that week's fixes.
ind_summary <- d %>%
  group_by(id, species, frame_idx) %>%
  summarise(dist_med    = median(dist_to_road_m, na.rm = TRUE),                  # median distance to road (m)
            speed_kmday = median(speed_m_s, na.rm = TRUE) * 86400 / 1000,       # median speed converted from m/s to km/day (not plotted)
            .groups = "drop")

# One value per species per week: the median across animals.
species_summary <- ind_summary %>%
  group_by(species, frame_idx) %>%
  summarise(dist_med    = median(dist_med, na.rm = TRUE),
            speed_kmday = median(speed_kmday, na.rm = TRUE),
            .groups = "drop")

# ---- 3. Panel -----------------------------------------------------------------------------
# yvar is the column to plot, ylab the y-axis label and title the panel title.
build_line_panel <- function(yvar, ylab, title) {
  ggplot() +
    geom_line(data = ind_summary, aes(x = frame_idx, y = .data[[yvar]], group = id, colour = species),
              alpha = 0.15, linewidth = 0.3) +                              # one faint line per animal
    geom_line(data = species_summary, aes(x = frame_idx, y = .data[[yvar]], colour = species, group = species),
              linewidth = 1.3) +                                            # species median
    geom_point(data = species_summary, aes(x = frame_idx, y = .data[[yvar]], colour = species),
               size = 2.4) +                                                # head of the line = current week
    scale_colour_manual(values = species_colors, name = "Species") +
    scale_x_continuous(limits = c(1, TOTAL_FRAMES), name = "Week of study") +
    transition_reveal(frame_idx) +
    labs(title = title, y = ylab) +
    theme_anim() +
    theme(legend.position = "none")   # the species legend appears once, in anim_05, not on every panel
}

p_traffic <- build_line_panel("dist_med", "Distance to road (m)", "Distance to traffic")

# ---- 4. Render ----------------------------------------------------------------------------
frames_traffic_dir <- file.path(anim_dir, "frames_traffic")
dir.create(frames_traffic_dir, showWarnings = FALSE)

# 700 px high. This panel and the mortality counter (anim_04b), both 700 px, stack
# to 1400 px, the height of the map in anim_03a and anim_03b, so anim_05 can place
# them beside the map without resizing.
cat("Rendering distance-to-road panel...\n")
animate(p_traffic, nframes = render_frames, fps = 8, width = 1000, height = 700, res = 150,
        renderer = file_renderer(dir = frames_traffic_dir, prefix = "traffic_", overwrite = TRUE))

cat("\nFrames written to:", frames_traffic_dir, "\n")
cat("Check a few frames. If the test frames look right, set TEST <- FALSE and rerun for all",
    TOTAL_FRAMES, "frames.\n")
