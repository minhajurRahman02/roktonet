#!/usr/bin/env python3
"""
Stage 6E / E1 — Measure interval coverage PER UNIT, not pooled by volume tier.

    python3 scripts/measure_unit_coverage.py            # measure + patch artefact
    python3 scripts/measure_unit_coverage.py --report-only

Reads:  processed/model_features_weekly[_division].csv
Writes: reports/unit_coverage_{grain}.csv
        ../forecast-service/forecast_model.json   (adds `unit_coverage`, schema 2)

WHY THIS EXISTS — A HEADLINE NUMBER THAT WAS TRUE AND STILL MISLEADING
----------------------------------------------------------------------
freeze_baseline.py calibrates the prediction interval per VOLUME TIER and
reports coverage the same way. Those numbers are correct: 0.800 for the high
tier, 0.804 medium, 0.821 low, against an 0.80 claim. They were the module's
headline accuracy claim.

Building Roktim's curve explorer made the problem visible. Dhaka's seasonal
curve peaks near 3,900 admissions a week, and the high tier's 80% band is 122
admissions wide, so the band rendered as a hairline on the curve. That is not a
drawing bug.

The tier thresholds are absolute: `high` is mean weekly admissions >= 20. That
puts 30 districts in one tier spanning annual totals from 555 to 44,394, an 80x
range, all sharing one additive band. Pooled coverage of 0.800 is then an
average over districts whose individual coverage runs from 1.00 (the small ones,
whose band is wider than their entire signal) down to:

    Dhaka         mean weekly 1219.6     measured coverage 0.411
    Chattogram    mean weekly  153.1     measured coverage 0.573

Dhaka is most of the national dengue signal and the district anyone will look at
first. Reporting 0.80 next to its curve is a true statement about the tier and a
false impression about the district.

WHAT THIS SCRIPT DOES, AND DELIBERATELY DOES NOT DO
----------------------------------------------------
It does NOT recalibrate. The bounds are unchanged, so every existing number and
every decision the service makes is exactly as it was. It only MEASURES what
those bounds actually achieve for each unit and records it in the artefact, so
the UI can show a district's own coverage instead of its tier's.

The fix — proportional residuals, or tiers defined by quantile rather than an
absolute threshold — is a recalibration and belongs to a stage with time to
re-validate it. Measuring and publishing the gap is the honest interim, and is
strictly better than a caveat in prose, because the reader gets the real number
for the district in front of them.

The walk-forward here replicates freeze_baseline.py exactly: same 52-week
initial train, same 13-week folds, same training-only tier assignment, same
median seasonal profile, same max(0, ...) clipping before scoring. If those ever
diverge, the coverage reported here stops describing the shipped bounds.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
REPORTS = REPO / "reports"
ARTEFACT = REPO.parent / "forecast-service" / "forecast_model.json"

INITIAL_TRAIN_WEEKS = 52
FOLD_WEEKS = 13
LEVELS = (0.50, 0.80, 0.95)
HORIZONS = (1, 2, 4)
GRAINS = ("district", "division")
PREDICTORS = ("persistence", "seasonal")

# A unit with only a handful of scored weeks has a coverage figure that is
# mostly noise -- one miss out of 13 moves it by 8 points. Those are still
# written to the CSV, flagged, but the artefact marks them so the UI can decline
# to quote a number it cannot stand behind.
MIN_ROWS_TO_QUOTE = 40


def tier_of(v: float, hi: float, mid: float) -> str:
    return "high" if v >= hi else ("medium" if v >= mid else "low")


def seasonal_predictions(tr: pd.DataFrame, te: pd.DataFrame) -> np.ndarray:
    """Median admissions for this unit and week-of-year, from TRAINING data only.

    Median, not mean, for the reason freeze_baseline.py records: 2023 is the one
    major outbreak in four years and a mean is dragged so far up by it that a
    normal year reads as a demand collapse.
    """
    prof = tr.groupby(["district", "week_of_year"])["admissions"].median()
    fallback = tr.groupby("district")["admissions"].median()
    overall = float(tr["admissions"].median())
    keys = list(zip(te["district"], te["week_of_year"]))
    out = np.array([prof.get(k, np.nan) for k in keys], dtype=float)
    miss = np.isnan(out)
    if miss.any():
        out[miss] = [fallback.get(d, overall) for d in te["district"].values[miss]]
    return np.nan_to_num(out, nan=overall)


def walk_forward(grain: str, h: int, predictor: str) -> pd.DataFrame:
    """Out-of-fold predictions, identical in construction to freeze_baseline.py."""
    feat = REPO / "processed" / (
        "model_features_weekly.csv" if grain == "district"
        else "model_features_weekly_division.csv")
    if not feat.exists():
        sys.exit(f"FATAL: {feat} not found. Run build_features_weekly.py --grain {grain}")

    target = f"y_w{h}"
    df = pd.read_csv(feat, parse_dates=["week"])
    df = df[df[target].notna()].copy().reset_index(drop=True)
    if "week_of_year" not in df.columns:
        df["week_of_year"] = df["week"].dt.isocalendar().week.astype(int)

    n_units = df["district"].nunique()
    scale = 1.0 if grain == "district" else 64.0 / max(n_units, 1)
    t_hi, t_mid = 20.0 * scale, 5.0 * scale
    min_train = 500 if grain == "district" else 60

    weeks = np.sort(df["week"].unique())
    oof = []
    for ci in range(INITIAL_TRAIN_WEEKS, len(weeks), FOLD_WEEKS):
        cut = weeks[ci]
        end = weeks[min(ci + FOLD_WEEKS, len(weeks) - 1)]
        tr = df[df["week"] < cut]
        te = df[(df["week"] >= cut) & (df["week"] < end)]
        if len(te) == 0 or len(tr) < min_train:
            continue
        # Tiers from TRAINING data only, never the fold being scored.
        tmean = tr.groupby("district")["admissions"].mean()
        tiers = {d: tier_of(v, t_hi, t_mid) for d, v in tmean.items()}
        pred = (te["lag_0"].values if predictor == "persistence"
                else seasonal_predictions(tr, te))
        oof.append(pd.DataFrame({
            "unit": te["district"].values,
            "tier": te["district"].map(tiers).fillna("low").values,
            "y": te[target].values,
            "pred": pred,
        }))

    if not oof:
        sys.exit(f"FATAL: no usable folds for {grain} h={h} {predictor}")
    o = pd.concat(oof, ignore_index=True)
    o["resid"] = o["y"] - o["pred"]
    return o


def bounds_from(o: pd.DataFrame) -> dict:
    """The shipped tier bounds, recomputed from the same residuals.

    Recomputed rather than read out of the artefact so that a drift between this
    script and freeze_baseline.py shows up as a mismatch in the verification
    step below, instead of silently producing coverage figures for bounds that
    are not the ones deployed.
    """
    out = {}
    for tn in ("high", "medium", "low"):
        s = o[o["tier"] == tn]
        if s.empty:
            continue
        out[tn] = {f"{lv:.2f}": (float(s["resid"].quantile((1 - lv) / 2)),
                                 float(s["resid"].quantile(1 - (1 - lv) / 2)))
                   for lv in LEVELS}
    return out


def coverage(s: pd.DataFrame, lo: float, hi: float) -> float:
    """Measured with the SAME clipping the service applies at predict time."""
    lob = np.maximum(0.0, s["pred"] + lo)
    hib = s["pred"] + hi
    return float(((s["y"] >= lob) & (s["y"] <= hib)).mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report-only", action="store_true",
                    help="write the CSVs but do not touch forecast_model.json")
    args = ap.parse_args()

    if not ARTEFACT.exists():
        sys.exit(f"FATAL: {ARTEFACT} not found")
    model = json.loads(ARTEFACT.read_text(encoding="utf-8"))

    unit_cov: dict = {}
    rows: list[dict] = []
    mismatches: list[str] = []

    for predictor in PREDICTORS:
        unit_cov[predictor] = {}
        for grain in GRAINS:
            unit_cov[predictor][grain] = {}
            for h in HORIZONS:
                o = walk_forward(grain, h, predictor)
                bnds = bounds_from(o)

                # Verification: these bounds must match the deployed artefact,
                # or the coverage below describes something that is not running.
                for tn, per_level in bnds.items():
                    for lv, (lo, hi) in per_level.items():
                        shipped = (model["intervals"][predictor][grain]
                                   [str(h)][tn][lv])
                        if (abs(shipped["lo"] - lo) > 1e-6
                                or abs(shipped["hi"] - hi) > 1e-6):
                            mismatches.append(
                                f"{predictor}/{grain}/h{h}/{tn}/{lv}: "
                                f"artefact ({shipped['lo']:.3f}, {shipped['hi']:.3f}) "
                                f"!= recomputed ({lo:.3f}, {hi:.3f})")

                per_unit = {}
                for unit, s in o.groupby("unit"):
                    tn = s["tier"].iloc[0]
                    if tn not in bnds:
                        continue
                    entry = {"n": int(len(s)),
                             "mean_actual": round(float(s["y"].mean()), 2),
                             "quotable": bool(len(s) >= MIN_ROWS_TO_QUOTE)}
                    for lv in LEVELS:
                        key = f"{lv:.2f}"
                        lo, hi = bnds[tn][key]
                        c = coverage(s, lo, hi)
                        entry[key] = round(c, 4)
                        rows.append({
                            "predictor": predictor, "grain": grain,
                            "horizon_weeks": h, "unit": unit, "tier": tn,
                            "level": lv, "n": int(len(s)),
                            "mean_actual": round(float(s["y"].mean()), 2),
                            "measured_coverage": round(c, 4),
                            "coverage_error": round(c - lv, 4),
                            "quotable": len(s) >= MIN_ROWS_TO_QUOTE,
                        })
                    per_unit[unit] = entry
                unit_cov[predictor][grain][str(h)] = per_unit

    if mismatches:
        print("FATAL: recomputed bounds do not match the deployed artefact.")
        print("This script's walk-forward has drifted from freeze_baseline.py,")
        print("so any coverage it reports would describe bounds that are not running.")
        for m in mismatches[:10]:
            print("  " + m)
        sys.exit(1)

    REPORTS.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    for grain in GRAINS:
        out = REPORTS / f"unit_coverage_{grain}.csv"
        df[df["grain"] == grain].to_csv(out, index=False)
        print(f"wrote {out.relative_to(REPO)}")

    # The headline comparison, printed because it is the reason this exists.
    focus = df[(df.predictor == "seasonal") & (df.grain == "district")
               & (df.horizon_weeks == 2) & (df.level == 0.80) & df.quotable]
    focus = focus.sort_values("mean_actual", ascending=False)
    print("\nSeasonal path, district, 2 weeks, 80% level")
    print(f"  pooled by tier:  high {model['intervals']['seasonal']['district']['2']['high']['0.80']['coverage']:.3f}")
    print(f"  {'unit':18s} {'mean y':>9s} {'n':>5s} {'coverage':>9s}")
    for _, r in focus.head(6).iterrows():
        print(f"  {r.unit:18s} {r.mean_actual:9.1f} {r.n:5d} {r.measured_coverage:9.3f}")
    print(f"  units quoting below 0.60: "
          f"{int((focus.measured_coverage < 0.60).sum())} of {len(focus)}")

    if args.report_only:
        print("\n--report-only: artefact untouched")
        return

    model["unit_coverage"] = unit_cov
    model["unit_coverage_note"] = (
        "Measured coverage of the SHIPPED tier-pooled interval, broken down per "
        "unit. The bounds are unchanged; this only records what they actually "
        "achieve. Tier thresholds are absolute (high = mean weekly admissions "
        ">= 20), so one tier can span an 80x range of volume and its pooled "
        "coverage is an average across units whose individual coverage differs "
        "sharply. Quote unit_coverage for a named unit; quote the tier figure "
        "only when aggregating. `quotable` is false where too few out-of-fold "
        "weeks exist for the figure to mean anything.")
    model["unit_coverage_min_rows"] = MIN_ROWS_TO_QUOTE
    model["schema_version"] = 2

    before = ARTEFACT.stat().st_size
    ARTEFACT.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
    after = ARTEFACT.stat().st_size
    print(f"\npatched {ARTEFACT.name}: schema_version -> 2, "
          f"{before / 1024:.0f} KB -> {after / 1024:.0f} KB")


if __name__ == "__main__":
    main()
