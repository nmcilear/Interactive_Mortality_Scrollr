
library(readr)
library(data.table)
library(janitor)
library(lubridate)

library(dplyr)
library(tidyr)
library(stringr)
library(forcats)

library(ggplot2)
library(ggthemes)
library(patchwork)
library(scales)
library(ggpubr)

library(sf)
library(terra)
library(ggspatial)

library(ctmm)
library(move2)
library(MODISTools)
base_dir   <- "C:/Users/Nic/Documents/ctmm/FITS"   # folder holding the two input CSVs; results go to base_dir/out
event_file <- "GPS tracking of bobcats and coyotes in northern Washington.csv"                  # Movebank event table (one row per GPS fix)
ref_file   <- "GPS tracking of bobcats and coyotes in northern Washington-reference-data.csv"   # Movebank reference table (one row per animal)

N_WORKERS      <- 5      # parallel worker processes; the PC has 6 physical cores, so one is left free
TEST           <- FALSE  # TRUE fits only 3 animals (densest, median, sparsest) to check timing and the code path
WEIGHTS        <- TRUE   # TRUE passes weights = TRUE to akde(), which corrects for uneven time between fixes (wAKDE)
FIT_ML         <- FALSE  # TRUE also fits by maximum likelihood (ML) and reports its % difference from pHREML; roughly doubles run time
HDOP_MAX       <- 10     # fixes with horizontal dilution of precision (HDOP) above this are dropped as poor GPS quality
DOF_ML_MIN     <- 20     # ML needs at least this many effective samples of area (DOF[area]) to be nearly unbiased (Fleming et al. 2019)
DOF_PHREML_MIN <- 5      # pHREML (the default method here) needs DOF[area] of about 4-5 for ~5% bias (Fleming et al. 2019)
RUN_BOOT       <- FALSE  # TRUE runs a parametric bootstrap for animals below DOF_PHREML_MIN inside this script (slow);
                         # the bootstrap was run separately in run_bootstrap.R, so this is FALSE
RESIDENCY_TAU_FRAC <- 0.5  # an animal is flagged as not range-resident if tau_p (the time its position takes to
                           # decorrelate) exceeds this fraction of its tracking duration, because the
                           # variogram may not have levelled off within the data

# ---- 2. Packages and output folders ------------------------------------------
if (!requireNamespace("ctmm", quietly = TRUE)) stop("install.packages('ctmm') first")
library(ctmm)
library(parallel)
options(warn = 1)   # print warnings as they happen, so they appear in the console log

out_dir <- file.path(base_dir, "out")
cfg <- list(weights = WEIGHTS, fit_ml = FIT_ML, dof_ml_min = DOF_ML_MIN,
            dof_phreml_min = DOF_PHREML_MIN, residency_tau_frac = RESIDENCY_TAU_FRAC,
            dir_fits = file.path(out_dir, "fits"),       # one .rds per animal (fit, naive fit, UD, naive UD, summary row)
            dir_fig  = file.path(out_dir, "figures"),    # one 4-panel diagnostic PNG per animal
            dir_log  = file.path(out_dir, "logs"),       # progress.log, appended by every worker
            dir_boot = file.path(out_dir, "boot"),       # bootstrap results (section 8)
            dir_meta = file.path(out_dir, "meta"))       # species-level meta-analysis (section 9)
# cfg is passed to the workers, so every setting above travels with the task
invisible(lapply(cfg[grepl("^dir_", names(cfg))], dir.create,
                 recursive = TRUE, showWarnings = FALSE))

# ---- 3. Read, join and clean the GPS data ------------------------------------
ev  <- read.csv(file.path(base_dir, event_file), stringsAsFactors = FALSE)   # ev  = GPS fixes
ref <- read.csv(file.path(base_dir, ref_file),   stringsAsFactors = FALSE)   # ref = animal details (species, sex, fate)
ev$tag.local.identifier <- as.character(ev$tag.local.identifier)   # join key in the event table
ref$tag.id              <- as.character(ref$tag.id)                # join key in the reference table

df <- merge(ev, ref, by.x = "tag.local.identifier", by.y = "tag.id",
            all.x = TRUE, sort = FALSE)
