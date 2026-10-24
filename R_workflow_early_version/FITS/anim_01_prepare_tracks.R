# ---- 1. Settings ------------------------------------------------------------
# Builds the table with one row per GPS fix that every animation panel uses.
# For each animal it projects the fixes to metres, calculates speed between
# consecutive fixes, looks up the distance to the nearest road, and assigns
# each fix to a weekly frame on one calendar shared by all animals.
#
# The animals used are those with status "ok" and no residency flag in
# ctmm_summary.csv,  
# INPUT : the two Movebank CSV files          (names set in anim_00_config.R)
#         out/ctmm_summary.csv                from run_ctmm_full.R and patch_meta.R
#         the distance-to-road raster         from build_fine_distance_rasters.R
# OUTPUT: anim/checkpoints/tracks_master.rds  one row per fix
#         anim/checkpoints/frame_lookup.rds   frame number and its week start date
# Run order: after patch_meta.R and build_fine_distance_rasters.R, before anim_02.
 
source("anim_00_config.R")   # base_dir, out_dir, anim_dir, FRAME_UNIT, dist_raster_path

library(ctmm)
library(dplyr)
library(sf)
library(terra)
library(lubridate)

# ---- 2. Rebuild the telemetry ---------------------------------------------------
# Same read, join and filter steps as run_ctmm_full.R, so the fixes match.
cat("Rebuilding telemetry (same filter as run_ctmm_full.R)...\n")
ev  <- read.csv(file.path(base_dir, event_file), stringsAsFactors = FALSE)   # ev  = GPS fixes
ref <- read.csv(file.path(base_dir, ref_file),   stringsAsFactors = FALSE)   # ref = one row per animal (species, sex, fate)
ev$tag.local.identifier <- as.character(ev$tag.local.identifier)   # join key in the fixes table
ref$tag.id              <- as.character(ref$tag.id)                # join key in the reference table
df <- merge(ev, ref, by.x = "tag.local.identifier", by.y = "tag.id", all.x = TRUE, sort = FALSE)
df$visible <- as.logical(toupper(as.character(df$visible)))   # stored as "true"/"false" text
keep <- df$visible %in% TRUE &                                  # visible = not flagged as an outlier in Movebank
  (is.na(df$gps.hdop) | df$gps.hdop <= HDOP_MAX) &              # drop poor satellite geometry
  (is.na(df$manipulation.type) | df$manipulation.type == "none") &   # drop fixes marked as manipulated
  !is.na(df$location.long) & !is.na(df$location.lat)            # drop fixes with no position
df <- df[keep, ]
tel_all <- as.telemetry(df)   # named list: one ctmm telemetry object per animal

# ---- 3. Choose the animals ----------------------------------------------------
summary_csv <- read.csv(file.path(out_dir, "ctmm_summary.csv"), stringsAsFactors = FALSE)
clean_ids <- summary_csv$id[summary_csv$status == "ok" & !(summary_csv$residency_flag %in% TRUE)]
cat("Target population:", length(clean_ids), "animals",
    "(status ok and not residency-flagged, as in the species meta-analysis).\n")

# Warn about any animal in the summary that has no telemetry object, then drop it.
missing <- setdiff(clean_ids, names(tel_all))
if (length(missing) > 0) cat("WARNING: no telemetry object found for:", paste(missing, collapse = ", "), "\n")
clean_ids <- intersect(clean_ids, names(tel_all))

dist_raster <- terra::rast(dist_raster_path)   # distance to the nearest vehicle-capable road (m); its CRS is used for all coordinates

# ---- 4. Per-fix table for each animal -------------------------------------------
cat("Extracting tracks, speed and distance to road for", length(clean_ids), "animals",
    "(every fix is projected, so this can take a few minutes)...\n")

track_list <- lapply(clean_ids, function(id) {
  tel <- tel_all[[id]]
  d <- data.frame(
    id        = id,
    species   = summary_csv$species[summary_csv$id == id][1],
    timestamp = tel$timestamp,
    longitude = tel$longitude,
    latitude  = tel$latitude
  )
  d <- d[order(d$timestamp), ]

  # Project with sf into the raster's coordinate system (metres) so distances and
  # speeds are in metres for every animal. ctmm's own projection is centred on
  # each animal, so it differs from animal to animal.
  pts <- st_as_sf(d, coords = c("longitude", "latitude"), crs = 4326) %>%
    st_transform(crs(dist_raster))
  xy <- st_coordinates(pts)
  d$x <- xy[, 1]   # easting (m)
  d$y <- xy[, 2]   # northing (m)

  # Speed between consecutive fixes = straight-line distance / time gap. The
  # first fix of each animal has no previous fix, so its speed is NA.
  dt_sec <- as.numeric(diff(d$timestamp), units = "secs")
  disp_m <- sqrt(diff(d$x)^2 + diff(d$y)^2)
  d$speed_m_s <- c(NA_real_, disp_m / dt_sec)

  ex <- terra::extract(dist_raster, pts)       # distance to the nearest road at each fix
  d$dist_to_road_m <- ex[[ncol(ex)]]           # the last column holds the raster value (the first is the point ID)

  d$frame_date <- lubridate::floor_date(d$timestamp, unit = FRAME_UNIT)   # start of the week containing the fix
  d
})
tracks <- bind_rows(track_list)

# ---- 5. Shared frame numbers ----------------------------------------------------
# One frame number per distinct week across all animals, so every panel
# advances through the same calendar date.
frame_lookup <- tracks %>% distinct(frame_date) %>% arrange(frame_date) %>%
  mutate(frame_idx = row_number())
tracks <- tracks %>% left_join(frame_lookup, by = "frame_date")

# ---- 6. Summary and save ----------------------------------------------------------
cat("\n================ SUMMARY ================\n")
cat("Animals included:", length(unique(tracks$id)), "\n")
print(table(summary_csv$species[match(unique(tracks$id), summary_csv$id)]))
cat("Date range:", as.character(min(tracks$timestamp)), "to", as.character(max(tracks$timestamp)), "\n")
cat("Total fixes:", nrow(tracks), "\n")
cat("Frame unit:", FRAME_UNIT, " | Total frames:", max(tracks$frame_idx), "\n")
cat("Animals on screen per frame:\n")
print(summary(as.numeric(table(tracks$frame_idx[!duplicated(tracks[c("id","frame_idx")])]))))
cat("Speed (m/s), NA for the first fix of each animal:\n"); print(summary(tracks$speed_m_s))
cat("Distance to road (m):\n"); print(summary(tracks$dist_to_road_m))
cat("=========================================\n")

saveRDS(tracks, file.path(anim_dir, "checkpoints", "tracks_master.rds"))
saveRDS(frame_lookup, file.path(anim_dir, "checkpoints", "frame_lookup.rds"))
cat("\nSaved checkpoint to:", file.path(anim_dir, "checkpoints", "tracks_master.rds"), "\n")
