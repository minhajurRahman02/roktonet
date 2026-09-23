#!/usr/bin/env python3
"""
Stage 6A / A5 — Disaggregate division-level dengue admissions to district grain.

Reads:  interim/dengue_division_daily.csv, raw/reference/districts.csv
Writes: interim/dengue_daily_district.csv

METHOD (decided explicitly, not defaulted to)
-----------------------------------------------
The primary dengue sources recovered for this dataset are division-level (8 units):
  - Kaggle 2019-2023 (raw/dengue/kaggle_division_2019_2023.csv), confirmed 8 divisions
    despite its "district-wise" name
  - Wayback-recovered DGHS PDFs, 2021-12 onward — division-level UNTIL the PDF parser
    is calibrated against real text; may be upgradeable to true district-level later

RoktoNet's allocation runs at district grain (64 units). Rather than leave the dengue
stream at coarser resolution than everything else, each division's observed daily
total is split across its member districts BY POPULATION SHARE — the same technique
already used for the chronic transfusion baseline in build_chronic.py.

This is a MODELLING ASSUMPTION, not a second observation, and is labelled as such in
every output row. It assumes dengue attack rate is uniform within a division, which
is not literally true (urban districts with a large tertiary hospital draw referred
cases from surrounding rural districts, inflating their apparent share). It is the
best available assumption given no sub-division data exists for most of the range,
and it keeps the disaggregation method IDENTICAL and auditable across the whole
2019-2026 span, rather than changing definition year to year.

OUTPUT
------
Long format: one row per (date, district). Carries both the district-level estimate
and the division-level observed figure it was split from, so the assumption is never
hidden downstream.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[1]
DIVISION_IN = REPO / "interim" / "dengue_division_daily.csv"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
OUT = REPO / "interim" / "dengue_daily_district.csv"

POP_TOLERANCE = 0.01  # matches build_chronic.py's guard
BBS_2022_TOTAL = 165_158_616


def main() -> None:
    if not DIVISION_IN.exists():
        sys.exit(f"FATAL: {DIVISION_IN} not found. Run build_dengue_division.py first.")
    if not DISTRICTS.exists():
        sys.exit(f"FATAL: {DISTRICTS} not found.")

    div = pd.read_csv(DIVISION_IN, parse_dates=["date"])
    districts = pd.read_csv(DISTRICTS)

    if len(districts) != 64:
        sys.exit(f"FATAL: expected 64 districts, got {len(districts)}")
    pop_total = int(districts["population"].sum())
    drift = abs(pop_total / BBS_2022_TOTAL - 1)
    if drift > POP_TOLERANCE:
        sys.exit(f"FATAL: district population drifts {drift:.2%} from census. "
                 "Fix districts.csv before disaggregating.")

    # Population share WITHIN each division (not national share) — this is what
    # actually drives the split, since each division's total is distributed only
    # among its own member districts.
    districts = districts.copy()
    div_totals = districts.groupby("division")["population"].transform("sum")
    districts["share_within_division"] = districts["population"] / div_totals

    missing_div = set(div["division"]) - set(districts["division"])
    if missing_div:
        sys.exit(f"FATAL: division(s) in dengue data with no matching districts: {missing_div}")

    merged = div.merge(districts[["district", "division", "share_within_division",
                                    "population"]], on="division", how="left")

    merged["admissions_est"] = (
        merged["admissions_observed"] * merged["share_within_division"]
    )

    out = merged[[
        "date", "district", "division", "admissions_est",
        "admissions_observed", "share_within_division", "source",
    ]].rename(columns={"admissions_observed": "division_admissions_observed"})
    out["disaggregation_method"] = "population_share_within_division"
    out = out.sort_values(["date", "division", "district"]).reset_index(drop=True)

    # Round for readability but keep enough precision that re-summing to the
    # division total does not visibly drift.
    out["admissions_est"] = out["admissions_est"].round(4)
    out["share_within_division"] = out["share_within_division"].round(6)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    # --- reconciliation check: district sums must reproduce division totals ---
    check = out.groupby(["date", "division"])["admissions_est"].sum().reset_index()
    check = check.merge(div, on=["date", "division"], suffixes=("_reconstructed", "_orig"))
    check["diff"] = (check["admissions_est"] - check["admissions_observed"]).abs()
    max_diff = check["diff"].max()

    print(f"wrote {OUT}  ({len(out):,} rows)")
    print(f"  dates      : {out['date'].min().date()} .. {out['date'].max().date()}")
    print(f"  districts  : {out['district'].nunique()}")
    print(f"  reconciliation check: max |reconstructed - original division total| "
          f"= {max_diff:.6f}  ({'PASS' if max_diff < 0.01 else 'FAIL'})")
    if max_diff >= 0.01:
        sys.exit(1)

    print()
    print("Districts by share within their division (sanity spot-check, Dhaka division):")
    dhaka = districts[districts.division == "Dhaka"].sort_values(
        "share_within_division", ascending=False
    )
    print(dhaka[["district", "population", "share_within_division"]].head(5).to_string(index=False))


if __name__ == "__main__":
    main()