stopifnot(nrow(df) == nrow(ev))   # the join must not duplicate or lose fixes

df$visible <- as.logical(toupper(as.character(df$visible)))   # Movebank stores "true"/"false" as text
# Keep a fix if it is visible, has acceptable HDOP (or no HDOP recorded), was not
# manually edited, and has coordinates
keep <- df$visible %in% TRUE &
  (is.na(df$gps.hdop) | df$gps.hdop <= HDOP_MAX) &
  (is.na(df$manipulation.type) | df$manipulation.type == "none") &
  !is.na(df$location.long) & !is.na(df$location.lat)
df <- df[keep, ]
cat("Fixes retained:", nrow(df), "\n")   # 117,161 in the run reported in the final report

# One species label per animal, from the first row of each animal's group
sp <- sapply(split(df$individual.taxon.canonical.name, df$individual.local.identifier), `[`, 1)
sp <- ifelse(sp == "Lynx rufus", "Bobcat", ifelse(sp == "Canis latrans", "Coyote", sp))

tel <- as.telemetry(df)                                              # named list: one ctmm telemetry object per animal
tel <- tel[order(vapply(tel, nrow, numeric(1)), decreasing = TRUE)]  # densest first, because they are the slowest to fit
cat("Individuals:", length(tel), "\n")

ids <- names(tel)
if (TEST) ids <- ids[unique(c(1, ceiling(length(ids) / 2), length(ids)))]
tasks <- lapply(ids, function(i) list(id = i, tel = tel[[i]], species = unname(sp[i])))   # one task per animal

