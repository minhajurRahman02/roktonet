#!/usr/bin/env python3
"""
Stage 6A / A2-A4 (Kaggle branch) — Normalise the Kaggle dengue CSV to a clean
division-level daily time series.

Reads:  raw/dengue/kaggle_division_2019_2023.csv  (delivered verbatim, never hand-edited)
Writes: interim/dengue_division_daily.csv

PROVENANCE
----------
Source: kaggle.com/datasets/shampabanik12/district-wise-dengue-dataset-for-bangladesh
Despite its name, this dataset is DIVISION-level (8 units), not district-level (64).
Verified directly: exactly 8 distinct location names, matching Bangladesh's 8
divisions, not its 64 districts. The "district-wise" label in the dataset's own
title and description is a misnomer.

The dataset's own description states it was built from DGHS's daily press releases,
2019-2023 — the same primary source this whole pipeline targets, just already
extracted by someone else before old.dghs.gov.bd went offline (confirmed dead,
2026-09-22). Treated as a secondary source, not primary, but the best available
route to 2019-2021, which neither the archive PDF route nor the Wayback Machine
recovery could reach (Wayback's earliest confirmed PDF capture is 2021-12-13).

VALIDATION DONE BEFORE THIS SCRIPT WAS TRUSTED
-----------------------------------------------
  - 4,776 rows = exactly 597 dates x 8 divisions. No gaps, no duplicate (division,
    date) pairs.
  - Date range 2019-08-27 (the very first DGHS daily press release) to 2023-08-21.
  - Mixed date formats in the source (27/8/19 vs 21/8/2023) parse cleanly with
    pandas dayfirst=True, zero unparseable rows.
  - Spot-checked against the known 2023 outbreak: national daily total peaks at
    2,959 (2023-08-10), consistent with a year that totalled 321,179 hospitalisations
    (implying ~880/day average; a peak roughly 3.4x the annual average during the
    worst week of the worst outbreak on record is directionally sound).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "raw" / "dengue" / "kaggle_division_2019_2023.csv"
OUT = REPO / "interim" / "dengue_division_daily.csv"

# Kaggle's spelling -> this project's canonical division spelling (raw/reference/districts.csv).
DIVISION_MAP = {
    "Dhaka": "Dhaka",
    "Chottogram": "Chattogram",
    "Khulna": "Khulna",
    "Rangpur": "Rangpur",
    "Barishal": "Barishal",
    "Sylet": "Sylhet",
    "Mymensingh": "Mymensingh",
    "Rajshahi": "Rajshahi",
}

EXPECTED_FIRST_DATE = pd.Timestamp("2019-08-27")


def main() -> None:
    if not SRC.exists():
        sys.exit(f"FATAL: {SRC} not found. Copy the Kaggle CSV there first.")

    df = pd.read_csv(SRC)
    if set(df.columns) != {"District", "Month", "Patients"}:
        sys.exit(f"FATAL: unexpected columns {list(df.columns)} — source format changed, "
                 "re-check before trusting this script.")

    unmapped = set(df["District"].unique()) - set(DIVISION_MAP)
    if unmapped:
        sys.exit(f"FATAL: unrecognised division name(s) in source: {unmapped}. "
                 "Update DIVISION_MAP before proceeding — do not silently drop rows.")

    df["division"] = df["District"].map(DIVISION_MAP)
    df["date"] = pd.to_datetime(df["Month"], format="mixed", dayfirst=True)

    if df["date"].isna().any():
        n = int(df["date"].isna().sum())
        sys.exit(f"FATAL: {n} row(s) failed date parsing. Inspect raw source before proceeding.")

    if df["date"].min() != EXPECTED_FIRST_DATE:
        print(f"WARNING: earliest date is {df['date'].min().date()}, expected "
              f"{EXPECTED_FIRST_DATE.date()}. Source may have changed since this "
              "script was written.", file=sys.stderr)

    dup = df.duplicated(subset=["division", "date"]).sum()
    if dup:
        sys.exit(f"FATAL: {dup} duplicate (division, date) row(s). Source integrity issue.")

    neg = int((df["Patients"] < 0).sum())
    if neg:
        sys.exit(f"FATAL: {neg} negative patient count(s). Source integrity issue.")

    out = df[["date", "division", "Patients"]].rename(
        columns={"Patients": "admissions_observed"}
    ).sort_values(["date", "division"]).reset_index(drop=True)
    out["source"] = "kaggle_shampabanik12"

    # Reporting-date completeness: within the set of dates DGHS actually reported,
    # every reported date must carry all 8 divisions (no partial-division days).
    # It is NOT expected that every calendar day in the span has a report — DGHS
    # publishes only during active reporting periods, not necessarily year-round.
    # Missing calendar days are a real gap, recorded below, never silently filled.
    per_date_counts = out.groupby("date")["division"].nunique()
    partial = per_date_counts[per_date_counts != len(DIVISION_MAP)]
    if len(partial):
        sys.exit(f"FATAL: {len(partial)} date(s) have a partial division set "
                 f"(not all 8). First few: {partial.index[:5].tolist()}. "
                 "Source integrity issue — investigate before proceeding.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    # Gap report: every calendar day in the span with NO report at all.
    reported_dates = set(out["date"].dt.date)
    full_span = pd.date_range(out["date"].min(), out["date"].max(), freq="D")
    gap_dates = [d.date() for d in full_span if d.date() not in reported_dates]
    gap_path = REPO / "reports" / "dengue_kaggle_gap_report.csv"
    gap_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"date": gap_dates, "reason": "not_reported_by_dghs_in_source"}).to_csv(
        gap_path, index=False
    )

    print(f"wrote {OUT}  ({len(out):,} rows)")
    print(f"  date range      : {out['date'].min().date()} .. {out['date'].max().date()}")
    print(f"  divisions       : {sorted(out['division'].unique())}")
    print(f"  reported dates  : {len(reported_dates):,} of {len(full_span):,} calendar "
          f"days in span ({len(reported_dates)/len(full_span):.1%})")
    print(f"  gap report      : {gap_path}  ({len(gap_dates):,} unreported dates)")
    print(f"  total admissions in range: {int(out['admissions_observed'].sum()):,}")
    peak = out.groupby("date")["admissions_observed"].sum().idxmax()
    peak_val = out.groupby("date")["admissions_observed"].sum().max()
    print(f"  national peak day: {peak.date()}  ({int(peak_val):,} admissions)")


if __name__ == "__main__":
    main()
