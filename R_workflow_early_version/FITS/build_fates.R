# ---- 1. Settings ------------------------------------------------------------
# Builds a fate table with one row per animal from the Movebank reference-data
# CSV, using the five categories of Table 1 in Prugh et al. (2023, Science
# 380:754-758): Human, Large carnivore, Other, Unknown, Survived/censored.
# The counts reproduce the published table to within one animal per species.
# Movebank's public release has 70 of the study's 72 animals, which accounts for
# the difference.
#
# All 70 animals are kept here, including the one excluded from the home-range
# analysis because its bootstrap did not converge (MVBOB71M, fate Human; Trapped).
 
#
# INPUT : the reference-data CSV (ref_file in anim_00_config.R)
# OUTPUT: anim/checkpoints/fates.rds     columns: id, species, cause_raw, fate
# Run order: before anim_03b_map_trajectories.R, anim_04b_mortality_counter.R
#            and build_individual_table.R.

source("anim_00_config.R")   # base_dir, ref_file, anim_dir

library(dplyr)

# read.csv() converts the CSV's hyphenated headers (animal-id,
# animal-death-comments) to dotted names (animal.id, animal.death.comments).
ref <- read.csv(file.path(base_dir, ref_file), stringsAsFactors = FALSE)

# ---- 2. Classify each death -----------------------------------------------------
# cause_raw is the free-text death comment. Comments start with "Cause: Human",
# "Cause: Predator", "Cause: Other" or "Cause: Unknown". A blank comment means
# the animal was not recorded as dead (survived, or the collar failed or was removed).
fates <- ref %>%
  transmute(
    id        = animal.id,
    species   = if_else(grepl("rufus", animal.taxon, ignore.case = TRUE),
                         "Bobcat", "Coyote"),
    cause_raw = na_if(trimws(animal.death.comments), ""),
    fate = case_when(
      is.na(cause_raw)                     ~ "Survived/censored",
      grepl("^Cause: Human",    cause_raw) ~ "Human",
      grepl("^Cause: Predator", cause_raw) ~ "Large carnivore",
      grepl("^Cause: Other",    cause_raw) ~ "Other",
      grepl("^Cause: Unknown",  cause_raw) ~ "Unknown",
      TRUE                                  ~ "Unknown"   # any comment not matching the patterns above
    )
  )

# ---- 3. Check and save --------------------------------------------------------------
cat("Fate counts (compare with Table 1 of Prugh et al. 2023):\n")
print(table(fates$species, fates$fate))

saveRDS(fates, file.path(anim_dir, "checkpoints", "fates.rds"))
cat("\nSaved:", file.path(anim_dir, "checkpoints", "fates.rds"), "\n")
