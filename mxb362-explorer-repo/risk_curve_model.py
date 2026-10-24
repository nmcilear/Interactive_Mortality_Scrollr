"""
risk_curve_model.py
Purpose : Poisson rate model of human-caused deaths against road-edge exposure,
          with an animal-level bootstrap band. This is the model behind the risk
          curve in the interactive page and slides.
Input   : individual_exposure.csv (one row per animal: species, fate, years_tracked,
          p250_territory = % of the utilisation distribution within 250 m of a road)
Output  : risk_curve_<species>.csv (grid, fit, lo, hi) and a printed summary.
Model   : log(deaths per animal-year) = b0 + b1 * exposure, offset log(years tracked),
          fitted by iteratively reweighted least squares.
Band    : 90% interval (5th to 95th percentile) over 2,000 refits, each on animals
          resampled with replacement. Curve is reported only inside the observed range.
Run     : python3 risk_curve_model.py [individual_exposure.csv] [output_dir]
"""
import sys, os
import numpy as np, pandas as pd

path = sys.argv[1] if len(sys.argv) > 1 else 'individual_exposure.csv'
out_dir = sys.argv[2] if len(sys.argv) > 2 else '.'
os.makedirs(out_dir, exist_ok=True)
d = pd.read_csv(path)
GRID = np.arange(10, 91, 5)      # exposure values at which the curve is evaluated (% of range)
NBOOT = 2000

def fit_poisson(E, T, y, iters=100):
    """Poisson regression with offset log(T); returns (b0, b1) or None."""
    X = np.c_[np.ones(len(E)), E]
    b = np.array([np.log(max(y.sum(), .5) / T.sum()), 0.0])
    for _ in range(iters):
        mu = np.exp(X @ b + np.log(T))
        z = X @ b + (y - mu) / mu
        A = X.T @ (X * mu[:, None])
        try:
            b_new = np.linalg.solve(A, X.T @ (mu * z))
        except np.linalg.LinAlgError:
            return None
        if np.abs(b_new - b).max() < 1e-10:
            return b_new
        b = b_new
    return b

rng = np.random.default_rng(1)
for sp in ['Bobcat', 'Coyote']:
    r = d[(d.species == sp) & d.p250_territory.notna()]
    E = r.p250_territory.to_numpy(float); T = r.years_tracked.to_numpy(float)
    y = (r.fate == 'Human').to_numpy(float)
    b = fit_poisson(E, T, y)
    fit = np.exp(b[0] + b[1] * GRID)
    draws, rr = [], []
    for _ in range(NBOOT):
        ix = rng.integers(0, len(r), len(r))
        if y[ix].sum() == 0:
            continue
        bb = fit_poisson(E[ix], T[ix], y[ix])
        if bb is not None and abs(bb[1]) < 1.5:
            draws.append(np.exp(bb[0] + bb[1] * GRID)); rr.append(np.exp(10 * bb[1]))
    draws = np.array(draws)
    lo, hi = np.percentile(draws, 5, axis=0), np.percentile(draws, 95, axis=0)
    inside = (GRID >= E.min()) & (GRID <= E.max())
    pd.DataFrame({'grid': GRID, 'fit': fit, 'lo': lo, 'hi': hi, 'inside_observed_range': inside}).to_csv(
        os.path.join(out_dir, f'risk_curve_{sp.lower()}.csv'), index=False)
    print(f'{sp}: n={len(r)}, deaths={int(y.sum())}, animal-years={T.sum():.1f}, '
          f'rate ratio per +10 points = {np.exp(10*b[1]):.2f} '
          f'(bootstrap 90%: {np.percentile(rr,5):.2f} to {np.percentile(rr,95):.2f}), '
          f'observed exposure {E.min():.0f} to {E.max():.0f}')
