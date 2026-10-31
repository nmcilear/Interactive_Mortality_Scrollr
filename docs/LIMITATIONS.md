# Limitations

Each limit below says what it is, how large it is in this dataset, what was done about it, and which claims it touches.
Claim labels are **Shown**, **Suggested** and **Not testable here**.

## Summary

| # | Limit | Size in this dataset | Claims affected |
|---|---|---|---|
| 1 | Few deaths | 10 human-caused bobcat deaths, 14 coyote; 3 and 5 carnivore-caused | All rates and group comparisons |
| 2 | Season and sex are tangled | All 10 human-caused bobcat deaths were male animals | Bobcat season finding |
| 3 | Small effective samples | 14 of 69 usable ranges have N_area below 30 | Range areas, exposure for those animals |
| 4 | Ranges that rely on extrapolation | 14 animals with corrected range at least 1.5 times the naive range | Range areas, exposure for those animals |
| 5 | One animal excluded | MVBOB71M (two clusters about 90 km apart; bootstrap did not converge) | 69 of 70 animals analysed |
| 6 | Who was collared | Two sites; 70 of the 72 animals in the paper; capture method not found | Everything: results describe collared animals only |
| 7 | Mechanism is untestable | Wolf and cougar locations are not public | The central claim of Prugh et al. (2023) |
| 8 | Roads measure access, not traffic | Traffic layer covered 535 segments and about 7% of fixes; 1 of 24 human-caused deaths was a vehicle strike | Interpretation of "exposure" |
| 9 | The 250 m threshold is a judgement | Repeated at 100, 500 and 1,000 m | G2, G3 |
| 10 | Overlap is not contact | Gaussian summary of each range; pairs tracked together at least 90 days | G4 overlap |
| 11 | Intervals differ between report and page | Report uses 95%, page band uses 90% | G3 reading |
| 12 | Fates come from comments | Counts match Prugh et al. (2023) Table 1 within one animal per species | All outcome groups |

## Detail

**1. Few deaths.** With 10 and 14 human-caused deaths, a single animal moving between groups can change a median.
The report therefore uses exact Poisson intervals for rates and percentile bootstrap intervals for medians,
and labels results Suggested whenever the interval includes no effect.
Rate ratios per 10 points of exposure were 1.15 for bobcats (95% interval 0.84 to 1.59) and 1.29 for coyotes (0.92 to 1.79).
Both lean upward and both include 1, so neither is a shown effect.

**2. Season and sex are tangled.** All 10 human-caused bobcat deaths fell between November and February, inside the regulated season (1 September to 15 March).
All 10 of those animals were male, so the data cannot separate a season effect from a sex effect (for example, males ranging further in winter).
The season finding is labelled Shown for the pattern and not for its cause. Sex could be added to the rate model as the data allow (future work).

**3. Small effective samples.** N_area is the effective number of independent samples behind a range area.
Fourteen of 69 animals (10 bobcats, 4 coyotes) had fewer than 30, and are drawn with rings in the exposure figures.
Animals with DOF[area] below 5 were given a parametric bootstrap, as recommended for small effective samples (Fleming et al., 2019).
This is the group flagged by sample size, not by extrapolation, so the "14" in limit 4 is a different set of animals.

**4. Extrapolated ranges.** Each animal's corrected range (wAKDEc) is compared with a naive estimate that treats fixes as independent.
When the corrected range is at least 1.5 times the naive one, the model is extending beyond what the data cover.
This is a project-defined flag, not a published cut-off. It is reported for every animal, so a reader can see which ranges depend on the movement model.

**5. One animal excluded.** MVBOB71M has fixes in two clusters about 90 km apart, so its bootstrap did not converge.
It is removed from range analyses, leaving 69. A first pass also flagged three resident animals as non-resident
because the position timescale was read wrongly from `OUf` fits; `patch_meta.R` corrected this without refitting, leaving only MVBOB91M (about 3.5 days of data) flagged.

**6. Who was collared.** Only animals that could be caught and fitted with a collar are in the data, at two sites.
The Washington Department of Fish and Wildlife project pages say both species were collared in both study areas but do not describe trapping methods.
If capture favoured animals that use roads or trails, exposure is biased upward across the whole sample.
The comparison between animals killed by people and the rest is affected only if that bias differs between the two groups.
Results describe these animals, not the wider population.

**7. Mechanism is untestable.** Prugh et al. (2023) propose that fear of wolves and cougars pushes mesopredators towards roads.
Their analysis uses wolf and cougar locations that are not public. This project can show an association with roads and cannot show why it occurs.
This is the only claim given the label Not testable here.

**8. Roads measure access, not traffic.** A highway traffic layer (average annual daily traffic) covered only 535 road segments and about 7% of fixes,
and only 1 of the 24 human-caused deaths was a vehicle strike. Traffic volume was therefore not the relevant exposure.
The analysis uses vehicle-capable OpenStreetMap roads as a measure of human access, and the first distance raster (164 m cells) was rebuilt at 30 m.
"Road exposure" in this project does not mean collision risk.

**9. The 250 m threshold.** Exposure is the share of a home range within 250 m of a road. This distance is a judgement, not a standard.
The comparison was repeated at 100, 500 and 1,000 m. The main coyote result did not change when the distance raster was rebuilt at 30 m.

**10. Overlap is not contact.** Overlap uses the Bhattacharyya coefficient on a Gaussian summary of each fitted range, so it describes the ellipse of use and not the irregular range.
Animals were not all tracked at the same time, so only reliable ranges tracked together for at least 90 days within a site were compared.
Even then, sharing space does not mean meeting. The difference between bobcat–coyote and same-species pairs was 0.006 (permutation test, p = 0.70).

**11. Intervals differ between report and page.** The report gives 95% intervals. The page draws the risk band at 90%
(bobcats 0.90 to 1.46, coyotes 0.95 to 1.90) so that the band is readable at screen size. Anyone comparing the two should read the stated level.

**12. Fates come from comments.** Death comments were mapped to five outcome classes by `build_fates.R`.
The counts match Table 1 of Prugh et al. (2023) to within one animal per species. The public release holds 70 animals against 72 in the paper.

## What the results can and cannot support

- **Can support:** coyotes killed by people had a higher median road exposure than other coyotes (67% against 48% of range within 250 m; +18 points, 95% interval +3 to +26). This is an association in these collared animals.
- **Cannot support:** that roads cause deaths, that fear of large carnivores drives movement, or that the results apply to uncollared animals.
