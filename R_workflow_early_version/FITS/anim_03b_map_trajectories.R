# ---- 1. Settings ------------------------------------------------------------
# Animates the moving layer of the map: each animal's current position, a
# fading trail behind it, and a diamond marker at the end of each track that
# finished in a confirmed death. Frames are saved as PNGs with a transparent
# background and laid over map_background.png in anim_05_compose.R.
#
# This is the animated layer of the map, so there is very little to draw
# per frame.  
#
# INPUT : anim/checkpoints/tracks_master.rds   from anim_01_prepare_tracks.R
#         anim/checkpoints/spatial_layers.rds  from anim_02_prepare_spatial.R (map extent only)
#         anim/checkpoints/fates.rds           from build_fates.R
# OUTPUT: anim/frames_trajectories/traj_0001.png, traj_0002.png, ...   one per week
#         anim/trail_static_check.png          single-frame check, see section 4
# Run order: after build_fates.R. Use the same TEST setting as anim_04 and anim_04b.

source("anim_00_config.R")   # anim_dir, TRAIL_FRAMES, species_colors, fate_colors

library(dplyr)
library(tidyr)    
library(ggplot2)
library(gganimate)
library(ragg)     # PNG device that keeps transparency. The default Windows PNG device
                  # ignored animate(bg = "transparent") and gave a solid white background.

TEST        <- FALSE   # TRUE = render only the first TEST_NFRAME frames as a quick check
TEST_NFRAME <- 15      # number of frames rendered when TEST is TRUE
# All three panel scripts (this one, anim_04 and anim_04b) must use the same TEST
# value, otherwise anim_05 stops because the frame counts differ.

tracks  <- readRDS(file.path(anim_dir, "checkpoints", "tracks_master.rds"))
sp      <- readRDS(file.path(anim_dir, "checkpoints", "spatial_layers.rds"))
ext_vec <- sp$ext_vec   # map limits c(xmin, xmax, ymin, ymax) in metres

TOTAL_FRAMES  <- max(tracks$frame_idx)                          # one frame per week of the study
render_frames <- if (TEST) TEST_NFRAME else TOTAL_FRAMES        # frames rendered this run
cat("Rendering", render_frames, "of", TOTAL_FRAMES, "trajectory-only frames",
    if (TEST) "(TEST subset)" else "(FULL RUN)", "\n")

# ---- 2. Position of each animal in each frame ----------------------------------------
# One point per animal per frame: the first fix of that week.
frame_pts <- tracks %>%
  filter(frame_idx <= render_frames) %>%
  group_by(id, frame_idx) %>%
  slice(1) %>%
  ungroup() %>%
  select(id, species, frame_idx, x, y)

# ---- 3. Death markers ----------------------------------------------------------------
# An animal whose last fix is followed by a confirmed death (fate other than
# "Survived/censored") gets a diamond at that last position, filled by cause of
# death. Animals whose collar simply stopped get no marker; their trail fades out.
# Only the animals in this animation can be marked. MVBOB71M was excluded earlier
# (its AKDE bootstrap did not converge), so its death (Human; Trapped) is counted
# in the mortality panel and later tables but not marked here.
fates <- readRDS(file.path(anim_dir, "checkpoints", "fates.rds"))
HOLD_FRAMES <- 4   # a marker stays for this many extra frames, fading out, before it disappears

death_events <- frame_pts %>%
  group_by(id) %>%
  summarise(last_frame = max(frame_idx),                          # frame of the animal's last fix
            x = x[which.max(frame_idx)], y = y[which.max(frame_idx)],   # position at that fix
            species = dplyr::first(species), .groups = "drop") %>%
  inner_join(fates %>% select(id, fate), by = "id") %>%
  filter(fate != "Survived/censored", last_frame <= render_frames) %>%
  mutate(marker_fill = fate_colors[fate])   # fill colour set by cause of death (fate_colors in anim_00_config.R)

cat(nrow(death_events), "of", length(unique(frame_pts$id)),
    "animals rendered here end in a confirmed death:\n")
if (nrow(death_events) > 0) print(table(death_events$fate))

# One row per marker per frame it is visible, with alpha falling to 0 over HOLD_FRAMES.
death_markers <- death_events %>%
  tidyr::crossing(hold = 0:HOLD_FRAMES) %>%
  mutate(reveal_frame = last_frame + hold,
         marker_alpha = pmax(0, 1 - hold / HOLD_FRAMES)) %>%
  filter(reveal_frame <= render_frames)

