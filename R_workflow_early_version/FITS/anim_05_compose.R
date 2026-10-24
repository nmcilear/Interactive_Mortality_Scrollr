# ---- 1. Settings ------------------------------------------------------------
# Combines the separately rendered panels into the final animation.   
# Layout (one frame):
#   header (title and date)
#   map = map_background.png + one trajectory frame  |  distance panel over mortality counter
#   footer (species legend)
#
# INPUT : anim/map_background.png, anim/map_legend.png       from anim_03a_map_background.R
#         anim/frames_trajectories/, frames_traffic/, frames_mortality/
#                                                            from anim_03b, anim_04 and anim_04b
#         anim/checkpoints/frame_lookup.rds                  from anim_01_prepare_tracks.R
# OUTPUT: anim/frames_composed/composed_0001.png, ...        final frames
#         anim/hero_animation.mp4                            (or hero_animation.gif if package 'av' is missing)
# Run order: last. All three panel scripts must have finished with the same TEST setting.

source("anim_00_config.R")   # anim_dir, anim_bg, anim_text, anim_text_dim, anim_font, species_colors

library(magick)
library(dplyr)

HEADER_H <- 150   # height of the title strip above the panels (px)
FOOTER_H <- 70    # height of the legend strip below the panels (px)

frame_lookup <- readRDS(file.path(anim_dir, "checkpoints", "frame_lookup.rds"))   # frame number -> week start date

# ---- 2. Inputs --------------------------------------------------------------------------------
# The map for each frame is the one static background plus that frame's
# transparent trajectory image (see anim_03a and anim_03b for why).
map_bg         <- image_read(file.path(anim_dir, "map_background.png"))
traj_files     <- sort(list.files(file.path(anim_dir, "frames_trajectories"), full.names = TRUE))
traffic_files  <- sort(list.files(file.path(anim_dir, "frames_traffic"),      full.names = TRUE))
counter_files  <- sort(list.files(file.path(anim_dir, "frames_mortality"),    full.names = TRUE))

n_frames <- length(traj_files)
cat("Frame counts - trajectories:", length(traj_files), " traffic:", length(traffic_files),
    " mortality counter:", length(counter_files), "\n")
if (length(unique(c(length(traj_files), length(traffic_files), length(counter_files)))) != 1) {
  stop("Frame counts differ between panels. Rerun anim_03b, anim_04 and anim_04b with the ",
       "same TEST setting (all TEST <- FALSE for the full run) before composing.")
}

# ---- 3. Species legend ----------------------------------------------------------------------------
# Drawn once and placed on every frame.
legend_tmp <- tempfile(fileext = ".png")
png(legend_tmp, width = 500, height = FOOTER_H, bg = anim_bg, res = 150)
par(mar = c(0, 0, 0, 0), bg = anim_bg)
plot.new()
points(x = c(0.08, 0.5), y = c(0.5, 0.5), pch = 19, cex = 2.2,
       col = c(species_colors[["Bobcat"]], species_colors[["Coyote"]]))
text(x = c(0.14, 0.56), y = c(0.5, 0.5), labels = c("BOBCAT", "COYOTE"),
     col = anim_text, adj = 0, cex = 1.1, family = anim_font)
dev.off()
legend_img <- image_read(legend_tmp)

 
map_legend_path <- file.path(anim_dir, "map_legend.png")
map_legend_img <- if (file.exists(map_legend_path)) image_read(map_legend_path) else NULL

# ---- 4. Compose each frame --------------------------------------------------------------------------
composed_dir <- file.path(anim_dir, "frames_composed")
dir.create(composed_dir, showWarnings = FALSE)

cat("Compositing", n_frames, "frames...\n")
for (i in seq_len(n_frames)) {
  # Map for frame i: background plus this frame's trajectories.
  map_img <- image_composite(map_bg, image_read(traj_files[i]))
  # Right-hand column: distance panel stacked over mortality counter.
  side_img <- image_append(c(image_read(traffic_files[i]), image_read(counter_files[i])), stack = TRUE)

  map_w <- image_info(map_img)$width
  map_h <- image_info(map_img)$height
  side_w <- image_info(side_img)$width

  # Blank canvas, then the map (left) and side column (right) below the header.
  canvas <- image_blank(width = map_w + side_w, height = map_h + HEADER_H + FOOTER_H, color = anim_bg)
  composed <- image_composite(canvas, map_img,  offset = paste0("+0+", HEADER_H))
  composed <- image_composite(composed, side_img, offset = paste0("+", map_w, "+", HEADER_H))
  if (!is.null(map_legend_img)) {
    lw <- image_info(map_legend_img)$width
    composed <- image_composite(composed, map_legend_img,
                                offset = paste0("+", map_w - lw - 20, "+", HEADER_H + 20))   # 20 px in from the map's top-right corner
  }

  # Title, subtitle and week-start date (top right), then the species legend (bottom centre).
  date_label <- format(frame_lookup$frame_date[frame_lookup$frame_idx == i], "%d %b %Y")
  composed <- image_annotate(composed, "MOVEMENT AT THE HUMAN EDGE",
                             gravity = "northwest", location = "+30+28",
                             size = 40, color = anim_text, font = anim_font, weight = 700)
  composed <- image_annotate(composed, "GPS TELEMETRY • NORTHERN WASHINGTON",
                             gravity = "northwest", location = "+30+78",
                             size = 17, color = anim_text_dim, font = anim_font)
  composed <- image_annotate(composed, date_label,
                             gravity = "northeast", location = "+30+34",
                             size = 28, color = anim_text, font = anim_font, weight = 700)
  composed <- image_composite(composed, legend_img, gravity = "south", offset = "+0-6")

  image_write(composed, file.path(composed_dir, sprintf("composed_%04d.png", i)))
  if (i %% 20 == 0) cat("  frame", i, "/", n_frames, "\n")
}

cat("\nAll composed frames written to:", composed_dir, "\n")

# ---- 5. Video ------------------------------------------------------------------------------------------
# mp4  ; otherwise an animated gif.
composed_files <- sort(list.files(composed_dir, full.names = TRUE))
out_mp4 <- file.path(anim_dir, "hero_animation.mp4")
out_gif <- file.path(anim_dir, "hero_animation.gif")

if (requireNamespace("av", quietly = TRUE)) {
  av::av_encode_video(composed_files, output = out_mp4, framerate = 8)   # 8 frames per second = 8 weeks per second
  cat("Saved:", out_mp4, "\n")
} else {
  cat("Package 'av' is not installed (install.packages(\"av\") gives a smaller, faster mp4).",
      "Using an animated gif instead.\n")
  imgs <- image_read(composed_files)
  gif <- image_animate(image_join(imgs), fps = 8)
  image_write(gif, out_gif)
  cat("Saved:", out_gif, "\n")
}
