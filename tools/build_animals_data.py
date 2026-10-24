"""
build_animals_data.py
Purpose : Builds data/animals.js (the object D used by the page): one record per animal, the
          overlap pairs, death rates with exact Poisson intervals, the stored risk curves and
          the monthly counts of human-caused deaths.
Input   : inputs/individual_table.csv  one row per animal (R: build_individual_table.R)
          inputs/ud_exposure.csv       range-weighted road exposure (R: ud_exposure.R, 30 m raster)
          inputs/overlap_pairs.csv     pairwise territory overlap (tools/home_range_overlap.py)
Output  : data/animals.js
Run     : python3 tools/build_animals_data.py        (from the repository root)
Needs   : pandas, numpy, scipy, statsmodels
Notes   : The bootstrap bands use a fixed seed, so the file is the same every run.
          D.curves is stored only to check the live refit in the browser; the stand-alone
          version of the same model is risk_curve_model.py.
"""
import json, os, sys, warnings
import numpy as np, pandas as pd, statsmodels.api as sm
from scipy.stats import chi2
warnings.filterwarnings("ignore")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
IN   = lambda f: os.path.join(ROOT, "inputs", f)
OUT  = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "animals.js")

SEED, NBOOT = 21, 1500            # bootstrap resamples of animals for the 90% band
GRID = np.arange(15, 91, 5)       # exposure values (% of range within 250 m) where the curve is stored
MIN_FIXES_RELIABLE = 30           # N_area below this = territory estimated from little data ("unreliable")
MIN_CONCURRENT_DAYS = 90          # pairs tracked together for fewer days are dropped

# ---- 1. Join the tables ---------------------------------------------------------------
d = pd.read_csv(IN("individual_table.csv")).merge(
    pd.read_csv(IN("ud_exposure.csv"))[["id", "ud_p_within_250"]], on="id")
d["y"]   = d.fate.eq("Human").astype(int)       # event: human-caused death
d["x"]   = d.ud_p_within_250 / 10               # exposure in units of 10 percentage points
d["off"] = np.log(d.animal_years)               # Poisson offset: log of time at risk

# ---- 2. Risk curves (Poisson regression with offset, animal-level bootstrap) ---------------
def fit(s):
    return sm.GLM(s.y, sm.add_constant(s[["x"]]), family=sm.families.Poisson(), offset=s.off).fit()

rng = np.random.default_rng(SEED)
curves = {}
for sp in ["Bobcat", "Coyote"]:
    s = d[d.species == sp].dropna(subset=["x"])
    m = fit(s)
    pred = lambda mm, g: np.exp(mm.params["const"] + mm.params["x"] * g / 10)
    B = []
    for _ in range(NBOOT):
        t = s.sample(len(s), replace=True, random_state=int(rng.integers(1e9)))
        if t.y.sum() == 0: continue             # a resample with no deaths cannot be fitted
        try: B.append(pred(fit(t), GRID))
        except Exception: pass
    B = np.array(B)
    ci = np.exp(m.conf_int().loc["x"].values)
    curves[sp] = dict(grid=GRID.tolist(), fit=pred(m, GRID).round(4).tolist(),
        lo=np.percentile(B, 5, axis=0).round(4).tolist(), hi=np.percentile(B, 95, axis=0).round(4).tolist(),
        rr10=float(np.exp(m.params["x"])), rr_lo=float(ci[0]), rr_hi=float(ci[1]), p=float(m.pvalues["x"]),
        events=int(s.y.sum()), n=len(s),
        xmin=float(s.ud_p_within_250.min()), xmax=float(s.ud_p_within_250.max()))

# ---- 3. Death rates with exact Poisson 95% intervals ---------------------------------------
rates = {}
for sp in ["Bobcat", "Coyote"]:
    s = d[d.species == sp]; T = s.animal_years.sum()
    for key, fate in [("human", "Human"), ("carn", "Large carnivore")]:
        n  = int((s.fate == fate).sum())
        lo = 0 if n == 0 else chi2.ppf(.025, 2 * n) / 2
        hi = chi2.ppf(.975, 2 * (n + 1)) / 2
        rates[f"{sp}_{key}"] = dict(n=n, T=round(T, 1), r=n / T, lo=lo / T, hi=hi / T)

# ---- 4. One record per animal ---------------------------------------------------------------
inds = [dict(id=r.id, sp=r.species, sex=r.sex, site=r.site, fate=r.fate,
             sub=None if pd.isna(r.sub_cause) else r.sub_cause,
             yrs=round(r.animal_years, 2),
             p250=None if pd.isna(r.ud_p_within_250) else round(r.ud_p_within_250, 1),
             area=round(r.area_km2, 1), unrel=bool(r.N_area < MIN_FIXES_RELIABLE),
             on=str(r.deploy_on)[:10], off=str(r.deploy_off)[:10]) for _, r in d.iterrows()]

# ---- 5. Overlap pairs (reliable territories, tracked together long enough) ------------------
pw = pd.read_csv(IN("overlap_pairs.csv"))
pw = pw[(pw.concurrent_days >= MIN_CONCURRENT_DAYS) & ~pw.unreliable]
pairs = [[r.a, r.b, round(r.bc, 3)] for r in pw.itertuples()]

# ---- 6. Human-caused deaths by calendar month of death --------------------------------------
monthly = {}
for sp in ["Bobcat", "Coyote"]:
    s = d[(d.species == sp) & (d.fate == "Human")]
    monthly[sp] = [int((pd.to_datetime(s.deploy_off).dt.month == m).sum()) for m in range(1, 13)]

# ---- 7. Write -------------------------------------------------------------------------------
D = dict(inds=inds, pairs=pairs, curves=curves, rates=rates, monthly=monthly)
HEADER = """/* Per-animal table, overlap pairs, death rates, stored curves. Built by tools/build_animals_data.py.
   Fields: inds = {id, sp, sex, site, fate, sub, yrs, p250, area, unrel, on, off}; pairs = [idA, idB, overlap 0-1];
   rates = deaths per animal-year by species and cause with exact Poisson 95% interval. */
"""
with open(OUT, "w", encoding="utf-8") as f:
    f.write(HEADER + "const D=" + json.dumps(D, separators=(",", ":")) + ";\n")
print("wrote", OUT, "|", len(inds), "animals,", len(pairs), "pairs")