# ---- 4. Trail data -------------------------------------------------------------------
# gganimate::shadow_wake() was tried first. With transition_manual() it gave an
# alpha near 0 for every point, so frames rendered with nothing drawn and no
# error. The trail is instead built directly: for frame f, keep each animal's
# last TRAIL_FRAMES + 1 points and fade them by age (frames since that fix).
build_trail <- function(pts, trail_frames, max_frame) {
  bind_rows(lapply(seq_len(max_frame), function(f) {
    sub <- pts %>% filter(frame_idx <= f, frame_idx > f - trail_frames - 1) %>%
      arrange(id, frame_idx)   # geom_path joins points in row order, so each animal must be in time order
    if (nrow(sub) == 0) return(sub)
    sub$age          <- f - sub$frame_idx   # 0 = current position
    sub$reveal_frame <- f                   # frame in which this row is shown
    sub
  }))
}

trail_pts <- build_trail(frame_pts, TRAIL_FRAMES, render_frames) %>%
  mutate(alpha_val     = pmax(0.1, 1 - age / (TRAIL_FRAMES + 1)),                    # older points fainter
         size_val      = pmax(0.9, 2.6 * (1 - 0.55 * age / (TRAIL_FRAMES + 1))),      # older points smaller
         linewidth_val = pmax(0.4, 1.8 * (1 - 0.55 * age / (TRAIL_FRAMES + 1))))     # older segments thinner

cat("Trail data rows:", nrow(trail_pts), "(should be well above zero)\n")

# ---- 5. Animated plot ----------------------------------------------------------------
# coord_cartesian() is used, not coord_sf(). The x and y columns are plain
# numbers in metres with no sf geometry, so coord_sf() had no CRS to work from
# and silently placed every point outside the limits (empty frames, no error).
#
# Each trail is a line (geom_path) per animal. ggplot draws a separate segment
# wherever alpha or linewidth changes, so each segment fades with its own age.
# The current position (age 0) is a solid dot on top.
#
# Death markers are diamonds (shape 23). Colour is the species colour, as for
# everything else on this plot, and fill is the cause of death. Cause is kept on
# fill because mapping it to colour would replace the species colour scale.
p_traj <- ggplot(trail_pts, aes(x = x, y = y, colour = species, group = id)) +
  geom_path(aes(alpha = alpha_val, linewidth = linewidth_val), lineend = "round") +
  geom_point(data = ~ filter(.x, age == 0), aes(size = size_val)) +
  geom_point(data = death_markers,
             aes(x = x, y = y, colour = species, fill = marker_fill, alpha = marker_alpha),
             shape = 23, size = 4.6, stroke = 0.9, inherit.aes = FALSE) +
  scale_colour_manual(values = species_colors, guide = "none") +
  scale_fill_identity() +
  scale_alpha_identity() +
  scale_linewidth_identity() +
  scale_size_identity() +
  coord_cartesian(xlim = ext_vec[1:2], ylim = ext_vec[3:4], expand = FALSE) +
  transition_manual(reveal_frame) +
  theme_void() +
  theme(plot.background  = element_rect(fill = "transparent", colour = NA),
        panel.background = element_rect(fill = "transparent", colour = NA),
        legend.position  = "none")

# Static check before rendering: the last frame's points saved as an ordinary
# ggplot image, with no gganimate or transparent device involved. Open it first.
# If it is blank, the problem is in the coordinates, not in gganimate.
static_check_path <- file.path(anim_dir, "trail_static_check.png")
ggsave(static_check_path,
       ggplot(trail_pts %>% filter(reveal_frame == render_frames),
              aes(x = x, y = y, colour = species, alpha = alpha_val, size = size_val)) +
         geom_point() + scale_colour_manual(values = species_colors) +
         scale_alpha_identity() + scale_size_identity() +
         coord_cartesian(xlim = ext_vec[1:2], ylim = ext_vec[3:4], expand = FALSE) +
         theme_void() + theme(legend.position = "none"),
       width = 1400 / 150, height = 1400 / 150, dpi = 150, bg = "white")
cat("Static check saved to:", static_check_path,
    "- it should show coloured dots on a white background.\n\n")

# ---- 6. Render ------------------------------------------------------------------------
frames_dir <- file.path(anim_dir, "frames_trajectories")
dir.create(frames_dir, showWarnings = FALSE)

animate(p_traj, nframes = render_frames, fps = 8,
        width = 1400, height = 1400, res = 150,   # 1400 x 1400 px, matching map_background.png
        device = "ragg_png", bg = "transparent",
        renderer = file_renderer(dir = frames_dir, prefix = "traj_", overwrite = TRUE))

cat("Trajectory frames written to:", frames_dir, "\n")
cat("To check one, combine it with the background in R:\n",
    "  magick::image_composite(magick::image_read(file.path(anim_dir, \"map_background.png\")),\n",
    "                           magick::image_read(file.path(frames_dir, \"traj_0001.png\")))\n",
    "If the test frames look right, set TEST <- FALSE and rerun for all", TOTAL_FRAMES, "frames.\n")
