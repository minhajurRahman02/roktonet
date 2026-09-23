# Stage 6B — Weather acquisition: step card

Four steps. Steps 2 and 3 are the only ones that need your machine's network.

---

## Step 0 — Place the files

| File | Where it goes | New / replaces |
|---|---|---|
| `build_district_centroids.py` | `dataset/scripts/` | new |
| `fetch_weather.py` | `dataset/scripts/` | new |
| `build_weather.py` | `dataset/scripts/` | new |
| `build_features_weekly.py` | `dataset/scripts/` | **replaces** the existing one |
| `train_forecast_weekly.py` | `dataset/scripts/` | **replaces** the existing one |
| `geoboundaries_bgd_adm2_simplified.geojson` | `dataset/raw/reference/` | new (1.6 MB) |
| `district_centroids.csv` | `dataset/raw/reference/` | new |
| `SOURCES.md` | `dataset/` | **replaces** the existing one |
| `WEATHER_SETUP.md` | `dataset/` | new (this file) |

`district_centroids.csv` is already built and verified, so **you can skip Step 1**
unless you want to reproduce it. No `.gitignore` change is needed — nothing new here
meets the "large AND regenerable" bar.

Requirements: `requests` (already used by `fetch_dengue_wayback.py`), plus the usual
`pandas` / `numpy` / `scikit-learn` / `joblib`.

---

## Step 1 — (optional) Rebuild the centroids

```bash
cd dataset
python3 scripts/build_district_centroids.py
```

Expected output:

```
geoBoundaries ADM2 features: 64
wrote .../raw/reference/district_centroids.csv  (64 districts)
  latitude  range : 21.4836 .. 26.2851
  longitude range : 88.2641 .. 92.3638
  renamed via NAME_MAP        : 9
  area centroid outside shape : 0
  all 64 districts matched, no duplicates  (PASS)
```

Runs offline against the committed boundary file. If it exits with `FATAL`, do not
edit the CSV by hand — the failure names which district is unmatched.

---

## Step 2 — Smoke-test the fetch (one district)

**This must run on your machine, not the cloud workspace.** `power.larc.nasa.gov`
is refused by the workspace's network policy — it answers 403 to CONNECT. Same
situation as the Wayback fetch.

```bash
cd dataset
python3 scripts/fetch_weather.py --only Dhaka
```

Expected:

```
NASA POWER daily point  |  20210601 .. 20260731  |  PRECTOTCORR,T2M,T2M_MAX,RH2M
1 district(s) to consider, 0 already in manifest

  [ 1/1] Dhaka              (23.7869, 90.2508) ... OK  1,887 days, ~120 KB
```

If this fails, stop here and send me the error. Do not run Step 3 until it passes.

**If it returns fewer than 1,887 days:** POWER's most recent days may not be
published yet. That is fine and expected — tell me the day count and I will adjust
the end date rather than have you fetch a partial range 64 times.

---

## Step 3 — Fetch the remaining 63

```bash
python3 scripts/fetch_weather.py --delay 1.0
```

Roughly 2–4 minutes. Dhaka is skipped automatically (it is in the manifest).

Safe to interrupt and rerun — completed districts are skipped. If any district
fails, the script exits 1 and lists it; just rerun the same command to retry only
the failures.

Ends with:

```
fetched 63, skipped 1 (already present), failed 0
Next: python3 scripts/build_weather.py
```

---

## Step 4 — Build and validate

```bash
python3 scripts/build_weather.py
```

This runs offline. It converts POWER's `-999` fill values to NaN in one audited
place, counts them, and then asserts three things that are true of **Bangladesh
specifically** — not just "the numbers look plausible":

```
  Bangladesh sanity checks:
    monsoon/dry rainfall ratio       ~20+   (need >= 8)      PASS
    Sylhet vs Rajshahi rainfall     wetter vs drier          PASS
    Apr-May vs Dec-Jan temp         warmer vs cooler         PASS
```

These exist to catch coordinates attached to the wrong district, which range
checks cannot see. **If one fails, do not work around it** — send me the output.

Then rebuild the features:

```bash
python3 scripts/build_features_weekly.py
```

You should see `WEATHER: joined 23 features`, `features : 45 (22 endogenous + 23
weather)`, `LEAKAGE AUDIT ... 0 mismatches (PASS)`, and a lag-correlation table.

---

## Step 5 — The test that actually decides this

```bash
python3 scripts/train_forecast_weekly.py --horizon 1 --ablate
python3 scripts/train_forecast_weekly.py --horizon 2 --ablate
python3 scripts/train_forecast_weekly.py --horizon 4 --ablate
```

Each takes 1–3 minutes and **freezes nothing**. It runs the same walk-forward
protocol over five feature sets and prints one table:

```
 feature_set  n_features best_model    mae  naive_mae  vs_naive_pct folds_won beats_naive
parsimonious           8      ridge    ...        ...           ...      x/10         ...
  endogenous          22      ridge    ...        ...           ...      x/10         ...
         all          45      ridge    ...        ...           ...      x/10         ...
   endo_rain          35      ridge    ...        ...           ...      x/10         ...
weather_only          27      ridge    ...        ...           ...      x/10         ...
```

Send me those three tables. That is the whole decision.

**The bar is deliberately strict and I have not moved it:** a set must beat naive
persistence on *both* mean MAE *and* a majority of folds. Winning on average while
losing 7 of 10 folds means winning one lucky quarter, which is not a forecaster.

Only if something clears the bar do you freeze it:

```bash
python3 scripts/train_forecast_weekly.py --horizon 2 --feature-set parsimonious
```

---

## What I expect, so you can judge the result rather than hope for it

**The `weather_only` row is the real diagnostic.** It has no admission history at
all. If weather carries a genuine leading signal it will land somewhere near naive;
if it lands far above, the rainfall–dengue correlation in this data is a shared
annual cycle and nothing more.

I would expect `parsimonious` to be the strongest set, because the earlier ablation
showed error rising monotonically with feature count — and 45 features on 11,712 rows
across 10 expanding folds is exactly the regime where that happens again.

**It is a real possibility that nothing clears the bar.** If so, that is a finding,
not a failure, and it is defensible: a documented negative result with a calibrated
80% prediction interval that demonstrably covers 80% of outcomes is worth more in a
report than a model quietly presented as beating a baseline it loses to. The
interval is the part that already works, and it is what Section 7B actually consumes
— the risk-check asks "will stock still be sufficient", which is a question about
uncertainty, not a point estimate. We would ship the naive baseline wrapped in that
interval and state the gap plainly.

Either way, we will know from the tables rather than from argument.
