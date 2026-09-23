#!/usr/bin/env python3
"""
Stage 6A / A13 — Final assembly. Daily district-level blood demand, v1.

Reads:  interim/dengue_merged_district_daily.csv
        interim/chronic_baseline_district.csv
        interim/calendar_features.csv
        conversion_rates.yaml
Writes: processed/blood_demand_daily.csv
        reports/blood_demand_summary.csv

WHAT THIS FILE IS, AND IS NOT
-----------------------------
IT IS: daily, district-level demand in blood bags arising from TWO named causes —
dengue and thalassemia — each carried as a low / central / high band derived from
cited clinical conversion rates.

IT IS NOT: total national blood demand. Surgery, obstetrics, oncology, anaemia,
GI bleeding and trauma are ABSENT. Every figure produced here is a LOWER BOUND.
Quote it as "dengue + thalassemia demand", never as "blood demand".

That limit is deliberate and is the result of a finding, not of laziness. The
original design solved a residual stream as (national total - other streams).
That method turned out to be arithmetically impossible: dengue and chronic alone
reach 85% of the published 975,000-bag national anchor at central values and 153%
at high bounds, so the residual is negligible at best and negative at worst. The
full reasoning is in conversion_rates.yaml -> reconciliation_finding.

THE ARITHMETIC
--------------
  dengue_bags  = dengue_admissions x transfusion_rate x units_per_transfused_case
  chronic_bags = per-district constant, population-apportioned (build_chronic.py)
  total_bags   = dengue_bags + chronic_bags

Bounds compose at the SAME percentile throughout: total_low uses dengue low with
chronic low. This is deliberately conservative in width — it does not assume the
two streams' errors are independent, because they are not: both rest on the same
kind of literature-derived conversion rate, and a reviewer who doubts one will
doubt the other the same way.

DENGUE COVERAGE IS NOT UNIFORM, AND THAT PROPAGATES
---------------------------------------------------
The dengue series covers 1,787 of 2,531 calendar days (70.6%). The gaps are real
— chiefly a 370-day and a 311-day run during the COVID-era collapse of dengue
surveillance reporting. On days with no dengue observation this file emits the
chronic floor ONLY, and flags the row via dengue_observed=False. It does NOT
interpolate. A modelling step may choose to; the dataset will not decide that.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parents[1]
DENGUE = REPO / "interim" / "dengue_merged_district_daily.csv"
CHRONIC = REPO / "interim" / "chronic_baseline_district.csv"
CALENDAR = REPO / "interim" / "calendar_features.csv"
RATES = REPO / "conversion_rates.yaml"
OUT = REPO / "processed" / "blood_demand_daily.csv"
SUMMARY = REPO / "reports" / "blood_demand_summary.csv"

BOUNDS = ("low", "central", "high")


def main() -> None:
    for p in (DENGUE, CHRONIC, CALENDAR, RATES):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")

    rates = yaml.safe_load(RATES.read_text(encoding="utf-8"))
    if rates["residual"]["status"] != "REMOVED_FROM_V1":
        sys.exit("FATAL: residual stream is not marked removed; this script assumes v1 scope.")
    if rates["trauma"]["status"] != "DEFERRED_TO_V1_1":
        sys.exit("FATAL: trauma is not marked deferred; this script assumes v1 scope.")

    tr = rates["dengue"]["transfusion_rate"]
    up = rates["dengue"]["units_per_transfused_case"]

    den = pd.read_csv(DENGUE, parse_dates=["date"])
    chr_ = pd.read_csv(CHRONIC)
    cal = pd.read_csv(CALENDAR, parse_dates=["date"])

    # --- full (date x district) grid over the dengue span ---
    span = pd.date_range(den["date"].min(), den["date"].max(), freq="D")
    districts = chr_[["district", "division"]].drop_duplicates()
    if len(districts) != 64:
        sys.exit(f"FATAL: expected 64 districts in chronic baseline, got {len(districts)}")
    grid = pd.MultiIndex.from_product([span, districts["district"]],
                                      names=["date", "district"]).to_frame(index=False)
    grid = grid.merge(districts, on="district", how="left")

    # --- dengue: left-joined, so missing days stay missing rather than becoming 0 ---
    den_slim = den[["date", "district", "admissions", "is_estimated"]].rename(
        columns={"admissions": "dengue_admissions",
                 "is_estimated": "dengue_is_estimated"})
    df = grid.merge(den_slim, on=["date", "district"], how="left")
    df["dengue_observed"] = df["dengue_admissions"].notna()
    df["dengue_is_estimated"] = df["dengue_is_estimated"].fillna(False)

    for b in BOUNDS:
        df[f"dengue_bags_{b}"] = (
            df["dengue_admissions"].fillna(0.0) * float(tr[b]) * float(up[b])
        )

    # --- chronic: a per-district daily constant ---
    chr_slim = chr_[["district"] + [f"chronic_bags_day_{b}" for b in BOUNDS]]
    df = df.merge(chr_slim, on="district", how="left")
    if df[[f"chronic_bags_day_{b}" for b in BOUNDS]].isna().any().any():
        sys.exit("FATAL: a district has no chronic baseline.")
    for b in BOUNDS:
        df = df.rename(columns={f"chronic_bags_day_{b}": f"chronic_bags_{b}"})

    # --- total, composed at matching percentiles ---
    for b in BOUNDS:
        df[f"total_bags_{b}"] = df[f"dengue_bags_{b}"] + df[f"chronic_bags_{b}"]

    # --- calendar features ---
    df = df.merge(cal, on="date", how="left")
    if df["year"].isna().any():
        missing = df.loc[df["year"].isna(), "date"].dt.date.unique()[:5]
        sys.exit(f"FATAL: calendar features missing for dates such as {list(missing)}")

    # --- hard checks ---
    if df.duplicated(["date", "district"]).any():
        sys.exit("FATAL: duplicate (date, district) rows.")
    per_date = df.groupby("date")["district"].nunique()
    if (per_date != 64).any():
        sys.exit("FATAL: some dates do not carry exactly 64 districts.")
    for b in BOUNDS:
        if (df[f"total_bags_{b}"] < 0).any():
            sys.exit(f"FATAL: negative total_bags_{b}.")
    bad = (df["total_bags_low"] > df["total_bags_central"]) | \
          (df["total_bags_central"] > df["total_bags_high"])
    if bad.any():
        sys.exit(f"FATAL: {int(bad.sum())} row(s) violate low <= central <= high.")

    num = ([f"{s}_bags_{b}" for s in ("dengue", "chronic", "total") for b in BOUNDS]
           + ["dengue_admissions"])
    df[num] = df[num].round(4)

    cols = (["date", "division", "district", "dengue_admissions", "dengue_observed",
             "dengue_is_estimated"]
            + [f"dengue_bags_{b}" for b in BOUNDS]
            + [f"chronic_bags_{b}" for b in BOUNDS]
            + [f"total_bags_{b}" for b in BOUNDS]
            + [c for c in cal.columns if c != "date"])
    out = df[cols].sort_values(["date", "division", "district"]).reset_index(drop=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    # --- summary + the anchor cross-check (NOT a reconciliation) ---
    anchor = float(rates["national_anchor"]["annual_requirement_bags"]["central"])
    rows = []
    for y, g in out.groupby(out["date"].dt.year):
        r = {"year": int(y), "days_in_data": int(g["date"].nunique()),
             "days_with_dengue": int(g.loc[g["dengue_observed"], "date"].nunique())}
        for b in BOUNDS:
            r[f"dengue_bags_{b}"] = round(g[f"dengue_bags_{b}"].sum(), 1)
            r[f"chronic_bags_{b}"] = round(g[f"chronic_bags_{b}"].sum(), 1)
            r[f"total_bags_{b}"] = round(g[f"total_bags_{b}"].sum(), 1)
        r["total_central_vs_anchor"] = round(r["total_bags_central"] / anchor, 4)
        rows.append(r)
    summ = pd.DataFrame(rows)
    SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    summ.to_csv(SUMMARY, index=False)

    print(f"wrote {OUT}  ({len(out):,} rows)")
    print(f"  span       : {out['date'].min().date()} .. {out['date'].max().date()} "
          f"({out['date'].nunique():,} days x 64 districts)")
    print(f"  dengue observed on {int(out['dengue_observed'].sum()):,} rows "
          f"({out['dengue_observed'].mean():.1%}); chronic floor on all rows")
    print(f"  columns    : {len(out.columns)}")
    print()
    print("  annual totals, bags (v1 = dengue + thalassemia ONLY, a lower bound):")
    for _, r in summ.iterrows():
        print(f"    {int(r['year'])}: "
              f"low {r['total_bags_low']:>11,.0f} | "
              f"central {r['total_bags_central']:>11,.0f} | "
              f"high {r['total_bags_high']:>11,.0f}   "
              f"({r['total_central_vs_anchor']:>6.1%} of the {anchor:,.0f} anchor, "
              f"{int(r['days_with_dengue'])} dengue-days)")
    print(f"\n  summary: {SUMMARY}")


if __name__ == "__main__":
    main()
