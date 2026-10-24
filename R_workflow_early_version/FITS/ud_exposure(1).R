# ---- 1. Settings ------------------------------------------------------------
# Road exposure for each animal, calculated from its home-range probability surface.
# For animal i, the AKDE utilisation distribution (UD) gives probability p_i(c)
# in each map cell c (summing to 1). With d(c) = distance from cell c to the
# nearest road, the script calculates
#   E_i[d]          = sum_c p_i(c) * d(c)                 expected distance to a road (m)
#   P_i(d <= 250)   = sum_c p_i(c) * 1{d(c) <= 250}       share of the range within 250 m of a road
# and the same share for 100, 500 and 1000 m (threshold sensitivity).
#
# INPUT : out/fits/*.rds                   from run_ctmm_full.R (needs the $ud element)
#         checkpoints/dist_traffic_raster<RES_SUFFIX>.tif   distance to vehicle-capable roads
#         checkpoints/dist_road_raster<RES_SUFFIX>.tif      distance to any OSM road, including paths
#         anim/individual_table.csv        from build_individual_table.R (used for the checks at the end)
# OUTPUT: anim/ud_exposure.csv             one row per animal; read by make_figures.py
# Run after build_fine_distance_rasters.R, from the folder holding anim_00_config.R.

source("anim_00_config.R")   # defines base_dir, out_dir and anim_dir

suppressPackageStartupMessages({
  library(ctmm); library(terra); library(sf); library(dplyr)
})

# Distance rasters. "_30m" selects the 30 m rasters built by
# build_fine_distance_rasters.R, which the report uses. Set RES_SUFFIX <- ""
# for the original 164.4 m rasters, whose distances take only the values
# 0, 164, 233, 329 ... m, so a 250 m threshold covers about 1.4 cells.
RES_SUFFIX <- "_30m"
checkpoint_dir <- file.path(base_dir, "checkpoints")
RASTERS <- c(traffic = file.path(checkpoint_dir, paste0("dist_traffic_raster", RES_SUFFIX, ".tif")),   # vehicle-capable roads (the exposure used in the report)
             allroad = file.path(checkpoint_dir, paste0("dist_road_raster",    RES_SUFFIX, ".tif")))   # every mapped road, as a comparison
RASTERS <- RASTERS[file.exists(RASTERS)]   # skip any raster that is missing
cat("Distance surfaces:", paste(names(RASTERS), collapse = ", "), "\n")

THRESH <- c(250, 1000)   # distance thresholds in metres; 250 m is a judgement, so 100 and 500 m are also reported

fit_files <- list.files(file.path(out_dir, "fits"), pattern = "\\.rds$", full.names = TRUE)
cat("Found", length(fit_files), "fit files\n")

# ---- 2. Exposure for one animal on one distance raster ------------------------
# f      path to the animal's cached fit (.rds)
# dist_r distance raster (SpatRaster, metres to nearest road)
# tag    "traffic" or "allroad"; sets the column prefix (ud_ or ud_allroad_)
one_animal <- function(f, dist_r, tag) {
  crs_dist <- terra::crs(dist_r)
  id  <- sub("\\.rds$", "", basename(f))
  obj <- readRDS(f)
  ud  <- obj$ud
  if (is.null(ud)) return(data.frame(id = id, ok = FALSE, note = "no ud in file"))

  # Probability mass in each cell (PMF), on ctmm's own grid and projection
  pmf <- tryCatch(ctmm::raster(ud, DF = "PMF"), error = function(e) NULL)
  if (is.null(pmf)) return(data.frame(id = id, ok = FALSE, note = "raster() failed"))
  pmf <- terra::rast(pmf)

  # Cell centres and their mass. Cells with zero mass are dropped to save time.
  v  <- terra::values(pmf)[, 1]                              # v  = probability in each cell
  xy <- terra::xyFromCell(pmf, seq_len(terra::ncell(pmf)))   # xy = cell-centre coordinates
  keep <- !is.na(v) & v > 0
  v <- v[keep]; xy <- xy[keep, , drop = FALSE]
  v <- v / sum(v)   # renormalise to 1, because the grid truncates the range edge

  # Project the cell centres into the distance raster's CRS and read d at each
  pts <- sf::st_as_sf(data.frame(x = xy[, 1], y = xy[, 2]),
                      coords = c("x", "y"), crs = terra::crs(pmf)) |>
         sf::st_transform(crs_dist)
  d   <- terra::extract(dist_r, terra::vect(pts))[, 2]   # d = distance to nearest road (m) at each cell
  ok  <- !is.na(d)
  # If the range runs off the edge of the raster, say how much probability was lost
  if (mean(ok) < 0.95)
    note <- sprintf("%.0f%% of UD mass off raster", 100 * (1 - sum(v[ok])))
  else note <- ""
  v2 <- v[ok] / sum(v[ok]); d2 <- d[ok]   # v2, d2 = probability and distance for cells that have a distance value

  out <- data.frame(id = id, ok = TRUE, note = note,
                    E_dist_m      = sum(v2 * d2),                     # expected distance to a road (m)
                    p_within_250  = 100 * sum(v2 * (d2 <= THRESH[1])),   # % of range within 250 m
                    p_within_1000 = 100 * sum(v2 * (d2 <= THRESH[2])),   # % of range within 1000 m
                    p_within_100  = 100 * sum(v2 * (d2 <= 100)),         # threshold sensitivity
                    p_within_500  = 100 * sum(v2 * (d2 <= 500)))
  # Prefix columns 4 to 8 so the two surfaces can sit side by side:
  # traffic gives ud_E_dist_m, ud_p_within_250 ...; allroad gives ud_allroad_E_dist_m ...
  names(out)[4:8] <- paste0(if (tag == "traffic") "ud_" else "ud_allroad_", names(out)[4:8])
  out
}

