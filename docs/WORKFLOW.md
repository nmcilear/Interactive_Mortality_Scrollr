# Workflow diagrams

Five diagrams show how the project fits together, from raw GPS data to the page a reader sees.
Each diagram is a picture; the editable Mermaid source is folded under it. Stage names match **Table 2** of the report, and goals **G1 to G4** are the four project goals.

| Goal | Question | Output |
|---|---|---|
| G1 | Can the home-range estimates be trusted, and what do they look like? | Model checks, home ranges |
| G2 | How does road exposure differ with how an animal's track ended? | Exposure by outcome |
| G3 | How does the death rate change with road exposure? | Rate model and risk curve |
| G4 | When do deaths happen, and do the two species share space? | Seasonality test, overlap test |

---

## 1. The whole pipeline

Read left to right. Each box is a script or a data file, and each arrow is a file passed on.
Blue is R, green is Python, orange is the browser, and grey is data.

![Whole pipeline](img/diagram1.png)

<details>
<summary>Mermaid source (renders as an editable diagram on GitHub)</summary>

```mermaid
flowchart LR
  classDef data fill:#eceff1,stroke:#607d8b,color:#222
  classDef r fill:#e3f2fd,stroke:#1976d2,color:#222
  classDef py fill:#e8f5e9,stroke:#388e3c,color:#222
  classDef web fill:#fff3e0,stroke:#f57c00,color:#222

  subgraph IN["Inputs"]
    MB[("Movebank GPS fixes<br/>121,706 fixes, 70 animals")]:::data
    REF[("Reference data<br/>sex, site, mass, dates")]:::data
    OSM[("OpenStreetMap roads<br/>Geofabrik extract")]:::data
  end

  subgraph S1["Stage 1: Acquire and clean (G1)"]
    CT["run_ctmm_full.R<br/>variogram, model selection, AKDE + naive KDE"]:::r
    PM["patch_meta.R<br/>fix OUf timescale, redo meta-analysis"]:::r
    BF["build_fates.R<br/>death comments to 5 outcomes"]:::r
  end

  subgraph S2["Stage 2: Spatial"]
    DR["build_fine_distance_rasters.R<br/>30 m distance-to-road"]:::r
  end

  subgraph S3["Stage 3: Compute (G2, G3, G4)"]
    BS["run_bootstrap.R<br/>small-sample animals"]:::r
    UD["ud_exposure.R<br/>share of range within 250 m of a road"]:::r
    IT["build_individual_table.R<br/>one row per animal"]:::r
    HR["home_range_overlap.py<br/>Bhattacharyya overlap"]:::py
    RM["risk_curve_model.py<br/>Poisson rate model + bootstrap band"]:::py
  end

  subgraph S4["Stage 4: Build the page data"]
    BA["tools/build_animals_data.py"]:::py
    BT["tools/build_tracks_data.py"]:::py
    DJ[("data/*.js<br/>animals, tracks, monthly_distance")]:::data
  end

  subgraph S5["Stage 5: Page (G1 to G4)"]
    PG["index.html + css/ + js/<br/>scrollytelling + explorer"]:::web
  end

  MB --> CT
  REF --> CT
  CT --> PM --> BS
  MB --> BF
  OSM --> DR
  PM --> UD
  DR --> UD
  BS --> UD
  BF --> IT
  UD --> IT
  REF --> IT
  IT --> HR
  IT --> RM
  IT --> BA
  HR --> BA
  RM --> BA
  MB --> BT
  OSM --> BT
  BA --> DJ
  BT --> DJ
  DJ --> PG
```

</details>

**How to read it:** `run_ctmm_full.R` is the slow step (one model fit per animal, cached to disk).
Everything after it is quick. The two data builders at the end are the only link between the analysis and the page,
so the page can be rebuilt without refitting any animal.

---

## 2. What happens to one animal (Stage 1 and 3 in detail)

Every animal goes through the same chain. The diamonds are the decisions that change what is reported.