# ---- 4. Workflow for one animal (runs on a worker) ----------------------------
# Returns one row of the summary table. Everything is cached in
# out/fits/<id>.rds, so re-running the script skips finished animals.
fit_one <- function(task, cfg) {
  suppressPackageStartupMessages(library(ctmm))
  id  <- task$id
  tel <- task$tel
  f_out <- file.path(cfg$dir_fits, paste0(id, ".rds"))
  log_line <- function(msg) cat(format(Sys.time(), "%H:%M:%S"), id, msg, "\n",
                                file = file.path(cfg$dir_log, "progress.log"), append = TRUE)
  if (file.exists(f_out)) { log_line("skipped (done)"); return(readRDS(f_out)$row) }

  t0 <- Sys.time()
  log_line("start")

  # Empty summary row, filled in as each step succeeds. If a step fails, the row
  # keeps its NA values and records the error message in `status`.
  blank <- data.frame(
    id = id, species = task$species, n_fixes = nrow(tel),
    duration_days = NA_real_,       # tracking duration
    model = NA_character_,          # name of the selected movement model (e.g. OU, OUF)
    top_models = NA_character_,     # best three models by AICc
    tau_p_days = NA_real_,          # position timescale in days (time to cross the range)
    residency_flag = NA,            # TRUE if tau_p is more than RESIDENCY_TAU_FRAC of the duration
    N_area = NA_real_,              # effective sample size for the area estimate, DOF[area]
    N_mean = NA_real_,              # effective sample size for the mean location, DOF[mean]
    area_km2 = NA_real_, area_lo_km2 = NA_real_, area_hi_km2 = NA_real_,   # AKDE 95% range area and its 95% CI
    kde_area_km2 = NA_real_,        # 95% range area from the naive KDE (treats fixes as independent)
    pct_underest_by_kde = NA_real_, # how much smaller the naive area is than the AKDE area, in %
    resid_acf_flag = NA,            # TRUE if residual autocorrelation remains after the fit
    pct_diff_ML = NA_real_,         # % difference between the ML and pHREML areas (only if FIT_ML)
    minutes = NA_real_, status = NA_character_, stringsAsFactors = FALSE
  )

  res <- tryCatch({

    # 4.0 Sampling summary and tracking duration
    smry <- summary(tel)
    duration_days <- "day" %#% diff(range(tel$t))   # %#% converts units (seconds to days)

    # 4.1 Variogram: shows whether the spread of positions levels off (a home range)
    svf <- variogram(tel)

    # 4.2 Naive baseline: a model that treats fixes as independent. It is kept
    #     so the effect of correcting for autocorrelation is a number per animal.
    IID <- ctmm.fit(tel)

    # 4.3 Model selection: ctmm.guess() gives starting values, ctmm.select() fits
    #     the candidate models and ranks them by AICc (pHREML fitting)
    guess    <- ctmm.guess(tel, interactive = FALSE)
    fits_all <- ctmm.select(tel, guess, method = "pHREML", cores = 1, verbose = TRUE)
    fit      <- fits_all[[1]]                                    # best model by AICc
    top_n    <- min(3, length(fits_all))
    top_models <- paste(names(fits_all)[seq_len(top_n)], collapse = " > ")

    # DOF[mean] is stored on the fitted model's summary, not on the UD summary
    fit_dof <- summary(fit)$DOF
    N_mean_val <- if (!is.null(fit_dof) && "mean" %in% names(fit_dof)) unname(fit_dof["mean"]) else NA_real_

    # tau_p, the position timescale. ctmm orders $tau as (position, velocity).
    # Some fits (class "OUf") do not name the entry "position", so the name lookup
    # returns NA; the fallback takes the first entry. This is the bug patched
    # for earlier runs in patch_meta.R.
    tau_p_days <- tryCatch({
      tp_vec <- fit$tau
      if (is.null(tp_vec) || length(tp_vec) == 0) {
        NA_real_
      } else {
        tp <- if (!is.null(names(tp_vec)) && "position" %in% names(tp_vec)) tp_vec[["position"]] else tp_vec[1]
        if (is.na(tp) || is.infinite(tp)) NA_real_ else "day" %#% tp
      }
    }, error = function(e) NA_real_)
    residency_flag <- is.na(tau_p_days) || (tau_p_days > cfg$residency_tau_frac * duration_days)
    if (residency_flag) log_line("WARNING: tau_p is long relative to the tracking duration")

    # 4.4 Residual check: does the selected model leave autocorrelation behind?
    res_id  <- residuals(tel, fit)
    acf_fit <- correlogram(res_id, res = 10)
    # correlogram() returns columns SVF (the autocorrelation estimate), DOF and lag,
    # with no stored interval. The approximate 95% band under no autocorrelation
    # is +-1.96/sqrt(DOF), the same convention as base R's acf() plot. The flag is
    # TRUE if more than 20% of the first 20 lags fall outside that band.
    resid_acf_flag <- tryCatch({
      n_check  <- min(20, nrow(acf_fit))
      acf_vals <- acf_fit$SVF[seq_len(n_check)]
      dof_vals <- acf_fit$DOF[seq_len(n_check)]
      tol <- 1.96 / sqrt(pmax(dof_vals, 1))
      mean(abs(acf_vals) > tol, na.rm = TRUE) > 0.2
    }, error = function(e) { log_line(paste0("resid_acf_flag error: ", conditionMessage(e))); NA })

    # 4.5 Home ranges: weighted AKDE (bias-corrected by default) and the naive KDE
    ud     <- akde(tel, fit, weights = cfg$weights)   # ud  = autocorrelated home range
    kde    <- akde(tel, IID)                           # kde = naive home range

    s   <- summary(ud, units = FALSE)                  # units = FALSE gives SI units, so area is in m^2
    ci  <- s$CI[grep("^area", rownames(s$CI))[1], ]    # area row: low, est, high
    s_k <- summary(kde, units = FALSE)
    ci_k<- s_k$CI[grep("^area", rownames(s_k$CI))[1], ]

    row <- blank
    row$duration_days <- duration_days
    row$model         <- summary(fit)$name
    row$top_models    <- top_models
    row$tau_p_days    <- tau_p_days
    row$residency_flag<- residency_flag
    row$N_area        <- unname(s$DOF["area"])
    row$N_mean        <- N_mean_val
    row$area_lo_km2   <- unname(ci["low"])  / 1e6      # m^2 to km^2
    row$area_km2      <- unname(ci["est"])  / 1e6
    row$area_hi_km2   <- unname(ci["high"]) / 1e6
    row$kde_area_km2  <- unname(ci_k["est"]) / 1e6
    # positive = the naive KDE area is smaller than the AKDE area
    row$pct_underest_by_kde <- unname((1 - ci_k["est"] / ci["est"]) * 100)
    row$resid_acf_flag <- resid_acf_flag

    if (cfg$fit_ml) {   # optional ML comparison
      fit_ml <- ctmm.select(tel, guess, method = "ML", cores = 1)
      s_ml   <- summary(akde(tel, fit_ml), units = FALSE)
      a_ml   <- s_ml$CI[grep("^area", rownames(s_ml$CI))[1], "est"]
      row$pct_diff_ML <- unname((1 - a_ml / ci["est"]) * 100)
      if (unname(s$DOF["area"]) < cfg$dof_ml_min)
        log_line("NOTE: DOF[area] is below the ML threshold, so the ML comparison is unreliable")
    }

    # 4.6 Diagnostic figure (a plotting error must not lose the fit, hence tryCatch)
    tryCatch({
      png(file.path(cfg$dir_fig, paste0(id, ".png")), width = 4800, height = 1200, res = 200)
      par(mfrow = c(1, 4))
      plot(svf, CTMM = list(IID, fit), main = paste(id, "- variogram: IID vs selected"))
      plot(acf_fit, main = "residual ACF (selected model)")
      plot(tel, UD = kde, main = paste0("naive IID KDE (", round(row$kde_area_km2, 1), " km2)"))
      plot(tel, UD = ud,  main = paste0("wAKDEc (", row$model, ", ", round(row$area_km2, 1), " km2)"))
    }, error = function(e) NULL, finally = try(dev.off(), silent = TRUE))

    row$minutes <- as.numeric(difftime(Sys.time(), t0, units = "mins"))
    row$status  <- "ok"
    saveRDS(list(fit = fit, IID = IID, ud = ud, kde = kde, row = row), f_out)   # cache for later scripts
    row
  }, error = function(e) {
    b <- blank
    b$status  <- paste("error:", conditionMessage(e))
    b$minutes <- as.numeric(difftime(Sys.time(), t0, units = "mins"))
    b
  })

  log_line(paste0("finish: ", res$status, " (", round(res$minutes, 1), " min)"))
  res
}

