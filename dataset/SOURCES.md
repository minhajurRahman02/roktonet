# SOURCES — RoktoNet blood demand dataset

Provenance register. **Every numeric cell in `processed/` must trace to an entry here.**
No LLM-generated values. If a number cannot be traced to a row in this file, it does
not belong in the dataset.

Compiled 2026-09-21. Status column reflects what is actually in the repo, not what is
planned.

---

## Tier 1 — observed, daily, district grain

### DGHS daily dengue press releases

**`old.dghs.gov.bd` is confirmed dead** (direct browser test by the team, 2026-09-22),
not merely slow or blocked. `fetch_dengue.py`'s deterministic archive-URL route is
obsolete for acquisition, though its manifest/etiquette pattern was reused for the
Wayback fallback below. This finding supersedes the "NOT YET DOWNLOADED" status this
table previously carried.

**Recovery route: Internet Archive Wayback Machine, via the CDX API.**

| | |
|---|---|
| CDX endpoint | `https://web.archive.org/cdx/search/cdx` (public, documented, no key) |
| Queried prefix | `old.dghs.gov.bd/images/docs/vpr/*`, `filter=mimetype:application/pdf` |
| Fetcher | `scripts/fetch_dengue_wayback.py` |
| `--list-only` result (2026-09-22) | 16,301 PDF-mimetype captures → 5,857 distinct URLs after earliest-capture collapse → **1,640** match the `YYYYMMDD_dengue_all.pdf` naming pattern (3,019 other-file-type captures under the same prefix excluded) |
| Coverage | 2021-12-13 .. 2026-07-31 (1,640 of 1,692 days in that span, 97% density) |
| Local path | `raw/dengue/YYYYMMDD.pdf` |
| Manifest | `raw/dengue/_manifest.csv` (url, route, http_status, bytes, sha256, fetched_at) |
| Status | **COMPLETE.** 1,639 PDFs downloaded 2026-09-22; 1,635 parsed successfully |
| Grain | **TRUE DISTRICT LEVEL** — 64 districts plus a combined Dhaka Metro (DNCC+DSCC) figure, 65 units per day |
| Parsed output | `interim/dengue_pdf_district_daily.csv` — 105,625 rows, 1,625 days, 2021-12-13 .. 2026-07-31 |
| Parser | `scripts/parse_dengue.py --extract` → `scripts/build_dengue_pdf_district.py` |

**Independent verification of the parsed series — this is the evidence the
stream can be trusted, and none of it can be produced by a parser accidentally:**

| Check | Result |
|---|---|
| 2023 national annual total vs DGHS published | **321,179 vs 321,179 — exact** |
| Correlation with the independent Kaggle extraction (435 overlapping days) | **0.998** |
| Daily national totals identical to Kaggle | 335 of 435 days (77%), median absolute difference **0** |
| Days resolving to exactly 65 districts | **1,625 of 1,625 (100%)** |
| 2021 year-end cumulative vs the figure printed in the 2021-12-13 PDF itself | 28,429 vs 28,001 at 13 Dec — consistent |
| Negative values | 0 |

2024 reads 94,587 against a published 101,214 (−6.5%), explained by 97% day
coverage that year plus three unparseable files (2024-07-29..31). Recorded, not
adjusted.

**Bangla name drift.** The PDFs embed different font subsets across their five
layout eras, so the same district extracts as different character sequences by
year — Faridpur appears as ফরিদপুি, ফরিদপযি and ফতরদপুর. 166 distinct strings were
recovered for 65 entities. The mapping is in
`raw/reference/district_name_variants.yaml`, assigned by row position (the table
order is fixed and every file yields exactly 65 rows) cross-checked against
string identity. Automatic character-folding was tried and **rejected** — it
merged মাগুরা (Magura) with বগুড়া (Bogura). The mapping is self-checking: a wrong
merge would leave some date with fewer than 65 distinct districts, and all 1,625
resolve to exactly 65.

Known published totals, used as the A4 reconciliation target:
- 2023: 321,179 hospitalisations, 1,705 deaths
- 2024: 101,214 cases

### Kaggle division-level series (now in active use, not just cross-check)

