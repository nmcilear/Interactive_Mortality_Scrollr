"""Pairwise home-range overlap from ctmm fits (Bhattacharyya coefficient between the
fitted stationary Gaussian range distributions N(mu, Sigma)).
Usage: python3 home_range_overlap.py ctmm_fits_all.RData individual_table.csv ud_exposure.csv outdir
BC = exp(-D_B); D_B = (1/8) d' S^-1 d + (1/2) ln( det S / sqrt(det S1 det S2) ), S=(S1+S2)/2.
BC=1 identical ranges, 0 disjoint. Caveats printed in the report: Gaussian summary of the
range, and animals were NOT all tracked at the same time (we report concurrency)."""
import sys, warnings, numpy as np, pandas as pd, rdata
warnings.filterwarnings("ignore")
rda, indf, udf, out = sys.argv[1:5]
fits = rdata.read_rda(rda)["fits"]
ind = pd.read_csv(indf, parse_dates=["deploy_on", "deploy_off"]).merge(pd.read_csv(udf)[["id","ud_p_within_250"]], on="id")
P = {}
for k, f in fits.items():
    mu = np.array(f["mu"]).ravel()[:2].astype(float); S = np.array(f["sigma"]).astype(float)
    P[str(k)] = (mu, S)
ids = [i for i in ind.id if i in P]
ind = ind.set_index("id").loc[ids]
def bc(a, b):
    m1, S1 = P[a]; m2, S2 = P[b]; S = (S1 + S2) / 2; d = m1 - m2
    db = d @ np.linalg.solve(S, d) / 8 + 0.5 * np.log(np.linalg.det(S) / np.sqrt(np.linalg.det(S1) * np.linalg.det(S2)))
    return float(np.exp(-db))
# sanity: Gaussian 95%% area vs AKDE area
area_g = {i: -2*np.log(.05)*np.pi*np.sqrt(np.linalg.det(P[i][1]))/1e6 for i in ids}
chk = pd.DataFrame({"gauss_km2": pd.Series(area_g), "akde_km2": ind.area_km2}); chk["ratio"] = chk.gauss_km2 / chk.akde_km2
print("Gaussian 95%% area / AKDE area: median %.2f, IQR %.2f-%.2f" % (chk.ratio.median(), *chk.ratio.quantile([.25,.75])))
UNREL = set(ind.index[ind.N_area < 30])
rows = []
for a in range(len(ids)):
    for b in range(a+1, len(ids)):
        i, j = ids[a], ids[b]
        if ind.site[i] != ind.site[j]: continue                      # study areas ~150 km apart
        co = (min(ind.deploy_off[i], ind.deploy_off[j]) - max(ind.deploy_on[i], ind.deploy_on[j])).days
        rows.append(dict(a=i, b=j, site=ind.site[i], sp_a=ind.species[i], sp_b=ind.species[j],
                         same_species=ind.species[i] == ind.species[j], bc=bc(i, j), concurrent_days=co,
                         unreliable=(i in UNREL) or (j in UNREL)))
pw = pd.DataFrame(rows); pw.to_csv(f"{out}/overlap_pairs.csv", index=False)
full = pd.DataFrame(np.nan, index=ids, columns=ids)
for r in rows: full.loc[r["a"], r["b"]] = full.loc[r["b"], r["a"]] = r["bc"]
full.to_csv(f"{out}/overlap_matrix.csv")
conc = pw[(pw.concurrent_days >= 90) & ~pw.unreliable].copy()
conc["kind"] = np.where(conc.same_species, conc.sp_a, "Bobcat-Coyote")
print("pairs total", len(pw), "| concurrent>=90d & reliable", len(conc))
print(conc.groupby(["site","kind"]).bc.agg(["count","mean","median", lambda x:(x>0.1).mean()]).round(3).rename(columns={"<lambda_0>":"share>0.1"}))
# per-animal heterospecific load: sum of BC with concurrent other-species animals (same site)
load = {}
for i in ids:
    q = conc[((conc.a == i) | (conc.b == i)) & ~conc.same_species]
    load[i] = q.bc.sum() if len(q) else np.nan
    # also number of concurrent heterospecific neighbours
ind["hetero_load"] = pd.Series(load)
ind["n_hetero"] = [((conc.a == i) | (conc.b == i))[~conc.same_species].sum() for i in ind.index]
ind.reset_index().to_csv(f"{out}/individual_overlap.csv", index=False)
from scipy.stats import spearmanr
for sp in ["Bobcat","Coyote"]:
    s = ind[(ind.species == sp) & ind.hetero_load.notna() & ~ind.index.isin(UNREL)]
    r = spearmanr(s.hetero_load, s.ud_p_within_250)
    print(f"{sp}: heterospecific overlap load vs road exposure (UD p250): n={len(s)} rho={r[0]:.2f} p={r[1]:.3f}")