![One animal's checks](img/diagram2.png)

<details>
<summary>Mermaid source (renders as an editable diagram on GitHub)</summary>

```mermaid
flowchart TD
  A["GPS fixes for one animal"] --> B["Filter fixes"]
  B --> C["Variogram:<br/>does the spread of positions level off?"]
  C --> D{"Position timescale τp<br/>greater than half the tracking time?"}
  D -- yes --> D1["Flag as not range-resident<br/>(only MVBOB91M, about 3.5 days of data)"]
  D -- no --> E["Compare OU and OUF models by AICc<br/>(42 animals OUF, 28 animals OU)"]
  D1 --> E
  E --> F["Home range two ways:<br/>wAKDEc (corrected) and naive IID KDE"]
  F --> G{"Corrected range at least<br/>1.5 times the naive range?"}
  G -- yes --> G1["Flag: relies on extrapolation<br/>(14 animals)"]
  G -- no --> H
  G1 --> H{"Effective sample size DOF[area]<br/>below 5?"}
  H -- yes --> H1["Parametric bootstrap<br/>(MVBOB71M did not converge: excluded)"]
  H -- no --> I
  H1 --> I["Utilisation distribution (UD)<br/>probability in each 30 m cell"]
  I --> J["Exposure = sum of UD probability<br/>in cells within 250 m of a road"]
  J --> K{"N_area below 30?"}
  K -- yes --> K1["Plot with a ring: range uncertain<br/>(14 of 69 animals)"]
  K -- no --> L
  K1 --> L["One row in the individual table"]
```

</details>

The three flags (not resident, extrapolated, small N_area) are different checks and catch different animals.
That is why the report says the two groups of 14 are not the same animals.

---

## 3. From exposure to claims (Stage 3 to the labels)

Each goal has one method and one evidence label. The label depends on what the interval does, not on how strong the result looks.

![Exposure to claims](img/diagram3.png)

<details>
<summary>Mermaid source (renders as an editable diagram on GitHub)</summary>

```mermaid
flowchart LR
  T[("Individual table<br/>69 usable animals")]

  T --> G2["G2: compare groups<br/>median exposure by outcome<br/>percentile bootstrap interval"]
  T --> G3["G3: relate quantities<br/>Poisson model, offset log(animal-years)<br/>rate ratio per 10 points of exposure"]
  T --> G4a["G4: when<br/>binomial test: are all human deaths<br/>inside the regulated season?"]
  T --> G4b["G4: next to whom<br/>Bhattacharyya overlap, pairs tracked<br/>together 90+ days; permutation test"]

  G2 --> R2["Coyotes: 67% vs 48%<br/>+18 points (95% interval +3 to +26)<br/>Bobcats: no clear gap"]
  G3 --> R3["Bobcats RR 1.15 (0.84 to 1.59)<br/>Coyotes RR 1.29 (0.92 to 1.79)<br/>both include 1"]
  G4a --> R4a["All 10 human-caused bobcat deaths<br/>fell November to February<br/>but all 10 were male"]
  G4b --> R4b["Difference 0.006, p = 0.70"]

  R2 --> L2(["SHOWN: coyotes<br/>SUGGESTED: bobcats"])
  R3 --> L3(["SUGGESTED"])
  R4a --> L4a(["SHOWN: bobcat season<br/>(sex confounded)"])
  R4b --> L4b(["SUGGESTED"])

  classDef shown fill:#c8e6c9,stroke:#2e7d32,color:#222
  classDef sugg fill:#fff9c4,stroke:#f9a825,color:#222
  class L2,L4a shown
  class L3,L4b sugg
```

</details>

A third label, **Not testable here**, is used for the mechanism (fear of wolves and cougars), because their locations are not public.

---

## 4. The page: a martini glass

The page follows the martini-glass structure (Segel & Heer, 2010). The author controls the narrow stem,
and the reader controls the wide mouth. Within each part, the order is overview first, then filter, then details on demand (Shneiderman, 1996).

![Page structure](img/diagram4.png)

<details>
<summary>Mermaid source (renders as an editable diagram on GitHub)</summary>

```mermaid
flowchart TD
  subgraph STEM["Stem: author-driven scrollytelling"]
    direction TB
    S1["One chart stays on screen"] --> S2["Short text steps change one element at a time"]
    S2 --> S3["Each step makes one point<br/>(how to read it, then what it shows)"]
    S3 --> S4["Each finding carries a label:<br/>Shown, Suggested or Not testable here"]
  end
  subgraph MOUTH["Mouth: reader-driven explorer"]
    direction TB
    M1["Linked panels, one selection updates all"] --> M2["Filter by species, outcome, threshold"]
    M2 --> M3["Hover or select for one animal's details"]
  end
  STEM ==> MOUTH
  MAP["Optional: lighter animated season map<br/>(one position per day, drawn in JavaScript)"] -.-> MOUTH
```

</details>

**Why it matters for the reader:** the stem keeps the load low by giving one point at a time (Sweller, 1988; Mayer, 2009),
and the mouth hands control back once the reader has the context to explore without being misled.

---

## 5. How the design changed

![Design changes](img/diagram5.png)

<details>
<summary>Mermaid source (renders as an editable diagram on GitHub)</summary>

```mermaid
flowchart LR
  P["Proposal<br/>animated tracks over NDVI"] -->|"overplotted at 69 animals;<br/>could not show fates or uncertainty"| A["moveVis and gganimate<br/>6 attempts"]
  A -->|"reframed around questions"| B["Static figures<br/>four goals G1 to G4<br/>Shown / Suggested / Not testable"]
  B -->|"six linked charts on one screen"| C["Interactive page v1<br/>overloaded the reader"]
  C -->|"about 280 words and 16 controls<br/>above the first chart"| D["Guided page v2<br/>still too much at once"]
  D -->|"ONS scrollytelling structure"| E["Final: scrollytelling page<br/>plus linked explorer<br/>plus lighter season map"]
```

</details>

Two findings changed the analysis itself: the first distance raster inherited 164 m cells (so a 250 m threshold meant about 1.4 cells),
found by tabulating its distinct values and fixed by rebuilding at 30 m; and a bug in reading the position timescale from `OUf` fits wrongly flagged three animals as non-resident,
fixed by `patch_meta.R` without refitting.