| | |
|---|---|
| Source | `kaggle.com/datasets/shampabanik12/district-wise-dengue-dataset-for-bangladesh` |
| Local path | `raw/dengue/kaggle_division_2019_2023.csv` (copied verbatim, sha256 `13b7e0c8...e68f01`) |
| True grain | **division (8 units), despite the dataset's "district-wise" name** — verified directly, exactly 8 distinct location strings matching Bangladesh's 8 divisions |
| Coverage | 2019-08-27 .. 2023-08-21; 4,776 rows = 597 reported dates × 8 divisions, no partial-division days, zero duplicates/negatives |
| Reporting density | 597 of 1,456 calendar days in span (41.0%) actually reported; gap report at `reports/dengue_kaggle_gap_report.csv` (859 unreported dates, recorded not filled) |
| Reporting pattern by year | 2019=127, 2020=30, 2021=19, 2022=188, 2023=233 dates reported — a genuine COVID-era dengue-surveillance reporting collapse (Bangladesh, 2020 through most of 2021), not random missingness. Two dominant gaps: 371 days (2020-01-30→2021-02-04) and 312 days (2021-02-04→2021-12-13) |
| Processing script | `scripts/build_dengue_division.py` → `interim/dengue_division_daily.csv` |
| Disaggregation | `scripts/disaggregate_dengue_district.py` → `interim/dengue_daily_district.csv` (38,208 rows, district grain, population-share method — see "Modelling assumptions" below) |

**Why this is now load-bearing, not just a cross-check:** it is the only recovered
source covering 2019-08 through 2021-12, a span the Wayback recovery cannot reach
(its earliest confirmed PDF capture is 2021-12-13). The 2021-12 .. 2023-08 overlap
between the two sources is a planned cross-validation point once the Wayback PDFs
are parsed.

**Modelling assumption — division-to-district disaggregation.** RoktoNet allocates
at district grain (64 units); both dengue sources above are division-level (8 units).
Decided explicitly (not defaulted to): each division's observed daily total is split
across its member districts by **population share within that division**, the same
technique used in `build_chronic.py` for the chronic transfusion baseline. Labelled
`disaggregation_method = "population_share_within_division"` in every output row,
with the original division-level observation retained alongside the district
estimate so the assumption is never hidden downstream. Reconciliation check (district
estimates re-summed to division totals) passes with max diff 0.0003 admissions.
This assumes uniform dengue attack rate within a division, which is not literally
true (a district with a large tertiary hospital draws referred cases from
neighbours, inflating its apparent share) — recorded as a limitation, not corrected
for, since no sub-division data exists for most of the range.

---

## Tier 2 — observed, coarser grain

### Road traffic accidents

| Source | Coverage | Grain | Status |
|---|---|---|---|
| Mendeley, Bangladesh RTA Dataset 2007–2024 (`data.mendeley.com/datasets/p2kgkb5cd2/2`) | 2007–2024, 49,566 records | record-level | **not downloaded** (unreachable) |
| Road Safety Foundation monthly reports | 2019– | monthly, division | not downloaded |
| BPWA monthly + Eid reports | 2016– | monthly, division | not downloaded |
| BRTA annual reports (police MAAP) | 2001– | annual | not downloaded |

Mendeley consolidates ARI/BUET, BRTA, Dhaka Metropolitan Police and field collection.

**These sources disagree with each other, sometimes substantially**, because most are
compiled from media reports rather than hospital or police records. Do not silently
pick one. Use one as primary and carry the others as an uncertainty band.

Eid-window figures already collected as cross-checks (see `calendar_anchors.yaml`):
- Eid-ul-Fitr 2026: RSF, 274 killed / 1,500+ injured / 342 accidents, 16–26 March
- Eid-ul-Adha 2026: RSF, 281 killed / 837 injured / 292 accidents, 21 May – 2 June
- Eid-ul-Adha 2026: BPWA, 402 killed / 1,294 injured / 394 accidents (same period)

The RSF/BPWA divergence on the same Eid is itself the clearest illustration of why
this stream carries an uncertainty band.

**Use injured counts, never fatality counts, as the demand driver.**

---

## Tier 3 — national reconciliation anchors

| Figure | Value | Source |
|---|---|---|
| Annual national requirement | 950,000–1,000,000 bags | Dr Ataul Karim, Deputy Programme Manager, Safe Blood Transfusion Programme, DGHS, via The Business Standard, 2022-06-14 |
| Annual collected and transfused | ~750,000 bags | same |
| Voluntary donor share of demand | 32% | same |
| Transfusion centres under SBTP | 98 | Asian J Transfus Sci (PMC2920470) |

**The anchor is itself an undercount.** Private blood banks do not all report to DGHS
and experts state actual demand is higher. Reconciling to it reconciles to a floor.

