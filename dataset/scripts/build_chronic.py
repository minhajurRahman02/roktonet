#!/usr/bin/env python3
"""
Stage 6A / A9 — Build the chronic transfusion baseline.

Reads:  conversion_rates.yaml, raw/reference/districts.csv
Writes: interim/chronic_baseline_district.csv

This is the most defensible stream in the dataset: every input is published and
Bangladeshi, and the arithmetic is a chain of cited fractions. It produces a
near-constant floor of demand that does not depend on any seasonal driver.

Chain:
    national_patients
      x transfusion_dependent_fraction      (0.67, Orphanet J Rare Dis 2025)
      x regular_transfusion_fraction        (0.42, same source)
      x bags_per_patient_month              (1-4, same source)
    = national monthly bags

Then distributed across districts by population share.

DISTRIBUTION CAVEAT, stated here and carried into DATASET.md:
    Thalassemia carrier prevalence in Bangladesh is NOT uniform. Published work
    reports significant regional and ethnic variation, including disproportionately
    high E-trait prevalence in some populations. Distributing purely by population
    is therefore known to be wrong in detail. It is used because no district-level
    prevalence table was obtainable. A district prevalence weight is a v1.1 candidate.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parents[1]
RATES = REPO / "conversion_rates.yaml"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
OUT = REPO / "interim" / "chronic_baseline_district.csv"

# BBS 2022 census national total, used as a reconciliation check on districts.csv.
BBS_2022_TOTAL = 165_158_616
POP_TOLERANCE = 0.01  # 1%


def main() -> None:
    if not RATES.exists():
        sys.exit(f"FATAL: {RATES} not found")
    if not DISTRICTS.exists():
        sys.exit(f"FATAL: {DISTRICTS} not found")

    rates = yaml.safe_load(RATES.read_text(encoding="utf-8"))
    ch = rates["chronic"]

    districts = pd.read_csv(DISTRICTS)

    # --- guard: districts.csv must reconcile to the census before we weight by it ---
    if len(districts) != 64:
        sys.exit(f"FATAL: expected 64 districts, got {len(districts)}")
    pop_total = int(districts["population"].sum())
    drift = abs(pop_total / BBS_2022_TOTAL - 1)
    if drift > POP_TOLERANCE:
        sys.exit(
            f"FATAL: district population sum {pop_total:,} drifts {drift:.2%} from "
            f"BBS 2022 census {BBS_2022_TOTAL:,} (tolerance {POP_TOLERANCE:.0%}). "
            "Fix districts.csv before building the baseline."
        )

    def band(key: str) -> tuple[float, float, float]:
        e = ch[key]
        return float(e["low"]), float(e["central"]), float(e["high"])

    pat_lo, pat_ce, pat_hi = band("thalassemia_patients_national")
    dep_lo, dep_ce, dep_hi = band("transfusion_dependent_fraction")
    reg_lo, reg_ce, reg_hi = band("regular_transfusion_fraction")
    bag_lo, bag_ce, bag_hi = band("bags_per_patient_month")
    mult_lo, mult_ce, mult_hi = band("non_thalassemia_chronic_multiplier")

    # Widest-interval convention: low bound uses every low input, high uses every high.
    # This deliberately over-widens rather than under-widens, because the downstream
    # risk check uses the pessimistic bound and must not be falsely confident.
    nat_lo = pat_lo * dep_lo * reg_lo * bag_lo * mult_lo
    nat_ce = pat_ce * dep_ce * reg_ce * bag_ce * mult_ce
    nat_hi = pat_hi * dep_hi * reg_hi * bag_hi * mult_hi

    share = districts["population"] / pop_total
    out = districts.copy()
    out["population_share"] = share.round(6)

    for name, nat in (("low", nat_lo), ("central", nat_ce), ("high", nat_hi)):
        out[f"chronic_bags_month_{name}"] = (share * nat).round(2)
        # 12 months / 365.25 days converts a monthly rate to a daily rate.
        out[f"chronic_bags_day_{name}"] = (share * nat * 12 / 365.25).round(4)

    out = out.sort_values("population", ascending=False).reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    print(f"wrote {OUT}  ({len(out)} districts)")
    print()
    print("National chronic transfusion baseline")
    print(f"  monthly bags : {nat_lo:>10,.0f}  |  {nat_ce:>10,.0f}  |  {nat_hi:>10,.0f}")
    print(f"  annual bags  : {nat_lo*12:>10,.0f}  |  {nat_ce*12:>10,.0f}  |  {nat_hi*12:>10,.0f}")
    print(f"  daily bags   : {nat_lo*12/365.25:>10,.0f}  |  {nat_ce*12/365.25:>10,.0f}  |  {nat_hi*12/365.25:>10,.0f}")
    print("                   (low)          (central)        (high)")
    print()

    anchor = rates["national_anchor"]["annual_requirement_bags"]
    a_lo, a_ce, a_hi = anchor["low"], anchor["central"], anchor["high"]
    print(f"Share of national annual requirement ({a_lo:,}-{a_hi:,} bags):")
    print(f"  low     : {nat_lo*12/a_hi:6.1%}")
    print(f"  central : {nat_ce*12/a_ce:6.1%}")
    print(f"  high    : {nat_hi*12/a_lo:6.1%}")
    print()
    if nat_hi * 12 > a_hi:
        print("  WARNING: high bound alone exceeds the national anchor. A conversion")
        print("           rate is wrong, or the anchor is a severe undercount.")
    print("Top 5 districts by chronic baseline (central, bags/month):")
    print(out.head(5)[["district", "division", "chronic_bags_month_central"]].to_string(index=False))


if __name__ == "__main__":
    main()
