#!/usr/bin/env python3
"""
Stage 6B / B2 — Feature engineering for the dengue demand forecaster.

Reads:  processed/blood_demand_daily.csv
        raw/reference/districts.csv
Writes: processed/model_features.csv
        reports/feature_summary.csv

WHAT IS BEING FORECAST, AND WHY IT IS ADMISSIONS RATHER THAN BAGS
------------------------------------------------------------------
The target is DENGUE ADMISSIONS per (date, district). Bags are derived afterwards
by applying conversion_rates.yaml outside the model.

The chronic stream is a literal constant — one distinct daily national value across
all 2,531 days — so "forecast blood demand" reduces to "forecast dengue admissions
and add a known floor". Modelling admissions rather than bags keeps two different
kinds of uncertainty separable:

  - FORECAST uncertainty (will admissions rise?) — what the model estimates
  - CONVERSION uncertainty (how many bags per case?) — a cited band, and in the
    case of transfusion_rate.central=0.22 an explicitly un-cited modelling choice

If the model were trained on bags, that 0.22 would be baked into the training
target and model error could never be separated from conversion-rate error. The
sensitivity analysis required before freeze would then be meaningless.

WHY THE WINDOW STARTS 2022-01-01
---------------------------------
The dataset spans 2019-08-27 onward, but 2019-2021 contributes only 177 usable days
broken by a 370-day and a 311-day hole (the COVID-era collapse of dengue
surveillance reporting). Lag and rolling features cannot be computed across gaps of
that size without inventing history.

From 2022-01-01 the series is 1,673 days with 63 unobserved (3.8%), longest true
interior gap 6 days. That is the modelling window. Dropping 2019-2021 is stated
here rather than silently applied, and it costs little: those 177 days are
overwhelmingly COVID-suppressed near-zero counts.

LEAKAGE DISCIPLINE
------------------
Every feature at row time t uses observations dated <= t. The target is admissions
at t + horizon, strictly in the future. Same-day admissions ARE a legitimate
feature: DGHS publishes each morning, so at forecast time t the count for day t is
known. The audit at the end asserts this ordering and fails the build otherwise.

Rolling statistics are computed on a complete daily grid per district, so a missing
day propagates as NaN rather than silently shortening a window. Rows whose target
or required lags are missing are DROPPED, never imputed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "processed" / "blood_demand_daily.csv"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
OUT = REPO / "processed" / "model_features.csv"
SUMMARY = REPO / "reports" / "feature_summary.csv"

START = "2022-01-01"
HORIZONS = (7, 14)          # days ahead; 7B elective requests are days-to-weeks out
LAGS = (0, 1, 2, 3, 7, 14, 21, 28)
WINDOWS = (7, 14, 28)


def main() -> None:
    for p in (SRC, DISTRICTS):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")

    df = pd.read_csv(SRC, parse_dates=["date"])
    dd = pd.read_csv(DISTRICTS)

    df = df[df["date"] >= START].copy()
    if df.empty:
        sys.exit(f"FATAL: no rows on/after {START}")

    # Complete (date x district) grid so gaps stay visible as NaN.
    grid_dates = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    districts = sorted(df["district"].unique())
    if len(districts) != 64:
        sys.exit(f"FATAL: expected 64 districts, got {len(districts)}")

    cal_cols = [c for c in df.columns if c in (
        "year", "month", "day_of_week", "week_of_year", "day_of_year", "is_weekend",
        "is_public_holiday", "is_fixed_holiday", "is_eid_holiday", "is_ramadan",
        "ramadan_day", "days_to_eid_fitr", "days_to_eid_adha",
        "is_eid_travel_window", "is_winter_fog_season")]

    base = df[["date", "division", "district", "dengue_admissions",
               "dengue_observed"] + cal_cols]
    full = (pd.MultiIndex.from_product([grid_dates, districts],
                                       names=["date", "district"])
            .to_frame(index=False)
            .merge(base, on=["date", "district"], how="left"))
    full["dengue_observed"] = full["dengue_observed"].fillna(False)

    # calendar is per-date; backfill it onto grid rows the join missed
    cal = base[["date"] + cal_cols].drop_duplicates("date")
    full = full.drop(columns=cal_cols).merge(cal, on="date", how="left")
    full["division"] = full.groupby("district")["division"].ffill().bfill()

    full = full.sort_values(["district", "date"]).reset_index(drop=True)
    g = full.groupby("district", sort=False)["dengue_admissions"]

    # --- lags: value at t-k, known at forecast time t ---
    for k in LAGS:
        full[f"lag_{k}"] = g.shift(k)

    # --- rolling stats ending at t INCLUSIVE (same-day count is published) ---
    for w in WINDOWS:
        full[f"roll_mean_{w}"] = g.transform(
            lambda s, w=w: s.rolling(w, min_periods=w).mean())
        full[f"roll_max_{w}"] = g.transform(
            lambda s, w=w: s.rolling(w, min_periods=w).max())
    for w in (7, 14):
        full[f"roll_std_{w}"] = g.transform(
            lambda s, w=w: s.rolling(w, min_periods=w).std())

    # --- momentum: is this district accelerating? ---
    full["trend_7_28"] = full["roll_mean_7"] - full["roll_mean_28"]
    full["trend_7_14"] = full["roll_mean_7"] - full["roll_mean_14"]

    # --- neighbourhood signal: the district's DIVISION, excluding itself ---
    div_sum = (full.groupby(["date", "division"])["dengue_admissions"]
                 .transform("sum"))
    div_n = full.groupby(["date", "division"])["dengue_admissions"].transform("count")
    full["division_other_mean"] = ((div_sum - full["dengue_admissions"])
                                   / (div_n - 1).replace(0, np.nan))
    full["division_other_mean_lag7"] = (full.groupby("district", sort=False)
                                        ["division_other_mean"].shift(7))

    # --- static district attributes ---
    pop = dict(zip(dd["district"], dd["population"]))
    full["log_population"] = np.log(full["district"].map(pop))
    if full["log_population"].isna().any():
        sys.exit("FATAL: a district has no population in districts.csv")

    # --- targets: admissions h days ahead ---
    for h in HORIZONS:
        full[f"y_h{h}"] = full.groupby("district", sort=False)["dengue_admissions"].shift(-h)
        full[f"y_h{h}_observed"] = (full.groupby("district", sort=False)
                                    ["dengue_observed"].shift(-h)).fillna(False)

    feature_cols = ([f"lag_{k}" for k in LAGS]
                    + [f"roll_mean_{w}" for w in WINDOWS]
                    + [f"roll_max_{w}" for w in WINDOWS]
                    + ["roll_std_7", "roll_std_14", "trend_7_28", "trend_7_14",
                       "division_other_mean_lag7", "log_population"]
                    + cal_cols)

    # --- drop rows we cannot honestly use; never impute ---
    n0 = len(full)
    full = full[full["dengue_observed"]]
    n1 = len(full)
    full = full.dropna(subset=feature_cols)
    n2 = len(full)

    keep = (["date", "division", "district", "dengue_admissions"] + feature_cols
            + [f"y_h{h}" for h in HORIZONS] + [f"y_h{h}_observed" for h in HORIZONS])
    out = full[keep].sort_values(["date", "district"]).reset_index(drop=True)

    # ------------------------------------------------------------------
    # LEAKAGE AUDIT. Recompute a sample of features from the raw series by
    # brute force and confirm they match, and confirm the target is strictly
    # in the future. A silent leak here would invalidate every metric later.
    # ------------------------------------------------------------------
    raw = (base.set_index(["district", "date"])["dengue_admissions"]).to_dict()
    rng = np.random.default_rng(0)
    sample = out.sample(min(400, len(out)), random_state=0)
    bad = []
    for _, r in sample.iterrows():
        d, t = r["district"], r["date"]
        for k in (1, 7, 28):
            want = raw.get((d, t - pd.Timedelta(days=k)))
            if want is not None and abs(want - r[f"lag_{k}"]) > 1e-6:
                bad.append(f"lag_{k} mismatch {d} {t.date()}")
        want7 = [raw.get((d, t - pd.Timedelta(days=i))) for i in range(7)]
        if all(v is not None for v in want7):
            if abs(np.mean(want7) - r["roll_mean_7"]) > 1e-6:
                bad.append(f"roll_mean_7 mismatch {d} {t.date()}")
        for h in HORIZONS:
            want = raw.get((d, t + pd.Timedelta(days=h)))
            if want is not None and not np.isnan(r[f"y_h{h}"]):
                if abs(want - r[f"y_h{h}"]) > 1e-6:
                    bad.append(f"y_h{h} mismatch {d} {t.date()}")
    if bad:
        for b in bad[:10]:
            print("LEAK/AUDIT FAILURE:", b, file=sys.stderr)
        sys.exit(f"FATAL: {len(bad)} audit mismatch(es). Features are NOT trustworthy.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    summ = pd.DataFrame({
        "feature": feature_cols,
        "non_null": [int(out[c].notna().sum()) for c in feature_cols],
        "mean": [round(float(out[c].mean()), 4) for c in feature_cols],
        "std": [round(float(out[c].std()), 4) for c in feature_cols],
        "min": [round(float(out[c].min()), 4) for c in feature_cols],
        "max": [round(float(out[c].max()), 4) for c in feature_cols],
    })
    SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    summ.to_csv(SUMMARY, index=False)

    print(f"wrote {OUT}  ({len(out):,} rows x {len(out.columns)} cols)")
    print(f"  window     : {out['date'].min().date()} .. {out['date'].max().date()}")
    print(f"  features   : {len(feature_cols)}")
    print(f"  targets    : {', '.join(f'y_h{h}' for h in HORIZONS)}")
    print()
    print(f"  grid rows                       : {n0:,}")
    print(f"  after dropping unobserved days  : {n1:,}  (-{n0-n1:,})")
    print(f"  after dropping incomplete lags  : {n2:,}  (-{n1-n2:,})")
    for h in HORIZONS:
        n = int(out[f"y_h{h}"].notna().sum())
        print(f"  usable rows with y_h{h}           : {n:,}")
    print()
    print(f"  LEAKAGE AUDIT: {len(sample)} sampled rows re-derived from the raw "
          f"series, 0 mismatches  (PASS)")
    print(f"  feature summary: {SUMMARY}")


if __name__ == "__main__":
    main()
