# ============================================================
# ONE ROW PER INDIVIDUAL -- the table every statistical figure is built from.
#
# Joins what already exists in separate places:
#   * home range (AKDE area + 95% CI)        <- out/ctmm_summary.csv
#   * fate + cause of death                   <- anim/checkpoints/fates.rds (build_fates.R)
#   * road / traffic exposure per individual  <- anim/checkpoints/tracks_master.rds
#   * sex, study site, mass, tracking dates   <- the reference-data CSV
# and adds exposure time (animal-years), so mortality can be expressed as a
# RATE (deaths per animal-year) rather than a raw count.
#
# Output: anim/individual_table.csv  (+ prints a diagnostic block to paste back)
# This script does NO modelling -- it only assembles and checks the data, so
# any problem shows up here instead of inside a figure.
# ============================================================

source("anim_00_config.R")
library(dplyr)

summary_csv <- read.csv(file.path(out_dir, "ctmm_summary.csv"), stringsAsFactors = FALSE)
fates       <- readRDS(file.path(anim_dir, "checkpoints", "fates.rds"))
tracks      <- readRDS(file.path(anim_dir, "checkpoints", "tracks_master.rds"))
ref         <- read.csv(file.path(base_dir, ref_file), stringsAsFactors = FALSE)

# ---- Road / traffic exposure, per individual -------------------------------
# dist_to_road_m in tracks_master is distance to the traffic-road surface
# (dist_traffic_raster.tif). Three summaries, because each answers a
# different question:
#   median_dist_m  : typical distance to a traffic road
#   pct_within_250 : share of fixes within 250 m (time spent "at the edge")
#   pct_within_1000: share within 1 km (broader exposure)
# 250 m is a judgement call, not a standard -- the figures should say so, and
# a sensitivity check at 100 / 500 m is cheap if it matters.
exposure <- tracks %>%
  group_by(id) %>%
  summarise(n_fixes_track   = n(),
            median_dist_m   = median(dist_to_road_m, na.rm = TRUE),
            pct_within_250  = 100 * mean(dist_to_road_m <= 250,  na.rm = TRUE),
            pct_within_1000 = 100 * mean(dist_to_road_m <= 1000, na.rm = TRUE),
            first_fix       = min(timestamp),
            last_fix        = max(timestamp),
            .groups = "drop")

# ---- Reference attributes ---------------------------------------------------
ref_small <- ref %>%
  transmute(id = animal.id,
            sex = animal.sex,
            site = study.site,
            mass_g = animal.mass,
            deploy_on  = as.Date(substr(deploy.on.date, 1, 10)),
            deploy_off = as.Date(substr(deploy.off.date, 1, 10)))

# ---- Assemble ---------------------------------------------------------------
ind <- summary_csv %>%
  select(id, species, n_fixes, duration_days, area_km2, area_lo_km2, area_hi_km2,
         N_area, tau_p_days, residency_flag, status) %>%
  left_join(fates %>% select(id, fate, cause_raw), by = "id") %>%
  left_join(ref_small, by = "id") %>%
  left_join(exposure, by = "id") %>%
  mutate(
    # Exposure time: use the deployment window (the period the animal was at
    # risk), NOT the number of fixes.
    animal_years = as.numeric(deploy_off - deploy_on) / 365.25,
    human_death  = fate == "Human",
    carn_death   = fate == "Large carnivore",
    any_death    = fate != "Survived/censored",
    in_akde_set  = status == "ok" & !(residency_flag %in% TRUE),
    sub_cause    = sub("^Cause: [A-Za-z]+; SubCause: ", "", cause_raw)
  )

write.csv(ind, file.path(anim_dir, "individual_table.csv"), row.names = FALSE)

# ---- Diagnostics -- paste this block back -----------------------------------
cat("\n============ individual_table diagnostics ============\n")
cat("Rows:", nrow(ind), " | with AKDE area:", sum(!is.na(ind$area_km2)),
    " | with road exposure:", sum(!is.na(ind$median_dist_m)),
    " | with fate:", sum(!is.na(ind$fate)), "\n")
cat("\nFate x species:\n");  print(table(ind$species, ind$fate, useNA = "ifany"))
cat("\nAnimal-years at risk, by species (cf. paper: ~59 bobcat, ~52 coyote):\n")
print(tapply(ind$animal_years, ind$species, sum, na.rm = TRUE))
cat("\nCrude mortality rate, deaths per animal-year, by species and cause:\n")
print(ind %>% group_by(species) %>%
        summarise(animal_years = sum(animal_years, na.rm = TRUE),
                  human   = sum(human_death, na.rm = TRUE),
                  carnivore = sum(carn_death, na.rm = TRUE),
                  human_rate = human / animal_years,
                  carnivore_rate = carnivore / animal_years, .groups = "drop"))
cat("\nRoad exposure by fate (median across individuals):\n")
print(ind %>% filter(!is.na(median_dist_m)) %>% group_by(species, fate) %>%
        summarise(n = n(), median_dist_m = median(median_dist_m),
                  pct_within_250 = median(pct_within_250), .groups = "drop"))
cat("\nSpearman: log home-range area vs median distance to traffic road, per species:\n")
for (sp in c("Bobcat", "Coyote")) {
  d <- ind %>% filter(species == sp, !is.na(area_km2), !is.na(median_dist_m))
  r <- suppressWarnings(cor.test(log(d$area_km2), d$median_dist_m, method = "spearman"))
  cat(sprintf("  %s: n=%d  rho=%.2f  p=%.3f\n", sp, nrow(d), unname(r$estimate), r$p.value))
}
cat("\nMissing values by column (anything unexpected here needs fixing before figures):\n")
print(colSums(is.na(ind[, c("area_km2", "fate", "sex", "site", "animal_years", "median_dist_m")])))
cat("======================================================\n")
cat("Saved:", file.path(anim_dir, "individual_table.csv"), "\n")
