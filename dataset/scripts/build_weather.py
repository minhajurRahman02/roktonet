#!/usr/bin/env python3
"""
Stage 6B / B10c — Turn the raw NASA POWER JSON into a validated daily table.

    python3 scripts/build_weather.py

Reads:  raw/weather/power_*.json   (64 files, from fetch_weather.py)
        raw/reference/district_centroids.csv
Writes: interim/weather_daily.csv
        reports/weather_quality_report.csv

Runs offline. No network. Safe to run in the cloud workspace.

THE ONE JOB THAT MATTERS: -999
-------------------------------
NASA POWER encodes missing data as -999, which is a perfectly ordinary float. If
it reaches the feature table, a single missing rainfall day drags a 4-week mean
to about -250 mm and the model trains on it in silence. Every -999 is converted
to NaN HERE, in one place, counted per parameter, and written to the quality
report. The build FAILS if the rate on any parameter exceeds MAX_FILL_RATE
rather than quietly shipping a sparse column.

SANITY CHECKS THAT WOULD CATCH A WRONG-COORDINATE BUILD
--------------------------------------------------------
A transposed or mis-mapped lat/lon returns real, plausible-looking weather for
the wrong place, and nothing downstream would notice. Range checks alone do not
help - 25 degC and 8 mm of rain are plausible almost anywhere. So the build also
asserts things that are true of BANGLADESH specifically:

  1. Monsoon dominance. Mean daily rainfall over Jun-Sep must exceed Dec-Feb by
     at least 8x. Bangladesh's actual ratio is far higher; anywhere this fails
     is not Bangladesh, or the dates are misaligned with the values.
  2. Northeast wet anomaly. Sylhet division must be wetter than Rajshahi
     division. This is one of the most pronounced and best-documented rainfall
     gradients in South Asia (Meghalaya orographic uplift), and it is a
     spatial check - it fails if districts were shuffled against coordinates
     even when every individual series is fine.
  3. Temperature seasonality with the right phase: April-May must be warmer than
     December-January. A hemisphere or date-parsing error inverts this.

These are cheap, and each one has a specific failure it exists to catch. Range
checks catch corrupt values; these catch correct values attached to the wrong
place or the wrong day.

NO GAP FILLING
--------------
Consistent with SOURCES.md rule 3. Missing days stay NaN and propagate into the
rolling features, where build_features_weekly.py drops the affected rows. Nothing
is interpolated.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
RAWDIR = REPO / "raw" / "weather"
CENTROIDS = REPO / "raw" / "reference" / "district_centroids.csv"
OUT = REPO / "interim" / "weather_daily.csv"
QREPORT = REPO / "reports" / "weather_quality_report.csv"

FILL = -999.0
MAX_FILL_RATE = 0.02          # 2% per parameter, across the whole table

RENAME = {"PRECTOTCORR": "rain_mm", "T2M": "temp_mean_c",
          "T2M_MAX": "temp_max_c", "RH2M": "humidity_pct"}
VALUE_COLS = list(RENAME.values())

# plausible envelopes for lowland Bangladesh; deliberately wide
BOUNDS = {"rain_mm": (0.0, 800.0), "temp_mean_c": (2.0, 45.0),
          "temp_max_c": (5.0, 50.0), "humidity_pct": (5.0, 100.0)}


def slug(name: str) -> str:
    return name.lower().replace("'", "").replace(" ", "_")


def main() -> None:
    if not CENTROIDS.exists():
        sys.exit(f"FATAL: {CENTROIDS} not found.")
    cen = pd.read_csv(CENTROIDS)
    if len(cen) != 64:
        sys.exit(f"FATAL: expected 64 centroids, got {len(cen)}")

    frames, issues = [], []
    for _, c in cen.iterrows():
        name = c["district"]
        p = RAWDIR / f"power_{slug(name)}.json"
        if not p.exists():
            sys.exit(f"FATAL: {p} missing. Run scripts/fetch_weather.py "
                     f"(on a team machine - the workspace cannot reach NASA POWER).")
        par = json.loads(p.read_text(encoding="utf-8"))["properties"]["parameter"]

        missing = [k for k in RENAME if k not in par]
        if missing:
            sys.exit(f"FATAL: {p.name} has no {', '.join(missing)}. "
                     f"The file is not a complete POWER response.")

        df = pd.DataFrame({RENAME[k]: pd.Series(par[k]) for k in RENAME})
        df.index = pd.to_datetime(df.index, format="%Y%m%d")
        df = df.sort_index()
        df.insert(0, "district", name)
        df.insert(1, "division", c["division"])
        df.index.name = "date"
        frames.append(df.reset_index())

    w = pd.concat(frames, ignore_index=True)

    # ---------------- fill values -> NaN, in exactly one place ----------------
    for col in VALUE_COLS:
        w[col] = pd.to_numeric(w[col], errors="coerce")
        n_fill = int((w[col] <= FILL + 1e-6).sum())
        w.loc[w[col] <= FILL + 1e-6, col] = np.nan
        n_nan = int(w[col].isna().sum())
        rate = n_nan / len(w)
        issues.append({"check": "fill_and_missing", "parameter": col,
                       "fill_values": n_fill, "total_missing": n_nan,
                       "missing_rate": round(rate, 6),
                       "status": "OK" if rate <= MAX_FILL_RATE else "FAIL"})
        if rate > MAX_FILL_RATE:
            sys.exit(f"FATAL: {col} is {rate:.2%} missing, above the "
                     f"{MAX_FILL_RATE:.0%} ceiling. Not usable as a feature.")

    # ---------------- structural checks ----------------
    if w["district"].nunique() != 64:
        sys.exit(f"FATAL: {w['district'].nunique()} districts, expected 64")
    span = pd.date_range(w["date"].min(), w["date"].max(), freq="D")
    per = w.groupby("district")["date"].nunique()
    short = per[per != len(span)]
    if len(short):
        sys.exit(f"FATAL: {len(short)} district(s) have an incomplete daily grid, "
                 f"e.g. {short.index[0]} has {short.iloc[0]} of {len(span)} days.")

    # ---------------- value envelopes ----------------
    for col, (lo, hi) in BOUNDS.items():
        bad = w[(w[col] < lo) | (w[col] > hi)]
        issues.append({"check": "value_range", "parameter": col,
                       "fill_values": "", "total_missing": len(bad),
                       "missing_rate": f"[{lo}, {hi}]",
                       "status": "OK" if bad.empty else "FAIL"})
        if not bad.empty:
            print(bad.head(5).to_string(), file=sys.stderr)
            sys.exit(f"FATAL: {len(bad)} {col} value(s) outside [{lo}, {hi}].")

    # ---------------- Bangladesh-specific sanity ----------------
    w["month"] = w["date"].dt.month
    monsoon = w[w["month"].isin([6, 7, 8, 9])]["rain_mm"].mean()
    dry = w[w["month"].isin([12, 1, 2])]["rain_mm"].mean()
    ratio = monsoon / dry if dry > 0 else float("inf")
    ok1 = ratio >= 8.0
    issues.append({"check": "monsoon_dominance", "parameter": "rain_mm",
                   "fill_values": round(monsoon, 3), "total_missing": round(dry, 3),
                   "missing_rate": f"ratio {ratio:.1f} (need >= 8)",
                   "status": "OK" if ok1 else "FAIL"})

    syl = w[w["division"] == "Sylhet"]["rain_mm"].mean()
    raj = w[w["division"] == "Rajshahi"]["rain_mm"].mean()
    ok2 = syl > raj
    issues.append({"check": "northeast_wet_anomaly", "parameter": "rain_mm",
                   "fill_values": round(syl, 3), "total_missing": round(raj, 3),
                   "missing_rate": f"Sylhet {syl:.2f} vs Rajshahi {raj:.2f}",
                   "status": "OK" if ok2 else "FAIL"})

    hot = w[w["month"].isin([4, 5])]["temp_mean_c"].mean()
    cold = w[w["month"].isin([12, 1])]["temp_mean_c"].mean()
    ok3 = hot > cold + 5
    issues.append({"check": "temperature_phase", "parameter": "temp_mean_c",
                   "fill_values": round(hot, 3), "total_missing": round(cold, 3),
                   "missing_rate": f"Apr-May {hot:.1f} vs Dec-Jan {cold:.1f}",
                   "status": "OK" if ok3 else "FAIL"})

    QREPORT.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(issues).to_csv(QREPORT, index=False)

    if not (ok1 and ok2 and ok3):
        print(pd.DataFrame(issues).to_string(index=False), file=sys.stderr)
        sys.exit("FATAL: a Bangladesh-specific sanity check failed. The most "
                 "likely cause is districts mapped to the wrong coordinates, "
                 "NOT a bad API response. Re-check district_centroids.csv.")

    out = w[["date", "division", "district"] + VALUE_COLS].sort_values(
        ["date", "district"]).reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    print(f"wrote {OUT}  ({len(out):,} rows x {len(out.columns)} cols)")
    print(f"  span      : {out['date'].min().date()} .. {out['date'].max().date()} "
          f"({len(span):,} days)")
    print(f"  districts : {out['district'].nunique()}")
    print()
    print("  missing after -999 -> NaN:")
    for col in VALUE_COLS:
        print(f"    {col:<14} {int(out[col].isna().sum()):>6,}  "
              f"({out[col].isna().mean():.3%})")
    print()
    print("  Bangladesh sanity checks:")
    print(f"    monsoon/dry rainfall ratio   {ratio:>8.1f}   (need >= 8)      PASS")
    print(f"    Sylhet vs Rajshahi rainfall  {syl:>8.2f} vs {raj:.2f} mm/day  PASS")
    print(f"    Apr-May vs Dec-Jan temp      {hot:>8.1f} vs {cold:.1f} degC   PASS")
    print()
    print(f"  quality report: {QREPORT}")
    print("\nNext: python3 scripts/build_features_weekly.py")


if __name__ == "__main__":
    main()
