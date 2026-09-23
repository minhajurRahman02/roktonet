#!/usr/bin/env python3
"""
Stage 6A / A14 — Standalone validation of the frozen dataset.

    python3 scripts/validate_dataset.py

Reads the finished files and re-checks every property the dataset claims.
Prints PASS or FAIL per check and exits non-zero if anything fails.

WHY THIS EXISTS SEPARATELY FROM THE BUILD SCRIPTS
--------------------------------------------------
The build scripts already enforce these rules and refuse to write bad output, so
in normal operation this script is redundant. It exists for two situations the
build-time checks cannot cover:

  1. DEMONSTRATION. "How do you know the dataset is correct?" is answerable by
     running one command and showing the output, rather than by asking someone to
     read nine build scripts.
  2. DRIFT. If a file is regenerated, hand-edited, partially copied between
     machines, or truncated by a failed transfer, the build-time checks are long
     past. This re-checks the artefact as it exists on disk right now.

The checks are deliberately written INDEPENDENTLY of the build code — recomputing
from source rather than trusting a stored column — so a bug in a build script
cannot hide behind the same bug in its validator.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parents[1]

PROCESSED = REPO / "processed" / "blood_demand_daily.csv"
MERGED = REPO / "interim" / "dengue_merged_district_daily.csv"
CHRONIC = REPO / "interim" / "chronic_baseline_district.csv"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
RATES = REPO / "conversion_rates.yaml"

BOUNDS = ("low", "central", "high")
BBS_2022_TOTAL = 165_158_616
DGHS_2023_PUBLISHED = 321_179

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))


def main() -> None:
    missing = [p for p in (PROCESSED, MERGED, CHRONIC, DISTRICTS, RATES) if not p.exists()]
    if missing:
        for p in missing:
            print(f"FATAL: missing {p}")
        sys.exit(2)

    df = pd.read_csv(PROCESSED, parse_dates=["date"])
    merged = pd.read_csv(MERGED, parse_dates=["date"])
    chronic = pd.read_csv(CHRONIC)
    dd = pd.read_csv(DISTRICTS)
    rates = yaml.safe_load(RATES.read_text(encoding="utf-8"))

    print("=" * 66)
    print("RoktoNet blood demand dataset — validation")
    print("=" * 66)
    print(f"file   : {PROCESSED.relative_to(REPO)}")
    print(f"rows   : {len(df):,}   days: {df['date'].nunique():,}   "
          f"districts: {df['district'].nunique()}   columns: {len(df.columns)}")
    print()

    # ---------------- structure ----------------
    canonical = set(dd["district"])
    check("districts.csv holds exactly 64 districts", len(canonical) == 64,
          f"got {len(canonical)}")
    check("every district in the dataset is canonical",
          not (set(df["district"]) - canonical),
          f"unknown: {sorted(set(df['district']) - canonical)[:5]}")
    check("dataset covers all 64 districts", df["district"].nunique() == 64,
          f"got {df['district'].nunique()}")

    per_date = df.groupby("date")["district"].nunique()
    check("every date carries exactly 64 districts", (per_date == 64).all(),
          f"{int((per_date != 64).sum())} date(s) differ")
    check("no duplicate (date, district) rows",
          not df.duplicated(["date", "district"]).any(),
          f"{int(df.duplicated(['date','district']).sum())} duplicates")

    span = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    check("date index is contiguous (no missing calendar days)",
          df["date"].nunique() == len(span),
          f"{len(span) - df['date'].nunique()} day(s) absent")
    check("row count == days x districts", len(df) == len(span) * 64,
          f"expected {len(span)*64:,}, got {len(df):,}")

    required = (["date", "division", "district"]
                + [f"{s}_bags_{b}" for s in ("dengue", "chronic", "total") for b in BOUNDS])
    nulls = df[required].isna().sum().sum()
    check("no nulls in key or demand columns", nulls == 0, f"{nulls} null cell(s)")

    # ---------------- bounds ----------------
    for s in ("dengue", "chronic", "total"):
        lo, ce, hi = (df[f"{s}_bags_{b}"] for b in BOUNDS)
        check(f"{s}: low <= central <= high", ((lo <= ce) & (ce <= hi)).all(),
              f"{int((~((lo <= ce) & (ce <= hi))).sum())} row(s) violate ordering")
        check(f"{s}: no negative values", (lo >= 0).all(),
              f"{int((lo < 0).sum())} negative row(s)")

    # ---------------- arithmetic, recomputed from source ----------------
    tr = rates["dengue"]["transfusion_rate"]
    up = rates["dengue"]["units_per_transfused_case"]
    for b in BOUNDS:
        want = df["dengue_admissions"].fillna(0.0) * float(tr[b]) * float(up[b])
        check(f"dengue_bags_{b} == admissions x rate x units (recomputed)",
              bool((want - df[f"dengue_bags_{b}"]).abs().max() < 0.01),
              f"max diff {(want - df[f'dengue_bags_{b}']).abs().max():.4f}")
    for b in BOUNDS:
        want = df[f"dengue_bags_{b}"] + df[f"chronic_bags_{b}"]
        check(f"total_bags_{b} == dengue + chronic",
              bool((want - df[f"total_bags_{b}"]).abs().max() < 0.01),
              f"max diff {(want - df[f'total_bags_{b}']).abs().max():.4f}")

    # ---------------- chronic is a per-district constant ----------------
    nun = df.groupby("district")[[f"chronic_bags_{b}" for b in BOUNDS]].nunique().max().max()
    check("chronic floor is constant per district", nun == 1,
          f"a district carries {nun} distinct values")

    ch_map = dict(zip(chronic["district"], chronic["chronic_bags_day_central"]))
    got = df.groupby("district")["chronic_bags_central"].first()
    diff = max(abs(got[k] - v) for k, v in ch_map.items())
    check("chronic floor matches chronic_baseline_district.csv", diff < 0.01,
          f"max diff {diff:.4f}")

    # ---------------- provenance: the dengue series is unchanged ----------------
    a = (df.loc[df["dengue_observed"], ["date", "district", "dengue_admissions"]]
           .sort_values(["date", "district"]).reset_index(drop=True))
    b_ = (merged[["date", "district", "admissions"]]
            .sort_values(["date", "district"]).reset_index(drop=True))
    check("observed dengue rows match the merged source exactly", len(a) == len(b_),
          f"{len(a):,} vs {len(b_):,} rows")
    if len(a) == len(b_):
        d = (a["dengue_admissions"].values - b_["admissions"].values)
        check("dengue admissions unchanged from merged source",
              bool(abs(d).max() < 0.01), f"max diff {abs(d).max():.4f}")

    # ---------------- external cross-checks ----------------
    pop = int(dd["population"].sum())
    drift = abs(pop / BBS_2022_TOTAL - 1)
    check("district populations reconcile to the 2022 BBS census (<1%)", drift < 0.01,
          f"drift {drift:.2%}")

    d2023 = merged[merged["date"].dt.year == 2023]["admissions"].sum()
    rel = abs(d2023 / DGHS_2023_PUBLISHED - 1)
    check(f"2023 dengue total matches DGHS published {DGHS_2023_PUBLISHED:,} (<1%)",
          rel < 0.01, f"got {d2023:,.0f} ({rel:.3%} off)")

    # ---------------- v1 scope is what the docs claim ----------------
    check("trauma stream is marked deferred",
          rates["trauma"]["status"] == "DEFERRED_TO_V1_1", rates["trauma"]["status"])
    check("residual stream is marked removed",
          rates["residual"]["status"] == "REMOVED_FROM_V1", rates["residual"]["status"])
    check("national anchor is marked cross-check only",
          rates["national_anchor"]["role"] == "cross_check_only",
          rates["national_anchor"]["role"])

    # ---------------- report ----------------
    width = max(len(n) for n, _, _ in results)
    failed = 0
    for name, ok, detail in results:
        if ok:
            print(f"  PASS  {name}")
        else:
            failed += 1
            print(f"  FAIL  {name:<{width}}  {detail}")
    print()
    print("=" * 66)
    if failed:
        print(f"{failed} of {len(results)} checks FAILED")
        print("=" * 66)
        sys.exit(1)
    print(f"all {len(results)} checks passed")
    print("=" * 66)
    print()
    print("NOTE: these checks confirm the dataset is INTERNALLY CONSISTENT and")
    print("matches its sources. They cannot confirm the conversion rates are the")
    print("right ones — that rests on the citations in conversion_rates.yaml and")
    print("on the limitations listed in DATASET.md section 6.")


if __name__ == "__main__":
    main()