# ---- 3. Run every animal on each surface ---------------------------------------
run_surface <- function(tag) {
  dist_r <- terra::rast(RASTERS[[tag]])
  cat("\n== surface:", tag, "==\n")
  do.call(rbind, lapply(fit_files, function(f) {
    cat(" ", basename(f), "\n")
    # an error in one animal is recorded in `note` and does not stop the loop
    tryCatch(one_animal(f, dist_r, tag),
             error = function(e) data.frame(id = sub("\\.rds$", "", basename(f)),
                                            ok = FALSE, note = conditionMessage(e)))
  }))
}
res <- run_surface("traffic")
if ("allroad" %in% names(RASTERS)) {
  r2  <- run_surface("allroad")
  res <- left_join(res, r2 %>% select(-ok, -note), by = "id")
}

write.csv(res, file.path(anim_dir, "ud_exposure.csv"), row.names = FALSE)

# ---- 4. Checks printed to the console ----------------------------------------
cat("\n===== UD exposure checks =====\n")
cat("Animals ok:", sum(res$ok), "of", nrow(res), "\n")
print(res[!res$ok | nzchar(res$note), c("id", "ok", "note")])   # animals with a problem or an off-raster note

ind <- read.csv(file.path(anim_dir, "individual_table.csv"), stringsAsFactors = FALSE) |>
  left_join(res, by = "id")   # ind = per-animal table plus the new exposure columns
if (!"ud_allroad_p_within_250" %in% names(ind)) ind$ud_allroad_p_within_250 <- NA_real_

# Does the range-based exposure agree with the simpler fix-based exposure?
# rho is Spearman rank correlation; values near 1 mean the two rank animals alike.
cat("\nAgreement with fix-based exposure (Spearman rho, per species):\n")
for (sp in c("Bobcat", "Coyote")) {
  d <- filter(ind, species == sp, ok %in% TRUE, !is.na(pct_within_250))
  cat(sprintf("  %s n=%d  pct_within_250 vs ud_p_within_250: rho=%.2f | median dist vs ud_E_dist: rho=%.2f\n",
              sp, nrow(d),
              cor(d$pct_within_250, d$ud_p_within_250, method = "spearman"),
              cor(d$median_dist_m, d$ud_E_dist_m, method = "spearman")))
  if ("ud_allroad_p_within_250" %in% names(d))
    cat(sprintf("     vehicle-road vs all-road exposure (UD, within 250 m): rho=%.2f\n",
                cor(d$ud_p_within_250, d$ud_allroad_p_within_250, method = "spearman")))
}

# Median exposure by species and fate
cat("\nUD exposure by fate (median):\n")
print(ind %>% filter(ok %in% TRUE) %>% group_by(species, fate) %>%
        summarise(n = n(), E_dist = median(ud_E_dist_m),
                  p250 = median(ud_p_within_250), p1000 = median(ud_p_within_1000),
                  allroad_p250 = median(ud_allroad_p_within_250),
                  .groups = "drop"))
cat("==============================\n")
cat("Saved:", file.path(anim_dir, "ud_exposure.csv"), "\n")