# ---- 5. Run all animals in parallel -----------------------------------------
cat("Starting", length(tasks), "fits on", N_WORKERS, "workers. Progress: ",
    file.path(cfg$dir_log, "progress.log"), "\n")
cl <- makeCluster(N_WORKERS)   # PSOCK workers; ctmm's own multi-core option stays at 1 because forking stalls on Windows
clusterExport(cl, "fit_one")
t_start <- Sys.time()
rows <- tryCatch(parLapplyLB(cl, tasks, fit_one, cfg = cfg, chunk.size = 1),   # load-balanced, one animal at a time
                 finally = stopCluster(cl))
cat("Wall time (min):", round(as.numeric(difftime(Sys.time(), t_start, units = "mins")), 1), "\n")

# ---- 6. Summary table --------------------------------------------------------
results <- do.call(rbind, rows)
results$exp_bias_pct <- 100 / results$N_area^2     # expected remaining pHREML bias in %, about 1/N^2 (Fleming et al. 2019)
results$boot_flag    <- !is.na(results$N_area) & results$N_area < cfg$dof_phreml_min   # TRUE = needs the bootstrap
results <- results[order(-results$n_fixes), ]
write.csv(results, file.path(out_dir, "ctmm_summary.csv"), row.names = FALSE)   # read by patch_meta.R, run_bootstrap.R and build_individual_table.R
print(results)

# Print the animals that should not be used as clean home-range estimates
if (any(results$residency_flag %in% TRUE, na.rm = TRUE))
  cat("RESIDENCY WARNING, excluded from the meta-analysis:",
      paste(results$id[which(results$residency_flag %in% TRUE)], collapse = ", "), "\n")
if (any(results$resid_acf_flag %in% TRUE, na.rm = TRUE))
  cat("FIT WARNING, residual autocorrelation remains:",
      paste(results$id[which(results$resid_acf_flag %in% TRUE)], collapse = ", "), "\n")

ok <- results$id[results$status == "ok"]
fits <- setNames(lapply(ok, function(i) readRDS(file.path(cfg$dir_fits, paste0(i, ".rds")))$fit), ok)
save(fits, results, file = file.path(out_dir, "ctmm_fits_all.RData"))   # fitted models only; the UDs stay in fits/<id>.rds