Further year-on-year and centre-level figures: DGHS annual Health Bulletin, Safe Blood
Transfusion chapter — `old.dghs.gov.bd/index.php/en/publications/health-bulletin/dghs-health-bulletin`.
Not yet extracted; robots-disallowed to automated fetch.

---

## Tier 4 — clinical conversion rates

Full table with low/central/high and citations: **`conversion_rates.yaml`**.

Sourced:
- Dengue transfusion rate: 9.7% bleeding (low) to 42.6% observed transfusion (high),
  tertiary hospital study n=225; thrombocytopenia 84.88% on admission
- Counter-evidence on over-liberal practice: Tan Tock Seng Hospital n=788, prophylactic
  platelet transfusion in non-bleeding dengue gave no benefit and slowed recovery
- Thalassemia: 67% transfusion-dependent, 42% needing 1–4 bags/month
  (Orphanet J Rare Dis 2025)

**Still unsourced — must be resolved before freeze:**
- `dengue.units_per_transfused_case`
- `trauma.transfusion_rate`
- `trauma.units_per_transfused_case`
- `trauma.o_negative_uplift` (remove if it cannot be sourced)

---

## Reference tables (in repo, validated)

| File | Contents | Validation |
|---|---|---|
| `raw/reference/districts.csv` | 64 districts, division, 2022 population | sum 164,924,748 vs BBS census 165,158,616 (−0.14%); 8 divisions, correct district counts. One extraction error caught and corrected — see ACCESS_NOTES.md §5 |
| `raw/reference/calendar_anchors.yaml` | Eid dates 2019–2026, Ramadan derivation, holidays, fog season | Eid dates from two independent publishers; 2026 dates corroborated by RSF travel windows |
| `raw/reference/blood_type_shares.yaml` | ABO/Rh distribution, 8-type combined | Karim, Hoque et al., J Dhaka Med Coll 2015, n=39,512; combined shares sum to 1.000000 |
| `raw/reference/geoboundaries_bgd_adm2_simplified.geojson` | Bangladesh ADM2 district boundaries | geoBoundaries gbOpen, William & Mary geoLab, CC BY 4.0. 64 features, exactly matching the 64 districts. sha256 `7dbdb186f3b8af10417147a99859196fcd89c619fb5c6ac3804251fb6b449b6a` |
| `raw/reference/district_centroids.csv` | lat/lon per district, for the weather fetch | **Derived, not typed**: area-weighted polygon centroid of the boundary file above, computed by `build_district_centroids.py`. All 64 matched with no duplicates; every centroid tested to fall inside its own polygon (0 needed the interior-point fallback) and inside Bangladesh's bounding box |

District population source: Wikipedia district articles citing the 2022 Bangladesh
census. **Secondary source.** Replacing it with the BBS primary release before freeze
is a cheap, worthwhile upgrade.

**On the centroids.** Coordinates are data, so rule 4 applies to them: no value enters
the dataset without a source. Typing 64 lat/lon pairs from memory would have been
fabrication, and undetectable downstream — a centroid 60 km out still returns plausible
rainfall. They are therefore computed by arithmetic from a committed, citable boundary
file, and the calculation is reproducible offline. Nine geoBoundaries names differ from
this dataset's canonical spellings (Barisal→Barishal, Bogra→Bogura,
Chittagong→Chattogram, Comilla→Cumilla, Jessore→Jashore, plus four transliteration
variants); the mapping is explicit rather than fuzzy-matched, for the same reason the
Bangla mapping is explicit — automatic folding merged two real districts there.

---

## Weather — NASA POWER (Stage 6B)

| Field | Value |
|---|---|
| Source | NASA POWER, daily point API, AG community (MERRA-2 / GEOS reanalysis) |
| Endpoint | `https://power.larc.nasa.gov/api/temporal/daily/point` |
| Parameters | `PRECTOTCORR` (bias-corrected precipitation, mm/day), `T2M`, `T2M_MAX` (°C), `RH2M` (%) |
| Span | 2021-06-01 → 2026-07-31 |
| Grain | one request per district centroid, 64 requests |
| Licence | US Government work, freely redistributable; no API key |
| Raw files | `raw/weather/power_*.json` + `raw/weather/_manifest.csv` (url, status, bytes, days, sha256) |
| Acquisition | `scripts/fetch_weather.py` — **must run on a team machine**; the cloud workspace's network policy answers 403 to CONNECT for `power.larc.nasa.gov` (verified 2026-09-23), the same situation as the Wayback fetch |
| Build | `scripts/build_weather.py` → `interim/weather_daily.csv` |

