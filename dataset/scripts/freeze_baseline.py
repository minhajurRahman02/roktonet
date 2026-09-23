#!/usr/bin/env python3
"""
Stage 6B / B9 — Freeze the SHIPPING forecaster: naive persistence + a calibrated
prediction interval.

    python3 scripts/freeze_baseline.py [--grain district] [--horizon 1|2|4]
    python3 scripts/freeze_baseline.py --all

Reads:  processed/model_features_weekly[_division].csv
Writes: models/forecast_{grain}_h{h}.joblib
        models/forecast_{grain}_h{h}_meta.json
        reports/baseline_coverage_{grain}_h{h}.csv

WHY THE SHIPPED MODEL IS A BASELINE, AND WHY THAT IS THE RESULT RATHER THAN A
GIVING UP
-----------------------------------------------------------------------------
Stage 6B ran 72 walk-forward evaluations: 12 feature-set x target-mode
configurations, at 3 horizons, at 2 grains. Not one beat naive persistence by a
margin that survives a paired test across folds.

The closest was division-weekly, horizon 1, `parsimonious_endo` (7 endogenous
features): MAE 68.827 against naive's 76.065, +9.5%, 6 folds of 10. The original
acceptance bar passed it. A paired Wilcoxon over the folds gives p = 0.322, and
removing the single most influential fold — the August 2023 outbreak peak — cuts
the advantage from +7.24 MAE to +3.46. Six wins in ten is what a coin does 38% of
the time. The bar was too weak; it was tightened to require p < 0.05 and this
configuration then correctly fails.

So the point estimate that ships is `last week's admissions`, unchanged. That is
not a placeholder. It is the estimator that won a rigorous comparison, and
presenting a learned model in its place would mean shipping something measurably
worse because it looks more like machine learning.

WHAT IS ACTUALLY BEING CONTRIBUTED
-----------------------------------
The point estimate is the least important half. Section 7B does not ask "how many
admissions next week"; it asks "will current stock STILL be sufficient by
needed_by_date". That is a question about the upper tail, and it is answered by
the interval, not the centre.

The interval here is calibrated on out-of-fold walk-forward residuals OF THE
NAIVE PREDICTOR ITSELF, per volume tier — never on a training fit, which would be
optimistically narrow, and never on a different model's residuals, which is the
mistake the earlier trainer made when it calibrated on Linear Regression's
residuals while the shipped predictor was something else.

Empirical coverage is then measured against the 80% target and written to the
report. An interval claiming 80% that covers 55% would cause 7B to under-trigger
donor mobilisation, and the failure would surface at a patient's bedside rather
than in a metric.

THE NUMBERS THE SERVICE NEEDS
------------------------------
Each artefact carries, per volume tier: the additive residual quantiles (lo, hi),
measured coverage, and the tier thresholds. At predict time:

    point    = admissions in the most recent complete week
    lower    = max(0, point + lo[tier])
    upper    = point + hi[tier]

There is no feature vector to assemble and no scikit-learn estimator to load,
which also removes the version-pinning risk of unpickling a fitted model on
Render.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import joblib
except ImportError:
    sys.exit("FATAL: pip install joblib")

REPO = Path(__file__).resolve().parents[1]
MODELS = REPO / "models"
REPORTS = REPO / "reports"

INITIAL_TRAIN_WEEKS = 52
FOLD_WEEKS = 13
PI = 0.80
# extra levels, so 7B can pick its risk appetite
LEVELS = (0.50, 0.80, 0.95)


def tier_of(v: float, hi: float, mid: float) -> str:
    return "high" if v >= hi else ("medium" if v >= mid else "low")


def seasonal_predictions(tr: pd.DataFrame, te: pd.DataFrame) -> np.ndarray:
    """Mean admissions for this unit in this week-of-year, from TRAINING data only.

    WHY THIS SECOND PREDICTOR EXISTS — AND IT IS NOT AN EXTRA, IT IS A HOLE
    -----------------------------------------------------------------------
    Naive persistence needs last week's dengue admissions. RoktoNet does not have
    them. The platform observes blood REQUESTS; it has no live feed of DGHS
    admission counts, and the historical series ends where the dataset ends.

    So in production the validated predictor is only usable when the caller can
    supply recent observed admissions. When it cannot, the service must fall back
    to the seasonal expectation for that unit and week of the year — and that is
    a DIFFERENT estimator from the one Stage 6B validated. Shipping it under the
    persistence coverage numbers would be a false claim.

    It is therefore calibrated separately, under the identical walk-forward
    protocol, so the service can report honest interval bounds for whichever path
    it actually took, and label which one that was.
    """
    # MEDIAN, not mean. 2023 is the one major outbreak in four years, and a mean
    # across years is dragged so far up by it that a normal year reads as a
    # demand COLLAPSE — Dhaka's mean profile put the early-October norm at ~3,200
    # admissions/week, so an actual 900 scored as 0.28x "normal". The median is
    # robust to a single extreme year and is what a seasonal norm should mean.
    prof = tr.groupby(["district", "week_of_year"])["admissions"].median()
    fallback = tr.groupby("district")["admissions"].median()
    overall = float(tr["admissions"].median())
    keys = list(zip(te["district"], te["week_of_year"]))
    out = np.array([prof.get(k, np.nan) for k in keys], dtype=float)
    miss = np.isnan(out)
    if miss.any():
        out[miss] = [fallback.get(d, overall)
                     for d in te["district"].values[miss]]
    return np.nan_to_num(out, nan=overall)


def run(grain: str, h: int, predictor: str = "persistence") -> dict:
    feat = REPO / "processed" / (
        "model_features_weekly.csv" if grain == "district"
        else "model_features_weekly_division.csv")
    if not feat.exists():
        sys.exit(
            f"FATAL: {feat} not found. Run build_features_weekly.py --grain {grain}")

    target = f"y_w{h}"
    df = pd.read_csv(feat, parse_dates=["week"])
    df = df[df[target].notna()].copy().reset_index(drop=True)

    n_units = df["district"].nunique()
    scale = 1.0 if grain == "district" else 64.0 / max(n_units, 1)
    t_hi, t_mid = 20.0 * scale, 5.0 * scale
    min_train = 500 if grain == "district" else 60

    if "week_of_year" not in df.columns:
        df["week_of_year"] = df["week"].dt.isocalendar().week.astype(int)

    weeks = np.sort(df["week"].unique())
    oof = []
    for ci in range(INITIAL_TRAIN_WEEKS, len(weeks), FOLD_WEEKS):
        cut = weeks[ci]
        end = weeks[min(ci + FOLD_WEEKS, len(weeks) - 1)]
        tr = df[df["week"] < cut]
        te = df[(df["week"] >= cut) & (df["week"] < end)]
        if len(te) == 0 or len(tr) < min_train:
            continue
        # tiers assigned from TRAINING data only, never the fold being scored
        tmean = tr.groupby("district")["admissions"].mean()
        tiers = {d: tier_of(v, t_hi, t_mid) for d, v in tmean.items()}
        pred = (te["lag_0"].values if predictor == "persistence"
                else seasonal_predictions(tr, te))
        oof.append(pd.DataFrame({
            "week": te["week"].values, "unit": te["district"].values,
            "tier": te["district"].map(tiers).fillna("low").values,
            "y": te[target].values, "pred": pred}))

    if not oof:
        sys.exit(f"FATAL: no usable folds for {grain} h={h}")
    o = pd.concat(oof, ignore_index=True)
    o["resid"] = o["y"] - o["pred"]

    cal, rows = {}, []
    for tn in ("high", "medium", "low"):
        s = o[o["tier"] == tn]
        if s.empty:
            continue
        per_level = {}
        for lv in LEVELS:
            lo = float(s["resid"].quantile((1 - lv) / 2))
            hi = float(s["resid"].quantile(1 - (1 - lv) / 2))
            # coverage is measured with the SAME clipping the service applies,
            # otherwise the reported number is not the one users experience
            lob = np.maximum(0.0, s["pred"] + lo)
            hib = s["pred"] + hi
            cov = float(((s["y"] >= lob) & (s["y"] <= hib)).mean())
            per_level[f"{lv:.2f}"] = {"lo": lo, "hi": hi, "coverage": cov,
                                      "width": hi - lo}
            rows.append({"grain": grain, "horizon_weeks": h, "tier": tn,
                         "level": lv, "lo": round(lo, 3), "hi": round(hi, 3),
                         "width": round(hi - lo, 3), "n": int(len(s)),
                         "empirical_coverage": round(cov, 4),
                         "coverage_error": round(cov - lv, 4)})
        cal[tn] = per_level

    mae = float(np.mean(np.abs(o["resid"])))
    rmse = float(np.sqrt(np.mean(o["resid"] ** 2)))

    MODELS.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    tag = (f"{grain}_h{h}" if predictor == "persistence"
           else f"{grain}_h{h}_seasonal")
    pd.DataFrame(rows).to_csv(
        REPORTS / f"baseline_coverage_{tag}.csv", index=False)

    artefact = {
        "kind": (f"naive_{predictor}_with_calibrated_interval"),
        "predictor": predictor,
        "grain": grain, "horizon_weeks": h,
        "tier_thresholds": {"high": t_hi, "medium": t_mid},
        "interval": cal, "default_level": PI,
        "walkforward": {"mae": mae, "rmse": rmse, "oof_rows": int(len(o))},
    }
    joblib.dump(artefact, MODELS / f"forecast_{tag}.joblib")
    (MODELS / f"forecast_{tag}_meta.json").write_text(
        json.dumps({
            **artefact,
            "predict": {
                "point": ("admissions in the most recent COMPLETE week for the unit"
                          if predictor == "persistence" else
                          "mean admissions for this unit in this week-of-year, "
                          "from history"),
                "lower": "max(0, point + interval[tier][level].lo)",
                "upper": "point + interval[tier][level].hi",
                "tier": "high if mean weekly admissions >= high threshold, "
                        "else medium if >= medium threshold, else low",
            },
            "units": "ADMISSIONS. Convert to bags via conversion_rates.yaml.",
            "why_baseline": "72 walk-forward evaluations; no learned configuration "
                            "beat naive persistence with paired Wilcoxon p < 0.05. "
                            "Closest was division h=1 parsimonious_endo, p=0.322.",
        }, indent=2), encoding="utf-8")

    print(f"  {grain:<8} h={h:<2} {predictor:<11} MAE {mae:8.3f}  RMSE {rmse:8.3f}  "
          f"oof rows {len(o):,}")
    for tn, per in cal.items():
        c = per[f"{PI:.2f}"]
        print(f"      {tn:<7} 80% interval [{c['lo']:+8.2f}, {c['hi']:+8.2f}]  "
              f"width {c['width']:7.2f}  coverage {c['coverage']:.1%}")
    return artefact


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grain", default="district",
                    choices=("district", "division"))
    ap.add_argument("--horizon", type=int, default=2, choices=(1, 2, 4))
    ap.add_argument("--predictor", default="persistence",
                    choices=("persistence", "seasonal"))
    ap.add_argument("--all", action="store_true",
                    help="freeze every grain x horizon x predictor combination")
    args = ap.parse_args()

    print("Freezing naive-persistence forecaster with calibrated intervals\n")
    if args.all:
        for pred in ("persistence", "seasonal"):
            for grain in ("district", "division"):
                for h in (1, 2, 4):
                    run(grain, h, pred)
                print()
    else:
        run(args.grain, args.horizon, args.predictor)
    print(f"\nartefacts: {MODELS}")
    print(f"coverage reports: {REPORTS}/baseline_coverage_*.csv")


if __name__ == "__main__":
    main()
