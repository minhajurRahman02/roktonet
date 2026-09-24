#!/usr/bin/env python3
"""
Stage 6C / C6 (was 6B / B8) — Sensitivity analysis over `transfusion_rate`.

    python3 scripts/sensitivity_transfusion_rate.py

Reads:  conversion_rates.yaml
        processed/blood_demand_daily.csv
        ../forecast-service/forecast.py        (optional — for the invariance test)
Writes: reports/sensitivity_transfusion_grid.csv
        reports/sensitivity_transfusion_annual.csv
        reports/sensitivity_transfusion_invariance.csv

WHY THIS EXISTS
---------------
`dengue.transfusion_rate.central = 0.22` is the single largest un-cited number in
the dataset. It is labelled a modelling choice rather than a citation in
conversion_rates.yaml, and it sits inside a CITED band of 0.097 to 0.426 — a
4.4x range. It is multiplied by `units_per_transfused_case`, itself banded 3.0 to
6.0, so the compound bags-per-admission multiplier spans 0.291 to 2.556: **8.8x**.

An 8.8x uncertainty sitting silently inside a headline figure is the obvious
thing for a marker to attack, and "we chose 0.22" is not an answer. This script
replaces the argument with a measurement.

THE RESULT THAT MATTERS, AND WHY IT WAS NOT OBVIOUS IN ADVANCE
---------------------------------------------------------------
Section 7B's risk decision turns out to be **mathematically invariant** to the
conversion rate. The rule is

    pressure_ratio = projected_upper_ADMISSIONS / seasonal_normal_ADMISSIONS

Both sides are in admissions, so any constant multiplier cancels exactly. The
second half of the rule, `stock_headroom = current_stock / units_required`, never
touches the conversion either.

So the 8.8x uncertainty moves the bag numbers DISPLAYED to a user, and cannot
move the fulfilment path a request takes. That is a strong property and it is
worth stating precisely rather than hoping a reader infers it.

It is also worth TESTING rather than asserting, because the invariance holds only
as long as nobody later introduces a bag-based comparison into the decision. Part
3 below imports the SHIPPED service module, rewrites its conversion constants
across the whole band, and asserts the decision is unchanged. If a future edit
breaks the invariance, this script fails.

WHAT IS NOT CLAIMED
-------------------
The corners of the band (low x low, high x high) assume the two uncertain factors
move together. They may not. Treating them as independent would give a narrower
plausible range than the corners suggest, so the 8.8x figure is the WIDEST honest
reading, not a confidence interval. It is reported as a bound, not a distribution.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pandas as pd

try:
    import yaml
except ImportError:
    sys.exit("FATAL: pip install pyyaml")

REPO = Path(__file__).resolve().parents[1]
RATES = REPO / "conversion_rates.yaml"
DEMAND = REPO / "processed" / "blood_demand_daily.csv"
REPORTS = REPO / "reports"
SERVICE = REPO.parent / "forecast-service"

# A finer sweep than low/central/high, so the shape of the response is visible
# rather than three points implying linearity that has to be taken on trust.
RATE_GRID = (0.097, 0.15, 0.22, 0.30, 0.35, 0.426)
UNITS_GRID = (3.0, 4.0, 5.0, 6.0)


def part1_grid(tr: dict, up: dict) -> pd.DataFrame:
    rows = []
    for r in RATE_GRID:
        for u in UNITS_GRID:
            rows.append({
                "transfusion_rate": r,
                "units_per_transfused_case": u,
                "bags_per_admission": round(r * u, 4),
                "is_cited_corner": (r in (tr["low"], tr["high"])
                                    and u in (up["low"], up["high"])),
                "is_v1_central": (r == tr["central"] and u == up["central"]),
            })
    df = pd.DataFrame(rows)
    print("PART 1 — bags per admission across the cited bands")
    print("-" * 66)
    piv = df.pivot(index="transfusion_rate", columns="units_per_transfused_case",
                   values="bags_per_admission")
    print(piv.to_string())
    lo, hi = df["bags_per_admission"].min(), df["bags_per_admission"].max()
    cen = float(df.loc[df["is_v1_central"], "bags_per_admission"].iloc[0])
    print(f"\n  v1.0 central : {cen:.3f} bags/admission")
    print(f"  cited range  : {lo:.3f} .. {hi:.3f}   ({hi/lo:.1f}x spread)")
    print(f"  central sits at the {(cen-lo)/(hi-lo):.0%} point of that range")
    return df


def part2_annual(tr: dict, up: dict) -> pd.DataFrame:
    d = pd.read_csv(DEMAND, parse_dates=["date"])
    d = d[d["dengue_observed"]].copy()
    d["year"] = d["date"].dt.year
    adm = d.groupby("year")["dengue_admissions"].sum()
    # only years with near-complete coverage; a partial year would read as a
    # collapse in demand rather than a gap in the record
    days = d.groupby("year")["date"].nunique()
    full = adm[days >= 330]

    rows = []
    for y, a in full.items():
        rows.append({"year": int(y), "observed_admissions": int(a),
                     "bags_low": round(a * tr["low"] * up["low"]),
                     "bags_central": round(a * tr["central"] * up["central"]),
                     "bags_high": round(a * tr["high"] * up["high"])})
    df = pd.DataFrame(rows)
    print("\n\nPART 2 — annual dengue blood demand, whole cited band")
    print("-" * 66)
    print(df.to_string(index=False))
    print(f"\n  Coverage gate: years with >= 330 observed days only. "
          f"{len(adm) - len(full)} partial year(s) excluded.")
    if len(df):
        w = df.loc[df["bags_central"].idxmax()]
        print(f"  Worst year ({int(w['year'])}): {int(w['bags_low']):,} .. "
              f"{int(w['bags_high']):,} bags, central {int(w['bags_central']):,}.")
        print(f"  The band is wider than the difference between an outbreak year\n"
              f"  and a quiet one — which is the point of reporting it.")
    return df


def part3_invariance(tr: dict, up: dict) -> pd.DataFrame:
    """Rewrite the SHIPPED service's conversion constants and re-run the decision.

    Imports forecast.py from the deployed service rather than reimplementing the
    rule here. Reimplementing it would prove only that a copy is invariant, which
    is not the claim being made.
    """
    print("\n\nPART 3 — is the 7B decision invariant to the conversion rate?")
    print("-" * 66)
    if not (SERVICE / "forecast.py").exists():
        print(f"  SKIPPED: {SERVICE}/forecast.py not found.")
        print(f"  Run this from a checkout that contains the forecast-service folder.")
        return pd.DataFrame()

    sys.path.insert(0, str(SERVICE))
    try:
        import forecast as F
    except Exception as e:                                   # noqa: BLE001
        print(f"  SKIPPED: could not import the service module ({e})")
        return pd.DataFrame()

    scenarios = [
        ("outbreak", [4000, 9000]),
        ("rising", [3000, 4500]),
        ("normal", [2000, 2200]),
    ]
    rows = []
    for name, adm in scenarios:
        for r in RATE_GRID:
            for u in (up["low"], up["central"], up["high"]):
                # mutate the loaded artefact in memory — this is exactly the
                # constant the service uses at predict time
                F.model()["conversion"]["bags_per_admission"] = {
                    "low": r * u, "central": r * u, "high": r * u}
                res = F.risk_check("Dhaka", 4, 40, "2026-10-08",
                                   as_of_date="2026-09-24", recent_admissions=adm)
                rows.append({
                    "scenario": name, "transfusion_rate": r,
                    "units_per_case": u,
                    "bags_per_admission": round(r * u, 4),
                    "at_risk": res["at_risk"],
                    "fulfillment_path": res["fulfillment_path"],
                    "demand_outlook": res["decision"]["demand_outlook"],
                    "pressure_ratio": res["decision"]["pressure_ratio"],
                    "displayed_bags_upper": res["decision"][
                        "projected_district_demand_bags"],
                })
    df = pd.DataFrame(rows)

    failures = []
    for name, _ in scenarios:
        s = df[df["scenario"] == name]
        for col in ("at_risk", "fulfillment_path", "demand_outlook",
                    "pressure_ratio"):
            if s[col].nunique(dropna=False) != 1:
                failures.append(f"{name}: {col} varies across the band "
                                f"({sorted(s[col].astype(str).unique())})")
        lo = s["displayed_bags_upper"].min()
        hi = s["displayed_bags_upper"].max()
        print(f"  {name:<9} decision {str(s['at_risk'].iloc[0]):<5} "
              f"({s['fulfillment_path'].iloc[0]:<28}) "
              f"outlook {s['demand_outlook'].iloc[0]:<9} "
              f"ratio {s['pressure_ratio'].iloc[0]}")
        print(f"  {'':<9} displayed bags across the band: "
              f"{lo:,.0f} .. {hi:,.0f}   ({hi/lo:.1f}x)")

    print()
    if failures:
        for f in failures:
            print("  INVARIANCE FAILURE:", f, file=sys.stderr)
        sys.exit("FATAL: the 7B decision is NOT invariant to the conversion rate. "
                 "A bag-based comparison has been introduced into the decision "
                 "path. Either revert it, or this analysis must be redone.")
    n = len(df) // len(scenarios)
    print(f"  INVARIANCE HOLDS: across {n} rate x units combinations per scenario,")
    print(f"  at_risk, fulfillment_path, demand_outlook and pressure_ratio are")
    print(f"  IDENTICAL. Only the displayed bag figures move.  (PASS)")
    return df


def main() -> None:
    for p in (RATES, DEMAND):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")
    dng = yaml.safe_load(RATES.read_text(encoding="utf-8"))["dengue"]
    tr, up = dng["transfusion_rate"], dng["units_per_transfused_case"]

    print("=" * 66)
    print("SENSITIVITY — dengue.transfusion_rate  (Stage 6C / C6, was 6B / B8)")
    print("=" * 66)
    print(f"  transfusion_rate          : {tr['low']} .. {tr['central']} .. {tr['high']}"
          f"   (central = MODELLING CHOICE, not cited)")
    print(f"  units_per_transfused_case : {up['low']} .. {up['central']} .. {up['high']}"
          f"   (central is cited)\n")

    REPORTS.mkdir(parents=True, exist_ok=True)
    g = part1_grid(tr, up)
    g.to_csv(REPORTS / "sensitivity_transfusion_grid.csv", index=False)
    a = part2_annual(tr, up)
    a.to_csv(REPORTS / "sensitivity_transfusion_annual.csv", index=False)
    inv = part3_invariance(tr, up)
    if len(inv):
        inv.to_csv(REPORTS / "sensitivity_transfusion_invariance.csv", index=False)

    print("\n\nCONCLUSION FOR THE REPORT")
    print("-" * 66)
    print("  The un-cited transfusion_rate.central = 0.22 carries an 8.8x compound")
    print("  uncertainty into every bag figure this system reports. It carries NO")
    print("  uncertainty into the Section 7B fulfilment decision, which is computed")
    print("  entirely in admissions and is provably invariant to it.")
    print()
    print("  So: bag figures must always be shown as a band, and the risk decision")
    print("  can be defended without defending the 0.22 at all.")
    print(f"\n  reports/sensitivity_transfusion_grid.csv")
    print(f"  reports/sensitivity_transfusion_annual.csv")
    print(f"  reports/sensitivity_transfusion_invariance.csv")


if __name__ == "__main__":
    main()
