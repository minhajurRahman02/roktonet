#!/usr/bin/env python3
"""
Stage 6B / B2 — Feature engineering at DISTRICT-WEEKLY grain, with weather.

Reads:  processed/blood_demand_daily.csv
        raw/reference/districts.csv
        interim/weather_daily.csv          OPTIONAL — see WEATHER below
Writes: processed/model_features_weekly.csv
        reports/feature_summary_weekly.csv
        reports/weather_lag_correlation.csv   (only when weather is present)

WHY WEEKLY, AND WHY THAT WAS MEASURED RATHER THAN ASSUMED
----------------------------------------------------------
The first attempt modelled district-DAILY admissions. At that grain 66.9% of
observations are zero and 17 of 64 districts average under one admission per day;
the series is dominated by short-term persistence and sampling noise. Weekly
aggregation is also what Section 7B actually asks: the risk-check question is
"will current stock still be sufficient by needed_by_date", which is CUMULATIVE
demand over a horizon, not the admission count on one specific future day. The
daily formulation was answering a question the system never poses.

The daily experiment is retained as evidence in
reports/model_walkforward_{7,14}.csv and scripts/build_features.py.

WEATHER — WHY IT WAS ADDED, AND WHAT IT HAS TO PROVE
-----------------------------------------------------
Walk-forward evaluation of the endogenous-only feature set produced a clean
negative result: no learned model beat naive persistence, and a feature-set
ablation showed error rising MONOTONICALLY as features were added (naive 12.968,
lags 13.377, lags+rolling 15.273, all 22 features 16.480, Ridge at h=1 week).

That is not a tuning failure. Every one of those features is a function of past
admissions, so the model had strictly no information that "last week's value"
lacks. The missing ingredient is a LEADING indicator — something that moves
BEFORE cases do. For dengue that is rainfall and temperature, at a lag of roughly
4-8 weeks (breeding-site formation, larval development, then the incubation and
reporting delay).

So weather is not "more features". It is the only input here that is not derived
from the target, and the honest test is narrow: does it beat naive persistence
under the SAME walk-forward protocol that the endogenous features failed? The
lag-correlation table printed at the end is the early read on that, computed
before any model is fitted.

If interim/weather_daily.csv is absent the build still runs, without weather
features, and says so. That keeps the endogenous baseline reproducible for
comparison rather than making it unreachable once weather lands.

PARTIAL-WEEK HANDLING
---------------------
A week whose daily series is incomplete would sum to a falsely LOW weekly total,
which would look like a real drop in demand. Weeks with fewer than 6 of 7 observed
days are DROPPED, not scaled up — scaling would be imputation wearing a coverage
flag. The same 6-of-7 rule is applied to the weather aggregation.

LEAKAGE DISCIPLINE
------------------
Features at week w use observations from weeks <= w; the target is week w + h.
Same-week admissions are a legitimate feature — the week is complete before the
forecast is made, and DGHS publishes daily. Same-week weather likewise: rainfall
is measured, not forecast. The audit at the end re-derives a sample of both
admission lags and weather lags from the raw series and fails the build on any
mismatch. It has already caught one real bug (see the reindex comment below).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "processed" / "blood_demand_daily.csv"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
WEATHER = REPO / "interim" / "weather_daily.csv"
OUT = REPO / "processed" / "model_features_weekly.csv"
SUMMARY = REPO / "reports" / "feature_summary_weekly.csv"
WXCORR = REPO / "reports" / "weather_lag_correlation.csv"

START = "2022-01-01"
MIN_DAYS_PER_WEEK = 6
HORIZONS = (1, 2, 4)            # weeks ahead

# Longest ADMISSION window is 8 weeks, NOT 13, and that was a data-retention
# decision. A single dropped week invalidates the next W weeks of rolling
# features, and late-2025/2026 carries a coverage gap every few months. With
# W=13 the usable span ended 2025-09-08 — a full year of the most recent data
# lost. W=8 recovers the span to 2026-06-29 while keeping MIN_DAYS_PER_WEEK at
# 6, i.e. without scaling up any partial week.
LAGS = (0, 1, 2, 3, 4, 8)
WINDOWS = (4, 8)

# WEATHER lags can go deeper for free. They are computed on the weather series'
# OWN grid, which starts 2021-06-01 — seven months before the modelling window —
# so a 12-week rainfall lag costs zero modelled weeks. This is the whole reason
# fetch_weather.py starts before START.
RAIN_LAGS = (0, 2, 3, 4, 5, 6, 8, 10, 12)
TEMP_LAGS = (0, 2, 4, 6, 8)
HUMID_LAGS = (0, 4, 8)
# Cumulative rainfall over the two windows the dengue literature points at.
# Expressed as (name, start_lag, end_lag) meaning weeks t-start .. t-end
# inclusive, so rain_sum_4_8 is the four weeks ending two months back.
RAIN_WINDOWS = (("rain_sum_4_8", 5, 8), ("rain_sum_8_12", 9, 12),
                ("rain_sum_0_3", 0, 3))


def weekly_weather(grain: str) -> tuple[pd.DataFrame, list[str]] | tuple[None, list[str]]:
    """Aggregate daily weather to unit-week and build lag features.

    Computed on the weather series' own complete grid, then merged onto the
    admissions grid. Doing it the other way round would charge every deep
    rainfall lag against the modelling window's start date and throw away the
    first three months of it for no reason.

    At DIVISION grain the district series are averaged, not summed. Rainfall in
    mm is an intensity, not a count: summing eight districts' rainfall would
    report a division as eight times wetter than any point in it. Averaging is
    also the more honest aggregate given the grid-cell finding — 64 districts
    resolve to only 45 distinct NASA POWER cells, and several divisions contain
    districts that are already sharing a cell, so the "average" is often over
    fewer independent measurements than it appears.
    """
    if not WEATHER.exists():
        return None, []

    wx = pd.read_csv(WEATHER, parse_dates=["date"])
    wx["week"] = wx["date"].dt.to_period("W").dt.start_time
    unit = "district" if grain == "district" else "division"

    agg = (wx.groupby(["week", "district"], as_index=False)
             .agg(rain=("rain_mm", "sum"),
                  temp=("temp_mean_c", "mean"),
                  temp_max=("temp_max_c", "mean"),
                  humid=("humidity_pct", "mean"),
                  days=("date", "nunique")))
    # same 6-of-7 rule as admissions: a partial week understates a rainfall SUM
    agg.loc[agg["days"] < MIN_DAYS_PER_WEEK, [
        "rain", "temp", "temp_max", "humid"]] = np.nan
    agg = agg.drop(columns=["days"])

    if unit == "division":
        div_of = dict(zip(wx["district"], wx["division"]))
        agg["division"] = agg["district"].map(div_of)
        agg = (agg.groupby(["week", "division"], as_index=False)
               [["rain", "temp", "temp_max", "humid"]].mean())

    agg = agg.rename(columns={unit: "unit"})
    weeks = pd.date_range(agg["week"].min(), agg["week"].max(), freq="7D")
    units = sorted(agg["unit"].unique())
    grid = pd.MultiIndex.from_product([weeks, units],
                                      names=["week", "unit"]).to_frame(index=False)
    agg = grid.merge(agg, on=["week", "unit"], how="left")
    agg = agg.sort_values(["unit", "week"]).reset_index(drop=True)

    g = agg.groupby("unit", sort=False)
    cols: list[str] = []
    for k in RAIN_LAGS:
        c = f"rain_lag_{k}"
        agg[c] = g["rain"].shift(k)
        cols.append(c)
    for k in TEMP_LAGS:
        c = f"temp_lag_{k}"
        agg[c] = g["temp"].shift(k)
        cols.append(c)
        if k in (0, 4):
            c = f"temp_max_lag_{k}"
            agg[c] = g["temp_max"].shift(k)
            cols.append(c)
    for k in HUMID_LAGS:
        c = f"humid_lag_{k}"
        agg[c] = g["humid"].shift(k)
        cols.append(c)

    for name, a, b in RAIN_WINDOWS:
        # sum of rain over weeks t-b .. t-a inclusive, via shifted rolling sum
        agg[name] = (g["rain"]
                     .transform(lambda s, a=a, b=b:
                                s.shift(a).rolling(b - a + 1, min_periods=b - a + 1).sum()))
        cols.append(name)

    # Warm AND wet together is the condition the literature describes, and a
    # linear model cannot express an interaction. Given explicitly rather than
    # hoped for.
    agg["rain_x_temp_4_8"] = agg["rain_sum_4_8"] * agg["temp_lag_6"]
    cols.append("rain_x_temp_4_8")

    return agg[["week", "unit"] + cols], cols


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grain", default="district", choices=("district", "division"),
                    help="forecasting unit. 'division' aggregates the 64 districts "
                         "into 8 divisions before any feature is computed.")
    args = ap.parse_args()
    grain = args.grain
    unit_col = "district" if grain == "district" else "division"
    out_path = OUT if grain == "district" else OUT.with_name(
        OUT.stem + "_division" + OUT.suffix)
    summary_path = SUMMARY if grain == "district" else SUMMARY.with_name(
        SUMMARY.stem + "_division" + SUMMARY.suffix)
    corr_path = WXCORR if grain == "district" else WXCORR.with_name(
        WXCORR.stem + "_division" + WXCORR.suffix)

    for p in (SRC, DISTRICTS):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")

    d = pd.read_csv(SRC, parse_dates=["date"])
    dd = pd.read_csv(DISTRICTS)
    d = d[(d["date"] >= START) & d["dengue_observed"]].copy()
    if d.empty:
        sys.exit(f"FATAL: no observed rows on/after {START}")

    d["week"] = d["date"].dt.to_period("W").dt.start_time

    # --- coverage gate: drop partial weeks rather than understate them ---
    cov = d.groupby("week")["date"].nunique().rename(
        "days_observed").reset_index()
    good = set(cov.loc[cov["days_observed"] >= MIN_DAYS_PER_WEEK, "week"])
    dropped = cov[cov["days_observed"] < MIN_DAYS_PER_WEEK]
    dg = d[d["week"].isin(good)]

    # Admissions aggregate to the unit. Calendar flags do NOT: they are
    # properties of the DATE, identical for every unit, so they are counted once
    # per week from the deduplicated date list. Summing them across units would
    # multiply "days of Eid this week" by the number of units — correct by
    # accident at district grain only because there is one row per unit-day.
    wk = (dg.groupby(["week", unit_col], as_index=False)
            .agg(admissions=("dengue_admissions", "sum")))
    cal = (dg.drop_duplicates("date").groupby("week", as_index=False)
             .agg(eid_days=("is_eid_holiday", "sum"),
                  ramadan_days=("is_ramadan", "sum"),
                  holiday_days=("is_public_holiday", "sum"),
                  fog_days=("is_winter_fog_season", "sum")))

    # REINDEX TO A COMPLETE WEEKLY GRID BEFORE ANY SHIFT.
    # shift(k) moves k ROWS, not k weeks. With partial weeks dropped above, the
    # surviving rows are not contiguous in time, so a naive shift(4) would
    # silently reach back 5 or 6 weeks wherever a gap intervenes. Reindexing
    # makes a dropped week an explicit NaN that propagates into the lag and is
    # then removed by the dropna, instead of quietly shifting the wrong value
    # into place. The leakage audit at the end catches exactly this, and did.
    all_weeks = pd.date_range(wk["week"].min(), wk["week"].max(), freq="7D")
    all_units = sorted(wk[unit_col].unique())
    grid = (pd.MultiIndex.from_product([all_weeks, all_units],
                                       names=["week", "unit"]).to_frame(index=False))
    wk = grid.merge(wk.rename(columns={unit_col: "unit"}), on=["week", "unit"],
                    how="left").merge(cal, on="week", how="left")

    # peer group: at district grain, the rest of this district's DIVISION — the
    # informative neighbourhood. At division grain there is no smaller peer set,
    # so it is the rest of the country.
    if grain == "district":
        div_of = dict(zip(dg["district"], dg["division"]))
        wk["peer_group"] = wk["unit"].map(div_of)
    else:
        wk["peer_group"] = "ALL"

    wk["month"] = wk["week"].dt.month
    wk["week_of_year"] = wk["week"].dt.isocalendar().week.astype(int)
    # cyclical encoding so week 52 and week 1 are adjacent, which they are
    wk["woy_sin"] = np.sin(2 * np.pi * wk["week_of_year"] / 52.0)
    wk["woy_cos"] = np.cos(2 * np.pi * wk["week_of_year"] / 52.0)

    wk = wk.sort_values(["unit", "week"]).reset_index(drop=True)
    g = wk.groupby("unit", sort=False)["admissions"]

    for k in LAGS:
        wk[f"lag_{k}"] = g.shift(k)
    for w in WINDOWS:
        wk[f"roll_mean_{w}"] = g.transform(
            lambda s, w=w: s.rolling(w, min_periods=w).mean())
        wk[f"roll_max_{w}"] = g.transform(
            lambda s, w=w: s.rolling(w, min_periods=w).max())
    wk["roll_std_4"] = g.transform(lambda s: s.rolling(4, min_periods=4).std())

    # growth ratio: the single most informative endogenous outbreak signal
    wk["growth_1_4"] = (wk["lag_0"] + 1) / (wk["roll_mean_4"] + 1)
    wk["growth_4_8"] = (wk["roll_mean_4"] + 1) / (wk["roll_mean_8"] + 1)

    psum = wk.groupby(["week", "peer_group"])["admissions"].transform("sum")
    pn = wk.groupby(["week", "peer_group"])["admissions"].transform("count")
    wk["peer_other_mean"] = (psum - wk["admissions"]) / \
        (pn - 1).replace(0, np.nan)
    wk["peer_other_lag1"] = (wk.groupby("unit", sort=False)[
                             "peer_other_mean"].shift(1))

    pop = dict(zip(dd["district"], dd["population"]))
    if grain == "district":
        wk["log_population"] = np.log(wk["unit"].map(pop))
    else:
        dpop = dd.groupby("division")["population"].sum().to_dict()
        wk["log_population"] = np.log(wk["unit"].map(dpop))
    if wk["log_population"].isna().any():
        sys.exit(f"FATAL: a {grain} has no population in districts.csv")

    for h in HORIZONS:
        wk[f"y_w{h}"] = wk.groupby("unit", sort=False)["admissions"].shift(-h)

    endo_cols = ([f"lag_{k}" for k in LAGS]
                 + [f"roll_mean_{w}" for w in WINDOWS]
                 + [f"roll_max_{w}" for w in WINDOWS]
                 + ["roll_std_4", "growth_1_4", "growth_4_8",
                    "peer_other_lag1", "log_population",
                    "month", "woy_sin", "woy_cos",
                    "eid_days", "ramadan_days", "holiday_days", "fog_days"])

    # ---------------- weather join ----------------
    wxdf, wx_cols = weekly_weather(grain)
    if wxdf is None:
        print("WEATHER: interim/weather_daily.csv not found — building the "
              "ENDOGENOUS-ONLY feature set.\n")
    else:
        missing_u = set(wk["unit"]) - set(wxdf["unit"])
        if missing_u:
            sys.exit(f"FATAL: no weather for {len(missing_u)} {grain}(s), "
                     f"e.g. {sorted(missing_u)[:3]}.")
        before = len(wk)
        wk = wk.merge(wxdf, on=["week", "unit"], how="left")
        if len(wk) != before:
            sys.exit("FATAL: the weather merge changed the row count — duplicate "
                     "(week, unit) keys in weather_daily.csv.")
        print(f"WEATHER: joined {len(wx_cols)} features from {WEATHER.name}\n")

    feature_cols = endo_cols + wx_cols

    n0 = len(wk)
    wk = wk[wk["admissions"].notna()]          # grid-only filler weeks
    wk = wk.dropna(subset=feature_cols)
    n1 = len(wk)
    if wk.empty:
        sys.exit("FATAL: every row was dropped.")

    # The output keeps the column name `district` for the unit whatever the
    # grain, so that train_forecast_weekly.py and the Flask service read one
    # schema. `grain` records what the values actually are; at division grain
    # the `district` column holds division names. Stated here rather than left
    # for someone to infer from the values.
    wk["grain"] = grain
    wk = wk.rename(columns={"unit": "district"})
    wk["division"] = wk["peer_group"] if grain == "district" else wk["district"]

    keep = (["week", "grain", "division", "district", "admissions"] + feature_cols
            + [f"y_w{h}" for h in HORIZONS])
    out = wk[keep].sort_values(["week", "district"]).reset_index(drop=True)

    # ---------------- leakage audit ----------------
    raw = (dg.groupby([unit_col, "week"])["dengue_admissions"].sum().to_dict())
    rain_raw = {}
    if wxdf is not None and grain == "district":
        _w = pd.read_csv(WEATHER, parse_dates=["date"])
        _w["week"] = _w["date"].dt.to_period("W").dt.start_time
        _a = _w.groupby(["district", "week"]).agg(rain=("rain_mm", "sum"),
                                                  days=("date", "nunique"))
        rain_raw = {k: v for k, v in _a[_a["days"]
                                        >= MIN_DAYS_PER_WEEK]["rain"].items()}

    sample = out.sample(min(400, len(out)), random_state=0)
    bad = []
    for _, r in sample.iterrows():
        u, w = r["district"], r["week"]
        for k in (1, 4):
            want = raw.get((u, w - pd.Timedelta(weeks=k)))
            if want is not None and abs(want - r[f"lag_{k}"]) > 1e-6:
                bad.append(f"lag_{k} {u} {w.date()}")
        for hh in HORIZONS:
            want = raw.get((u, w + pd.Timedelta(weeks=hh)))
            if want is not None and not np.isnan(r[f"y_w{hh}"]):
                if abs(want - r[f"y_w{hh}"]) > 1e-6:
                    bad.append(f"y_w{hh} {u} {w.date()}")
        # weather lags get the same treatment; a shift bug here would be just as
        # invisible and just as fatal, and the deep lags are the whole point
        for k in (4, 8, 12):
            if f"rain_lag_{k}" not in out.columns or not rain_raw:
                continue
            want = rain_raw.get((u, w - pd.Timedelta(weeks=k)))
            if want is not None and abs(want - r[f"rain_lag_{k}"]) > 1e-4:
                bad.append(f"rain_lag_{k} {u} {w.date()}")
    if bad:
        for b in bad[:10]:
            print("AUDIT FAILURE:", b, file=sys.stderr)
        sys.exit(
            f"FATAL: {len(bad)} audit mismatch(es). Features NOT trustworthy.")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(out_path, index=False)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({
        "feature": feature_cols,
        "kind": ["weather" if c in wx_cols else "endogenous" for c in feature_cols],
        "mean": [round(float(out[c].mean()), 4) for c in feature_cols],
        "std": [round(float(out[c].std()), 4) for c in feature_cols],
        "min": [round(float(out[c].min()), 4) for c in feature_cols],
        "max": [round(float(out[c].max()), 4) for c in feature_cols],
    }).to_csv(summary_path, index=False)

    print(f"wrote {out_path}  ({len(out):,} rows x {len(out.columns)} cols)")
    print(f"  grain      : {grain}  ({out['district'].nunique()} units)")
    print(f"  weeks      : {out['week'].nunique()}  "
          f"({out['week'].min().date()} .. {out['week'].max().date()})")
    print(f"  features   : {len(feature_cols)}  "
          f"({len(endo_cols)} endogenous + {len(wx_cols)} weather)")
    print(f"  targets    : {', '.join(f'y_w{h}' for h in HORIZONS)}")
    print()
    print(
        f"  weeks dropped for <{MIN_DAYS_PER_WEEK}/7 daily coverage: {len(dropped)}")
    print(f"  rows dropped for incomplete history      : {n0-n1:,}")
    print(
        f"  mean admissions per unit-week            : {out['admissions'].mean():.1f}")
    print()
    print(
        f"  LEAKAGE AUDIT: {len(sample)} sampled rows re-derived, 0 mismatches (PASS)")

    if wx_cols:
        rows = []
        for c in wx_cols:
            for hh in HORIZONS:
                sub = out[[c, f"y_w{hh}"]].dropna()
                rows.append({"feature": c, "horizon_weeks": hh,
                             "spearman_r": round(float(
                                 sub[c].corr(sub[f"y_w{hh}"], method="spearman")), 4)})
        pd.DataFrame(rows).to_csv(corr_path, index=False)
        print(f"\n  weather lag correlations: {corr_path}")


if __name__ == "__main__":
    main()
