#!/usr/bin/env python3
"""
Stage 6A / A12 (dengue) — Merge the two dengue sources into one district series.

Reads:  interim/dengue_pdf_district_daily.csv   (DGHS PDFs, observed district grain)
        interim/dengue_daily_district.csv       (Kaggle division, population-disaggregated)
        raw/reference/districts.csv
Writes: interim/dengue_merged_district_daily.csv
        reports/dengue_merged_coverage.csv

THE TWO SOURCES, AND WHY BOTH ARE NEEDED
----------------------------------------
  PDF    2021-12-13 .. 2026-07-31, 1,625 days. TRUE district grain, read straight
         off DGHS's own district table. 2023 national total reproduces DGHS's
         published 321,179 exactly.
  Kaggle 2019-08-27 .. 2023-08-21, division grain, split to districts by
         population share. A third party's extraction of the same DGHS press
         releases, made before the source went offline.

Their 435-day overlap agrees at 0.998 correlation with identical daily national
totals on 77% of days. That agreement is what licenses joining them at all — two
independent extractions of the same underlying reports, cross-validating.

PRECEDENCE: PDF WINS EVERYWHERE BOTH EXIST.
The PDF figure is an observation; the Kaggle figure at district level is an
estimate (a division total apportioned by population). An observation always
beats an estimate of the same quantity. Kaggle therefore contributes only the
158 days the PDFs cannot reach: 2019-08-27 .. 2021-02-04.

DHAKA METRO IS FOLDED INTO DHAKA DISTRICT.
The PDF reports 65 units — 64 districts plus a combined DNCC+DSCC "Dhaka Metro"
figure. Its Dhaka district row is explicitly labelled "ঢাকা (ঢাকা মহানগর ব্যতীত)",
Dhaka EXCLUDING metro, so the two are disjoint and sum to the whole district.
The city corporations are geographically inside Dhaka district, and the Kaggle
side has no metro concept at all, so folding is what makes one consistent
64-district schema matching districts.csv. The metro/non-metro split remains
available in interim/dengue_pdf_district_daily.csv for anyone who wants it.

WHAT THIS DOES NOT REPAIR
-------------------------
  - A 312-day hole, 2021-02-04 .. 2021-12-13, where NEITHER source has data.
    This is the real COVID-era collapse in Bangladesh's dengue surveillance
    reporting, not a processing artefact. Recorded in the coverage report and
    left as a gap. Modelling must handle it; inventing rows would be worse.
  - The Kaggle-derived rows for Dhaka division carry a known distortion: metro
    cases were part of the division total and got apportioned across all 13
    Dhaka-division districts by population, so a share of genuinely-Dhaka-city
    cases sits on districts like Tangail in that period. Unfixable without
    sub-division data that does not exist for those dates. The is_estimated
    flag marks every such row.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[1]
PDF = REPO / "interim" / "dengue_pdf_district_daily.csv"
KAGGLE = REPO / "interim" / "dengue_daily_district.csv"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
OUT = REPO / "interim" / "dengue_merged_district_daily.csv"
COVERAGE = REPO / "reports" / "dengue_merged_coverage.csv"


def main() -> None:
    for p in (PDF, KAGGLE, DISTRICTS):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")

    dd = pd.read_csv(DISTRICTS)
    canonical = set(dd["district"])
    if len(canonical) != 64:
        sys.exit(f"FATAL: expected 64 districts in districts.csv, got {len(canonical)}")

    pdf = pd.read_csv(PDF, parse_dates=["date"])
    kag = pd.read_csv(KAGGLE, parse_dates=["date"])

    # --- fold Dhaka Metro into Dhaka district ---
    n_metro = int((pdf["district"] == "Dhaka Metro").sum())
    pdf["district"] = pdf["district"].replace({"Dhaka Metro": "Dhaka"})
    pdf = (pdf.groupby(["date", "division", "district"], as_index=False)
              .agg(admissions=("admissions_24h", "sum")))
    pdf["source"] = "dghs_pdf"
    pdf["is_estimated"] = False

    bad = sorted(set(pdf["district"]) - canonical)
    if bad:
        sys.exit(f"FATAL: PDF districts not in districts.csv after fold: {bad}")

    kag = kag.rename(columns={"admissions_est": "admissions"})[
        ["date", "division", "district", "admissions"]].copy()
    kag["source"] = "kaggle_division_disaggregated"
    kag["is_estimated"] = True

    bad = sorted(set(kag["district"]) - canonical)
    if bad:
        sys.exit(f"FATAL: Kaggle districts not in districts.csv: {bad}")

    # --- precedence: PDF wins everywhere both exist ---
    pdf_dates = set(pdf["date"])
    kag_unique = kag[~kag["date"].isin(pdf_dates)]
    merged = pd.concat([pdf, kag_unique], ignore_index=True)
    merged = merged.sort_values(["date", "division", "district"]).reset_index(drop=True)
    merged["admissions"] = merged["admissions"].round(4)

    # --- hard checks ---
    dup = merged.duplicated(["date", "district"]).sum()
    if dup:
        sys.exit(f"FATAL: {dup} duplicate (date, district) rows after merge.")
    per_date = merged.groupby("date")["district"].nunique()
    if (per_date != 64).any():
        n = int((per_date != 64).sum())
        sys.exit(f"FATAL: {n} date(s) do not have exactly 64 districts.")
    if (merged["admissions"] < 0).any():
        sys.exit("FATAL: negative admissions after merge.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUT, index=False)

    # --- coverage report: every calendar day in span, and what covers it ---
    span = pd.date_range(merged["date"].min(), merged["date"].max(), freq="D")
    have = merged.groupby("date")["source"].first()
    cov = pd.DataFrame({"date": span})
    cov["source"] = cov["date"].map(have).fillna("NO DATA")
    COVERAGE.parent.mkdir(parents=True, exist_ok=True)
    cov.to_csv(COVERAGE, index=False)

    gaps = cov[cov["source"] == "NO DATA"]
    longest = 0
    if len(gaps):
        d = gaps["date"].diff().dt.days.ne(1).cumsum()
        longest = int(gaps.groupby(d).size().max())

    obs = int((~merged["is_estimated"]).sum())
    print(f"wrote {OUT}  ({len(merged):,} rows)")
    print(f"  span            : {merged['date'].min().date()} .. {merged['date'].max().date()}")
    print(f"  days with data  : {merged['date'].nunique():,} of {len(span):,} calendar days "
          f"({merged['date'].nunique()/len(span):.1%})")
    print(f"  districts       : {merged['district'].nunique()} (64 expected)")
    print(f"  observed rows   : {obs:,} ({obs/len(merged):.1%})  [DGHS PDFs, district grain]")
    print(f"  estimated rows  : {len(merged)-obs:,} ({1-obs/len(merged):.1%})  "
          f"[Kaggle division, population-disaggregated]")
    print(f"  Dhaka Metro rows folded into Dhaka: {n_metro:,}")
    print(f"  coverage report : {COVERAGE}")
    print(f"  days with NO data: {len(gaps):,}  (longest run: {longest} days)")
    print()
    print(f"  total admissions: {merged['admissions'].sum():,.0f}")


if __name__ == "__main__":
    main()