**Why it was acquired.** Stage 6B's walk-forward evaluation showed that no learned model
beat naive persistence using endogenous features alone, with error rising *monotonically*
as features were added. Every such feature is a function of past admissions, so none
carried information that "last week's value" lacks. Weather is the first input in this
dataset that is not derived from the target, and the Aedes literature puts the
rainfall→case lag in South Asia at roughly 4–8 weeks. The fetch starts seven months
before the modelling window so a 12-week lag costs zero modelled weeks.

**`PRECTOTCORR` rather than `PRECTOT`:** the corrected product is bias-adjusted against
gauge observations and is the one POWER recommends for land applications.

**Fill values.** POWER encodes missing data as `-999`, an ordinary-looking float. A
single `-999` rainfall day would drag a 4-week rolling mean to about −250 mm and train
silently. Conversion to NaN happens in exactly one audited place (`build_weather.py`),
every occurrence is counted into `reports/weather_quality_report.csv`, and the build
fails above a 2% missing rate. Nothing is interpolated — rule 3 holds.

**Validation beyond range checks.** Range checks cannot catch correct values attached to
the wrong place: 25 °C and 8 mm of rain are plausible almost anywhere. `build_weather.py`
therefore asserts three things true of Bangladesh specifically — monsoon (Jun–Sep) mean
rainfall at least 8× the dry season (Dec–Feb); Sylhet division wetter than Rajshahi
division (the Meghalaya orographic gradient, a *spatial* check that fails if districts
were shuffled against coordinates); and Apr–May warmer than Dec–Jan. The third check
already caught a real phase-inversion bug during development.

**Committed, not ignored.** `raw/weather/` is roughly 7 MB — nowhere near the
"large AND regenerable" bar the `.gitignore` sets, and the default there is COMMIT IT.

---

## Generated outputs

| File | Script | Status |
|---|---|---|
| `interim/calendar_features.csv` | `build_calendar.py` | done — 3,287 rows, 2019-01-01 to 2027-12-31, sanity checks pass |
| `interim/chronic_baseline_district.csv` | `build_chronic.py` | done — 64 districts; see ACCESS_NOTES.md §4 for the open reconciliation question |
| `interim/dengue_division_daily.csv` | `build_dengue_division.py` | done — 4,776 rows, Kaggle 2019-2023, division grain |
| `interim/dengue_daily_district.csv` | `disaggregate_dengue_district.py` | done — 38,208 rows, 2019-08-27..2023-08-21, disaggregated to district by population share within division, reconciliation PASS (max diff 0.0003) |
| `interim/dengue_wayback_district_daily.csv` | `parse_dengue.py --extract` | done — 106,275 raw rows from 1,635 PDFs; carries raw Bangla name variants and a damaged division column (both resolved downstream) |
| `interim/dengue_pdf_district_daily.csv` | `build_dengue_pdf_district.py` | **done — 105,625 rows, 1,625 days, 65 units, 100% complete days, 2023 total matches DGHS exactly** |
| `reports/dengue_pdf_quality_report.csv` | `build_dengue_pdf_district.py` | 10 issues recorded: 1 impossible date (month/day transposed in source), 9 duplicate report dates |
| `raw/reference/district_centroids.csv` | `build_district_centroids.py` | done — 64 districts, all matched, 0 outside their own polygon |
| `interim/weather_daily.csv` | `build_weather.py` | pending — needs `fetch_weather.py` to run on a team machine first |
| `processed/model_features_weekly.csv` | `build_features_weekly.py` | done — 11,712 rows, 183 weeks (2022-02-28 .. 2026-06-29), 64 districts, 22 endogenous features; weather features join in automatically once `interim/weather_daily.csv` exists. Leakage audit passes |
| `interim/rta_daily_district.csv` | not yet written | blocked on acquisition (Mendeley unreachable from workspace) |
| `processed/blood_demand_daily.csv` | not yet written | blocked |

---

## Rules

1. Raw files are committed and never edited by hand.
2. Every download is recorded in a manifest with URL, timestamp and sha256.
3. Gaps are **recorded, never filled**. Off-season dengue gaps, and DGHS's own
   non-daily reporting cadence (see the Kaggle reporting-density note above), are
   expected and handled at the modelling step, not by inventing rows.
4. No value enters the dataset without an entry in this file.
5. Where a value is a modelling choice rather than a citation, it is labelled as one
   in `conversion_rates.yaml` or, for the dengue disaggregation, by the
   `disaggregation_method` column itself. There are currently seven such labels.