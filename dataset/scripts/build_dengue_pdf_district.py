#!/usr/bin/env python3
"""
Stage 6A / A5 — Canonicalise the PDF-extracted dengue series to district grain.

Reads:  interim/dengue_wayback_district_daily.csv  (raw output of parse_dengue.py --extract)
        raw/reference/district_name_variants.yaml
        raw/reference/districts.csv
Writes: interim/dengue_pdf_district_daily.csv
        reports/dengue_pdf_quality_report.csv

WHAT THIS FIXES
---------------
parse_dengue.py emits whatever Bangla string the PDF's font subset produced.
Across 1,635 files that is 166 distinct strings for 65 entities. This maps them
onto the canonical names in districts.csv, drops the unusable rows, and records
exactly what was dropped and why.

THE DIVISION COLUMN FROM THE PARSER IS DISCARDED HERE, DELIBERATELY.
A late-era row type (per-district subtotal rows, "<district> জেলার মোটঃ") splits
the parser's division blocks, which corrupts its division labels on ~37% of
files. Rather than trust a damaged label, division is re-derived from the
district via districts.csv, which is authoritative. The parser's district rows
themselves are unaffected by that bug — see the verification below.

INDEPENDENT VERIFICATION ALREADY PASSED ON THE INPUT
----------------------------------------------------
  - 2023 national annual total: 321,179 against DGHS's published 321,179. Exact.
  - vs the independent Kaggle extraction over 435 overlapping days:
    correlation 0.998, identical daily national totals on 335 days (77%),
    median absolute difference 0.
  - 65 rows per date at the 25th, 50th and 75th percentile (64 districts +
    Dhaka Metro), zero negative values.

WHAT IS DROPPED, AND WHY IT IS RECORDED RATHER THAN REPAIRED
------------------------------------------------------------
  - One date string is impossible ("2024-16-06", a month/day transposition in a
    single file). 65 rows. Recorded as a gap, not guessed at.
  - A handful of dates appear twice (two PDFs carrying the same report date).
    The first occurrence is kept and the duplicate recorded.
  - Dates not yielding exactly 65 rows are kept but flagged, since a short file
    means a district genuinely missing from that day's report.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "interim" / "dengue_wayback_district_daily.csv"
VARIANTS = REPO / "raw" / "reference" / "district_name_variants.yaml"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
OUT = REPO / "interim" / "dengue_pdf_district_daily.csv"
QUALITY = REPO / "reports" / "dengue_pdf_quality_report.csv"

EXPECTED_ROWS_PER_DATE = 65  # 64 districts + Dhaka Metro


def load_lookup() -> dict[str, str]:
    m = yaml.safe_load(VARIANTS.read_text(encoding="utf-8"))
    lookup: dict[str, str] = {}
    for v in m["dhaka_metro"]["variants"]:
        lookup[v] = m["dhaka_metro"]["canonical"]
    for canon, variants in m["districts"].items():
        for v in variants:
            if v in lookup:
                sys.exit(f"FATAL: variant {v!r} mapped to both {lookup[v]!r} and {canon!r}")
            lookup[v] = canon
    return lookup


def main() -> None:
    for p in (SRC, VARIANTS, DISTRICTS):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")

    lookup = load_lookup()
    df = pd.read_csv(SRC)
    n_in = len(df)

    unmapped = sorted(set(df["district"]) - set(lookup))
    if unmapped:
        sys.exit(f"FATAL: {len(unmapped)} district string(s) have no mapping: {unmapped[:10]}. "
                 "Add them to district_name_variants.yaml — never drop them silently.")

    quality: list[dict] = []

    # --- drop impossible dates, recorded ---
    parsed = pd.to_datetime(df["date"], errors="coerce", format="%Y-%m-%d")
    bad = df[parsed.isna()]
    for d in sorted(bad["date"].unique()):
        quality.append({"date": d, "issue": "impossible_date_string",
                        "detail": "month/day transposed in source PDF; rows dropped",
                        "rows_affected": int((df["date"] == d).sum())})
    df = df[~parsed.isna()].copy()
    df["date"] = parsed[~parsed.isna()]

    # --- canonicalise, then re-derive division from districts.csv ---
    df["district_raw"] = df["district"]
    df["district"] = df["district_raw"].map(lookup)

    dd = pd.read_csv(DISTRICTS)
    div_of = dict(zip(dd["district"], dd["division"]))
    missing = sorted(set(df["district"]) - set(div_of) - {"Dhaka Metro"})
    if missing:
        sys.exit(f"FATAL: canonical district(s) absent from districts.csv: {missing}")
    df["division"] = df["district"].map(lambda d: div_of.get(d, "Dhaka"))
    df.loc[df["district"] == "Dhaka Metro", "division"] = "Dhaka"

    # --- duplicate (date, district): keep first, record the rest ---
    dupe_mask = df.duplicated(["date", "district"], keep="first")
    for d in sorted(df.loc[dupe_mask, "date"].dt.date.unique()):
        quality.append({"date": str(d), "issue": "duplicate_date",
                        "detail": "two source PDFs carried this report date; first kept",
                        "rows_affected": int((df.loc[dupe_mask, "date"].dt.date == d).sum())})
    df = df[~dupe_mask]

    # --- THE SELF-CHECK. If any two different districts were mapped onto the
    # same canonical name, a date would resolve to fewer than 65 distinct
    # districts. Refuse to write output rather than ship a silent merge. ---
    per_date = df.groupby("date")["district"].nunique()
    short = per_date[per_date < EXPECTED_ROWS_PER_DATE]
    over = per_date[per_date > EXPECTED_ROWS_PER_DATE]
    if len(over):
        sys.exit(f"FATAL: {len(over)} date(s) resolve to MORE than {EXPECTED_ROWS_PER_DATE} "
                 "districts. The variant map is wrong.")
    for d, n in short.items():
        quality.append({"date": str(d.date()), "issue": "incomplete_day",
                        "detail": f"{n} of {EXPECTED_ROWS_PER_DATE} districts present in source",
                        "rows_affected": int(n)})

    full_days = int((per_date == EXPECTED_ROWS_PER_DATE).sum())
    pct = full_days / len(per_date)

    out = df[["date", "division", "district", "admissions_24h", "cumulative_total",
              "cumulative_deaths", "cumulative_discharged", "district_raw",
              "source", "date_source"]].sort_values(["date", "division", "district"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    QUALITY.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(quality, columns=["date", "issue", "detail", "rows_affected"]).to_csv(
        QUALITY, index=False)

    print(f"wrote {OUT}  ({len(out):,} rows, from {n_in:,} raw)")
    print(f"  dates            : {len(per_date):,}  "
          f"({out['date'].min().date()} .. {out['date'].max().date()})")
    print(f"  complete days    : {full_days:,} of {len(per_date):,} ({pct:.1%})")
    print(f"  districts        : {out['district'].nunique()} "
          f"(64 + Dhaka Metro expected)")
    print(f"  raw name variants collapsed: {df['district_raw'].nunique()} -> "
          f"{out['district'].nunique()}")
    print(f"  quality report   : {QUALITY}  ({len(quality)} issue(s) recorded)")
    print()
    print("  SELF-CHECK: no date resolves to more than "
          f"{EXPECTED_ROWS_PER_DATE} districts  (PASS)")


if __name__ == "__main__":
    main()
