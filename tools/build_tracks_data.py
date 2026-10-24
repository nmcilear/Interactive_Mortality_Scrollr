"""
build_tracks_data.py
Purpose : Builds the two map data files of the page from the raw Movebank and OpenStreetMap data:
          data/tracks.js           daily positions per animal, road lines, territory ellipses,
                                   % of GPS positions near a road
          data/monthly_distance.js monthly quantiles of distance to the nearest road, per species
Input   : Movebank event CSV and reference-data CSV (doi 10.5441/001/1.gm93267b)
          OpenStreetMap roads, Geofabrik Washington extract as .gpkg (lines layer)
Output  : data/tracks.js, data/monthly_distance.js
Run     : python3 tools/build_tracks_data.py EVENTS.csv REFERENCE.csv washington.gpkg
          (from the repository root; the three inputs are too large for the repository)
Needs   : pandas, numpy, geopandas, pyogrio, shapely >= 2

What it does
  1. Keep visible GPS fixes with HDOP <= 10 and project to UTM zone 11N (EPSG:32611), in km.
  2. Daily track: the fix closest to 12:00 on each day, for each animal.
  3. Roads: every OSM highway class except paths, steps and planned roads. Distance to the
     nearest road is found for every fix with a spatial index.
  4. Map road layer: lines simplified to 20 m, kept if within 3 km of a daily position (major
     roads always), coordinates in 10 m units and delta-encoded to keep the file small.
  5. Territory ellipse: 95% ellipse from the mean and covariance of all fixes (animals with
     fewer than 30 fixes skipped). This is a quick outline for the map; the territories used
     in the analysis are the AKDE home ranges fitted in R (ctmm).
  6. Monthly distance quantiles (10/25/50/75/90th percentile) of the daily positions.
"""
import json, os, sys
import numpy as np, pandas as pd, geopandas as gpd, pyogrio
from shapely.strtree import STRtree

if len(sys.argv) < 4:
    sys.exit(__doc__)
EVENTS, REFERENCE, ROADS = sys.argv[1:4]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT_DIR = os.path.join(ROOT, "data")

HDOP_MAX        = 10                                   # drop fixes with HDOP above this
BBOX            = (-120.9, 47.5, -116.9, 49.05)        # lon/lat box read from the roads file
NOT_ROADS       = ["footway", "path", "steps", "cycleway", "pedestrian", "bridleway", "corridor",
                   "elevator", "proposed", "planned", "construction"]
MAJOR           = {"motorway", "trunk", "primary", "secondary",
                   "motorway_link", "trunk_link", "primary_link", "secondary_link"}
SIMPLIFY_M      = 20          # road simplification tolerance (m)
KEEP_NEAR_M     = 3000        # keep minor roads within this distance of a daily position (m)
UNITS_PER_KM    = 100         # track coordinates are stored in units of 10 m
ROAD_UNIT_M     = 10          # road coordinates are stored in units of 10 m
MIN_FIXES_ELL   = 30          # animals with fewer fixes get no ellipse
CHI2_95_2DF     = 5.991       # chi-square 95% quantile, 2 d.f.
BASE_DATE       = pd.Timestamp("2018-01-01")           # day 0 of the 'd' arrays
NEAR_M          = (100, 250, 500, 1000)                # distance bands for the 'fs' shares

# ---- 1. Fixes ---------------------------------------------------------------------------
e = pd.read_csv(EVENTS, usecols=["timestamp", "location-long", "location-lat",
                                 "individual-local-identifier", "gps:hdop", "visible"])
e = e.rename(columns={"location-long": "lon", "location-lat": "lat",
                      "individual-local-identifier": "id", "gps:hdop": "hdop"})
e = e[e.visible.astype(str).str.lower() != "false"]
e = e[~(e.hdop > HDOP_MAX)].dropna(subset=["lon", "lat"])
e["t"] = pd.to_datetime(e.timestamp)
g = gpd.GeoDataFrame(e, geometry=gpd.points_from_xy(e.lon, e.lat), crs=4326).to_crs(32611)
e["x"], e["y"] = g.geometry.x / 1000, g.geometry.y / 1000      # km

# ---- 2. One position per animal per day (closest to midday) -------------------------------
e["day"] = e.t.dt.floor("D")
e["dh"] = (e.t - e.day - pd.Timedelta(hours=12)).abs()
dd = e.sort_values("dh").drop_duplicates(["id", "day"]).sort_values(["id", "day"])

# ---- 3. Roads and distance to the nearest road ---------------------------------------------
roads = pyogrio.read_dataframe(ROADS, bbox=BBOX, columns=["highway"])
roads = roads[roads.highway.notna() & ~roads.highway.isin(NOT_ROADS)].to_crs(32611)
tree = STRtree(roads.geometry.values)

def nearest_m(x_km, y_km):
    """Distance (m) from each point to its nearest road."""
    idx, dist = tree.query_nearest(gpd.points_from_xy(x_km * 1000, y_km * 1000),
                                   return_distance=True, all_matches=False)
    out = np.full(len(x_km), np.nan); out[idx[0]] = dist
    return out

