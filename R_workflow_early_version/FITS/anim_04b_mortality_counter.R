# ---- 1. Settings ------------------------------------------------------------
# Animates the "Deaths by cause" bar panel: a running count of deaths for each
# species, split into human-caused, large-carnivore and other/unknown. A death
# is counted in the frame of the animal's last GPS fix, the same frame in which
# its marker appears on the map (anim_03b).
#
# INPUT : anim/checkpoints/tracks_master.rds   from anim_01_prepare_tracks.R
#         anim/checkpoints/fates.rds           from build_fates.R
# OUTPUT: anim/frames_mortality/mortality_0001.png, ...   one per week
# Run order: after build_fates.R. Use the same TEST setting as anim_03b and anim_04.
# Only animals in the animation are counted, so the totals are for those
# animals, not for all 70 in the study.

source("anim_00_config.R")   # anim_dir, species_colors, death_bar_group, death_bar_colors, theme_anim()

library(dplyr)
library(tidyr)
library(ggplot2)
library(gganimate)
library(ragg)

TEST        <- FALSE   # TRUE = render only the first TEST_NFRAME frames as a quick check
TEST_NFRAME <- 15      # number of frames rendered when TEST is TRUE
# All three panel scripts (anim_03b, anim_04 and this one) must use the same TEST
# value, otherwise anim_05 stops because the frame counts differ.

tracks <- readRDS(file.path(anim_dir, "checkpoints", "tracks_master.rds"))
fates  <- readRDS(file.path(anim_dir, "checkpoints", "fates.rds"))

TOTAL_FRAMES  <- max(tracks$frame_idx)                       # one frame per week of the study
render_frames <- if (TEST) TEST_NFRAME else TOTAL_FRAMES     # frames rendered this run
cat("Rendering", render_frames, "of", TOTAL_FRAMES, "mortality-counter frames",
    if (TEST) "(TEST subset)" else "(FULL RUN)", "\n")

# ---- 2. Deaths and running counts ---------------------------------------------------------
# One row per animal that ends in a confirmed death, with the frame of its last
# fix. This uses the full tracks (not the TEST subset) so the y-axis is the same
# in test and full runs.
deaths <- tracks %>%
  group_by(id, species) %>%
  summarise(last_frame = max(frame_idx), .groups = "drop") %>%
  inner_join(fates %>% select(id, fate), by = "id") %>%
  filter(fate != "Survived/censored") %>%
  mutate(group = factor(death_bar_group[fate], levels = names(death_bar_colors)))   # fate -> bar group

cat("Deaths in the animated population, by species and bar group (final totals):\n")
print(table(deaths$species, deaths$group))

# Every frame x species x bar group combination, so each bar exists from frame 1
# and its label reads 0 until the first death.
grid <- tidyr::crossing(frame_idx = seq_len(render_frames),
                        species   = c("Bobcat", "Coyote"),
                        group     = factor(names(death_bar_colors), levels = names(death_bar_colors)))

# n = number of deaths in that species and group up to and including that frame.
counts <- grid %>%
  left_join(deaths %>% select(species, group, last_frame), by = c("species", "group")) %>%
  group_by(frame_idx, species, group) %>%
  summarise(n = sum(!is.na(last_frame) & last_frame <= frame_idx[1]), .groups = "drop")

y_max <- deaths %>% count(species, group) %>% pull(n) %>% max()   # tallest final bar, used to fix the y-axis

# ---- 3. Panel -------------------------------------------------------------------------------
p_counter <- ggplot(counts, aes(x = species, y = n, fill = group)) +
  geom_col(position = position_dodge(width = 0.8), width = 0.72) +
  geom_text(aes(label = n), position = position_dodge(width = 0.8), vjust = -0.45,
            colour = anim_text, size = 6, fontface = "bold", family = anim_font) +
  scale_fill_manual(values = death_bar_colors, name = NULL, drop = FALSE) +
  scale_y_continuous(limits = c(0, y_max * 1.18), expand = c(0, 0), name = "Cumulative deaths") +   # 18% headroom for the labels
  labs(title = "Deaths by cause", x = NULL) +
  transition_manual(frame_idx) +
  theme_anim() +
  theme(legend.position = "top",
        axis.text.x = element_text(size = 13, colour = anim_text),
        panel.grid.major.x = element_blank())

# ---- 4. Render ------------------------------------------------------------------------------
frames_dir <- file.path(anim_dir, "frames_mortality")
dir.create(frames_dir, showWarnings = FALSE)
# Delete old frames first, so frames left from an earlier TEST run cannot make
# the frame counts differ in anim_05.
unlink(list.files(frames_dir, full.names = TRUE))

# 700 px high, so this panel and the distance panel (anim_04) stack to the 1400 px map height.
animate(p_counter, nframes = render_frames, fps = 8, width = 1000, height = 700, res = 150,
        device = "ragg_png",
        renderer = file_renderer(dir = frames_dir, prefix = "mortality_", overwrite = TRUE))

cat("\nMortality-counter frames written to:", frames_dir, "\n")
