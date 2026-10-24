# ---- 1. Settings ------------------------------------------------------------
# Corrects the residency flags in ctmm_summary.csv and repeats the species
# meta-analysis, without refitting any animal. It reads the cached fits in out/fits/.
# Run after run_ctmm_full.R, from a fresh session:  Rscript patch_meta.R
#
# Why it exists: in the first full run, fit$tau["position"] returned NA for
# fits of class "OUf", so three animals were flagged as not range-resident by
# mistake. Only MVBOB91M is genuinely flagged (its tau_p is more than half its
# tracking duration). run_ctmm_full.R now has the corrected lookup, so this
# patch is only needed for summaries written before that change.

base_dir <- "C:/Users/Nic/Documents/ctmm/FITS"   # same folder as run_ctmm_full.R
out_dir  <- file.path(base_dir, "out")
RESIDENCY_TAU_FRAC <- 0.5   # flag an animal if tau_p exceeds this fraction of its tracking duration (as in run_ctmm_full.R)
WEIGHTS <- TRUE             # not used below; kept so the settings match run_ctmm_full.R

library(ctmm)

summary_csv <- read.csv(file.path(out_dir, "ctmm_summary.csv"), stringsAsFactors = FALSE)   # one row per animal

# ---- 2. Re-derive tau_p and the residency flag --------------------------------
# tau_p (days) from a fitted model. ctmm orders $tau as (position, velocity), so
# use the entry named "position" if it exists and otherwise the first entry.
get_tau_p_days <- function(fit) {
  tp_vec <- fit$tau
  if (is.null(tp_vec) || length(tp_vec) == 0) return(NA_real_)
  tp <- if (!is.null(names(tp_vec)) && "position" %in% names(tp_vec)) tp_vec[["position"]] else tp_vec[1]
  if (is.na(tp) || is.infinite(tp)) NA_real_ else "day" %#% tp   # %#% converts seconds to days
}

cat("Re-deriving tau_p and residency_flag from the cached fits...\n")
old_flags <- summary_csv$residency_flag   # kept to report which animals change
for (i in seq_len(nrow(summary_csv))) {
  id <- summary_csv$id[i]
  f  <- file.path(out_dir, "fits", paste0(id, ".rds"))
  if (!file.exists(f)) { cat("  (no cached fit for", id, "- skipped)\n"); next }
  fit <- readRDS(f)$fit
  tau_p_days <- get_tau_p_days(fit)
  summary_csv$tau_p_days[i]     <- tau_p_days
  # flagged if tau_p is missing or longer than the allowed fraction of the duration
  summary_csv$residency_flag[i] <- is.na(tau_p_days) ||
    (tau_p_days > RESIDENCY_TAU_FRAC * summary_csv$duration_days[i])
}

changed <- summary_csv$id[old_flags != summary_csv$residency_flag]
cat("Residency flag changed for:", if (length(changed)) paste(changed, collapse = ", ") else "(none)", "\n")
cat("Now flagged (excluded from the meta-analysis):",
    paste(summary_csv$id[summary_csv$residency_flag %in% TRUE], collapse = ", "), "\n")

write.csv(summary_csv, file.path(out_dir, "ctmm_summary.csv"), row.names = FALSE)   # overwrites the old summary
cat("ctmm_summary.csv updated.\n\n")

# ---- 3. Repeat the species meta-analysis with the corrected exclusions --------
dir_meta <- file.path(out_dir, "meta")
dir.create(dir_meta, recursive = TRUE, showWarnings = FALSE)

clean_ids <- summary_csv$id[summary_csv$status == "ok" & !(summary_csv$residency_flag %in% TRUE)]   # animals kept
udl <- setNames(lapply(clean_ids, function(i) readRDS(file.path(out_dir, "fits", paste0(i, ".rds")))$ud),
                clean_ids)   # udl = list of home ranges (UDs), one per kept animal
species_by_id <- setNames(summary_csv$species[match(clean_ids, summary_csv$id)], clean_ids)

groups <- list(Bobcat = udl[species_by_id == "Bobcat"], Coyote = udl[species_by_id == "Coyote"])
groups <- groups[vapply(groups, length, integer(1)) >= 2]   # meta() needs at least 2 animals per group

png(file.path(dir_meta, "meta_per_species.png"), width = 2400, height = 1600, res = 200)
par(mfrow = c(1, length(groups)))
invisible(lapply(names(groups), function(g) meta(groups[[g]], sort = TRUE, main = paste0(g, " home-range meta-analysis"))))
dev.off()

if (length(groups) == 2) {
  META  <- meta(groups, plot = FALSE)
  ratio <- tryCatch(META['Bobcat/', '/Coyote', ], error = function(e) NULL)   # bobcat / coyote mean home-range area

  sink(file.path(dir_meta, "bobcat_vs_coyote_meta.txt"))
  cat("Species-level home-range meta-analysis (ctmm::meta), corrected residency exclusions\n")
  cat("Animals used:\n")
  print(table(species_by_id))
  cat("\nFull meta-analysis object:\n")
  print(META)
  if (!is.null(ratio)) { cat("\nBobcat / Coyote mean home-range area ratio:\n"); print(ratio) }
  sink()

  save(META, file = file.path(dir_meta, "bobcat_vs_coyote_meta.RData"))
  cat("Corrected meta-analysis written to", dir_meta, "\n")
  print(META)
  if (!is.null(ratio)) { cat("\nBobcat / Coyote mean home-range area ratio:\n"); print(ratio) }
} else {
  cat("Fewer than 2 groups with at least 2 animals, so the two-group comparison was skipped.\n")
}