# ---- 7. (optional) bootstrap for animals with low effective sample size -----
# Only animals with DOF[area] below DOF_PHREML_MIN are bootstrapped. run_bootstrap.R
# does the same job as a standalone script.
boot_one <- function(task, cfg) {
  suppressPackageStartupMessages(library(ctmm))
  id <- task$id
  f_out <- file.path(cfg$dir_boot, paste0(id, "_boot.rds"))
  if (file.exists(f_out)) return(paste(id, "skipped"))
  tryCatch({
    fit  <- readRDS(file.path(cfg$dir_fits, paste0(id, ".rds")))$fit
    boot <- ctmm.boot(task$tel, fit, error = 0.01, trace = 0, cores = 1)   # error = target precision of the bootstrap
    ud   <- akde(task$tel, boot, weights = cfg$weights)
    saveRDS(list(boot = boot, ud = ud), f_out)
    paste(id, "ok")
  }, error = function(e) paste(id, "error:", conditionMessage(e)))
}

if (RUN_BOOT && any(results$boot_flag)) {
  todo <- results$id[results$boot_flag]
  cat("Bootstrapping (DOF[area] <", cfg$dof_phreml_min, "):", paste(todo, collapse = ", "), "\n")
  btasks <- lapply(todo, function(i) list(id = i, tel = tel[[i]]))
  cl <- makeCluster(min(N_WORKERS, length(btasks)))
  clusterExport(cl, "boot_one")
  print(unlist(tryCatch(parLapplyLB(cl, btasks, boot_one, cfg = cfg, chunk.size = 1),
                        finally = stopCluster(cl))))
}

# ---- 8. Species-level meta-analysis ------------------------------------------
# ctmm::meta() combines individual home ranges into a species mean with
# uncertainty carried through. Animals flagged by the residency check are left out.
clean_ids <- results$id[results$status == "ok" & !(results$residency_flag %in% TRUE)]
if (length(clean_ids) >= 2) {

  udl <- setNames(lapply(clean_ids, function(i) readRDS(file.path(cfg$dir_fits, paste0(i, ".rds")))$ud),
                  clean_ids)   # udl = list of home ranges (UDs), one per animal
  species_by_id <- setNames(results$species[match(clean_ids, results$id)], clean_ids)

  groups <- list(Bobcat = udl[species_by_id == "Bobcat"], Coyote = udl[species_by_id == "Coyote"])
  groups <- groups[vapply(groups, length, integer(1)) >= 2]   # meta() needs at least 2 animals per group

  if (length(groups) >= 1) {
    png(file.path(cfg$dir_meta, "meta_per_species.png"), width = 2400, height = 1600, res = 200)
    par(mfrow = c(1, length(groups)))
    invisible(lapply(names(groups), function(g) {
      meta(groups[[g]], sort = TRUE, main = paste0(g, " home-range meta-analysis"))
    }))
    dev.off()
  }

  if (length(groups) == 2) {
    # Two-group comparison: ratio of mean home-range area (bobcat / coyote) with
    # its confidence interval. An interval that includes 1 means no detectable difference.
    META <- meta(groups, plot = FALSE)
    ratio <- tryCatch(META['Bobcat/', '/Coyote', ], error = function(e) NULL)
    sink(file.path(cfg$dir_meta, "bobcat_vs_coyote_meta.txt"))
    cat("Species-level home-range meta-analysis (ctmm::meta)\n")
    cat("Animals used (residency-flagged animals excluded):\n")
    print(table(species_by_id))
    cat("\nFull meta-analysis object:\n")
    print(META)
    if (!is.null(ratio)) { cat("\nBobcat / Coyote mean home-range area ratio:\n"); print(ratio) }
    sink()
    save(META, file = file.path(cfg$dir_meta, "bobcat_vs_coyote_meta.RData"))
    cat("Meta-analysis written to", cfg$dir_meta, "\n")
  } else {
    cat("Fewer than 2 animals per species, so no two-group meta-analysis",
        "(expected with TEST = TRUE; rerun with TEST = FALSE).\n")
  }
} else {
  cat("Fewer than 2 usable animals, so the meta-analysis was skipped.\n")
}
