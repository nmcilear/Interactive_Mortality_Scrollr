# ---- 1. Settings ------------------------------------------------------------
# Parametric bootstrap for the animals with a low effective sample size
# (DOF[area] below 5; Fleming et al., 2019). The animals are listed in the
# boot_flag column of ctmm_summary.csv. ctmm.boot() refits the model repeatedly
# until a target precision is reached 
#
# This is kept as its own script, not run from inside run_ctmm_full.R. Rerunning
# run_ctmm_full.R would reload each animal's cached result, which holds the
# pre-patch tau_p and residency values, and overwrite ctmm_summary.csv, undoing
# patch_meta.R. This script writes only to out/boot/ and does not change
# ctmm_summary.csv or the species meta-analysis.
#
# INPUT : out/ctmm_summary.csv       after patch_meta.R (boot_flag column)
#         out/fits/<id>.rds          fitted models from run_ctmm_full.R
#         the two Movebank CSV files
# OUTPUT: out/boot/<id>_boot.rds     bootstrapped model and home range for each flagged animal
# Run order: run_ctmm_full.R, then patch_meta.R, then this script. 

base_dir   <- "C:/Users/Nic/Documents/ctmm/FITS"   # same folder as run_ctmm_full.R
event_file <- "GPS tracking of bobcats and coyotes in northern Washington.csv"
ref_file   <- "GPS tracking of bobcats and coyotes in northern Washington-reference-data.csv"
N_WORKERS  <- 5      # parallel workers, one animal each
WEIGHTS    <- TRUE   # weighted AKDE, as in run_ctmm_full.R
HDOP_MAX   <- 10     # fixes with HDOP above this are dropped, as in run_ctmm_full.R

library(ctmm)
library(parallel)

out_dir  <- file.path(base_dir, "out")
dir_boot <- file.path(out_dir, "boot")
dir.create(dir_boot, recursive = TRUE, showWarnings = FALSE)

# ---- 2. Animals to bootstrap ---------------------------------------------------------
summary_csv <- read.csv(file.path(out_dir, "ctmm_summary.csv"), stringsAsFactors = FALSE)
todo <- summary_csv$id[summary_csv$boot_flag %in% TRUE]   # ids with DOF[area] below the threshold
cat("Animals below the pHREML DOF threshold (to bootstrap):",
    paste(todo, collapse = ", "), "\n")
if (length(todo) == 0) { cat("Nothing flagged, so nothing to do.\n"); quit(save = "no") }

# ---- 3. Telemetry ---------------------------------------------------------------------
# Same read, join and filter steps as run_ctmm_full.R. No models are fitted here, so this is fast.
ev  <- read.csv(file.path(base_dir, event_file), stringsAsFactors = FALSE)   # ev  = GPS fixes
ref <- read.csv(file.path(base_dir, ref_file),   stringsAsFactors = FALSE)   # ref = one row per animal
ev$tag.local.identifier <- as.character(ev$tag.local.identifier)
ref$tag.id              <- as.character(ref$tag.id)
df <- merge(ev, ref, by.x = "tag.local.identifier", by.y = "tag.id", all.x = TRUE, sort = FALSE)
df$visible <- as.logical(toupper(as.character(df$visible)))
keep <- df$visible %in% TRUE &
  (is.na(df$gps.hdop) | df$gps.hdop <= HDOP_MAX) &
  (is.na(df$manipulation.type) | df$manipulation.type == "none") &
  !is.na(df$location.long) & !is.na(df$location.lat)
df <- df[keep, ]
tel_all <- as.telemetry(df)   # named list: one telemetry object per animal

# ---- 4. Bootstrap in parallel ------------------------------------------------------------
# Parallel workers (PSOCK) do not share memory with this session. Anything a
# worker function uses must be passed as an argument or exported with
# clusterExport(). The first version of this script exported only boot_one() and
# failed with "object 'dir_boot' not found", so the folder paths and the weights
# setting are now arguments of boot_one().
tasks <- lapply(todo, function(id) list(id = id, tel = tel_all[[id]]))   # one task per flagged animal

# task = list(id, tel); dir_fits = folder of fitted models; dir_boot = output
# folder; weights = TRUE/FALSE for weighted AKDE.
boot_one <- function(task, dir_fits, dir_boot, weights) {
  suppressPackageStartupMessages(library(ctmm))
  id  <- task$id
  tel <- task$tel
  f_out <- file.path(dir_boot, paste0(id, "_boot.rds"))
  if (file.exists(f_out)) return(paste(id, "skipped (already bootstrapped)"))
  tryCatch({
    fit  <- readRDS(file.path(dir_fits, paste0(id, ".rds")))$fit        # selected model from run_ctmm_full.R
    boot <- ctmm.boot(tel, fit, error = 0.01, trace = 0, cores = 1)     # error = target relative precision (1%)
    ud   <- akde(tel, boot, weights = weights)                          # home range from the bootstrapped model
    saveRDS(list(boot = boot, ud = ud), f_out)
    s  <- summary(ud, units = FALSE)
    ci <- s$CI[grep("^area", rownames(s$CI))[1], ]
    paste0(id, " ok: bootstrapped area ", round(ci["est"] / 1e6, 1), " km2 (",
           round(ci["low"] / 1e6, 1), "-", round(ci["high"] / 1e6, 1), " km2)")
  }, error = function(e) paste(id, "error:", conditionMessage(e)))
}

cl <- makeCluster(min(N_WORKERS, length(todo)))
clusterExport(cl, "boot_one")
res <- tryCatch(
  parLapply(cl, tasks, boot_one,
            dir_fits = file.path(out_dir, "fits"), dir_boot = dir_boot, weights = WEIGHTS),
  finally = stopCluster(cl)
)
cat(paste(unlist(res), collapse = "\n"), "\n")
cat("\nBootstrapped results saved to", dir_boot,
    ". Compare each area and interval with the original pHREML estimate for the",
    "same id in ctmm_summary.csv to see how much the correction changed it.\n")