dd["dist"] = nearest_m(dd.x.values, dd.y.values)
e["dist"]  = nearest_m(e.x.values,  e.y.values)
fs = {i: [round(float((q.dist <= t).mean() * 100), 1) for t in NEAR_M] for i, q in e.groupby("id")}

# ---- 4. Light road layer for the map -------------------------------------------------------
roads["major"] = roads.highway.isin(MAJOR)
r2 = roads.copy(); r2["geometry"] = r2.geometry.simplify(SIMPLIFY_M)
r2 = r2[~r2.geometry.is_empty]
near = gpd.GeoSeries(gpd.points_from_xy(dd.x * 1000, dd.y * 1000), crs=32611).buffer(KEEP_NEAR_M).union_all()
r3 = r2[r2.intersects(near) | r2.major]

def polylines(geom):
    parts = [geom] if geom.geom_type == "LineString" else list(geom.geoms)
    return [np.round(np.array(p.coords) / ROAD_UNIT_M).astype(int).flatten().tolist() for p in parts]

def delta(p):
    """[x0,y0,x1,y1,...] -> [x0,y0,dx1,dy1,...]"""
    o = [p[0], p[1]]
    for i in range(2, len(p), 2): o += [p[i] - p[i - 2], p[i + 1] - p[i - 1]]
    return o

roads_js = {"major": [], "minor": []}
for geom, is_major in zip(r3.geometry, r3.major):
    for p in polylines(geom):
        if len(p) >= 4: roads_js["major" if is_major else "minor"].append(delta(p))

# ---- 5. Daily tracks and territory ellipses -------------------------------------------------
X0, Y0 = int(np.floor(e.x.min() * UNITS_PER_KM)), int(np.floor(e.y.min() * UNITS_PER_KM))
tr = {}
for i, q in dd.groupby("id"):
    tr[i] = {"d": ((q.day - BASE_DATE).dt.days).tolist(),
             "x": (np.round(q.x.values * UNITS_PER_KM).astype(int) - X0).tolist(),
             "y": (np.round(q.y.values * UNITS_PER_KM).astype(int) - Y0).tolist(),
             "r": np.round(q.dist.values / 10).astype(int).clip(0, 2000).tolist()}   # distance in 10 m units
ell = {}
for i, q in e.groupby("id"):
    if len(q) < MIN_FIXES_ELL: continue
    m = q[["x", "y"]].mean().values
    w, v = np.linalg.eigh(np.cov(q[["x", "y"]].values.T))
    k = np.sqrt(CHI2_95_2DF)
    ell[i] = [round(m[0] * UNITS_PER_KM - X0), round(m[1] * UNITS_PER_KM - Y0),
              round(k * np.sqrt(w[1]) * UNITS_PER_KM), round(k * np.sqrt(w[0]) * UNITS_PER_KM),
              round(float(np.arctan2(v[1, 1], v[0, 1])), 3)]

tracks = {"U": UNITS_PER_KM, "X0": X0, "Y0": Y0, "fs": fs, "tr": tr, "ell": ell,
          "roads": roads_js, "base": str(BASE_DATE.date())}

# ---- 6. Monthly distance quantiles per species -----------------------------------------------
ref = pd.read_csv(REFERENCE).drop_duplicates("animal-id").set_index("animal-id")
dd["sp"] = dd.id.map(ref["animal-taxon"])
dd["m"] = dd.day.dt.month
dm = {}
for sp, q in dd.groupby("sp"):
    dm[sp] = [np.round(np.percentile(q[q.m == m].dist.dropna(), [10, 25, 50, 75, 90])).astype(int).tolist()
              for m in range(1, 13)]
    dm[sp + "_n"] = [int((q.m == m).sum()) for m in range(1, 13)]
    dm[sp + "_p250"] = [round(float((q[q.m == m].dist <= 250).mean() * 100), 1) for m in range(1, 13)]

# ---- 7. Write -------------------------------------------------------------------------------
TRACKS_HEAD = """/* GPS tracks (one position per day per animal), roads, territory ellipses and %-positions-near-road.
   Built by tools/build_tracks_data.py.
   U = map units per km; X0/Y0 = UTM origin; tr[id] = {d: days since 2018-01-01, x, y}; roads are delta-encoded polylines. */
"""
DM_HEAD = """/* Monthly quantiles (10/25/50/75/90th percentile, metres) of distance to nearest road, pooled across animals, per species (_n = counts). Built by tools/build_tracks_data.py. */
"""
os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, "tracks.js"), "w", encoding="utf-8") as f:
    f.write(TRACKS_HEAD + "const T=" + json.dumps(tracks, separators=(",", ":")) + ";\n")
with open(os.path.join(OUT_DIR, "monthly_distance.js"), "w", encoding="utf-8") as f:
    f.write(DM_HEAD + "const DM=" + json.dumps(dm) + ";\n")
print("wrote data/tracks.js and data/monthly_distance.js |", len(tr), "animals,",
      len(roads_js["major"]), "major and", len(roads_js["minor"]), "minor road lines")
