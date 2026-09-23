#!/usr/bin/env python3
"""
Stage 6C / C1 — Export a single self-contained JSON artefact for the Flask
forecast service.

    python3 scripts/export_forecast_model.py [--out ../forecast-service/forecast_model.json]

Reads:  models/forecast_{grain}_h{h}[_seasonal]_meta.json   (freeze_baseline.py)
        processed/model_features_weekly[_division].csv
        conversion_rates.yaml
Writes: forecast_model.json                                 (one bundled file)

WHY A SEPARATE EXPORT, AND WHY JSON RATHER THAN THE .joblib
------------------------------------------------------------
Render deploys a service from a single root directory, so the service cannot read
`dataset/models/` at runtime. The artefact has to live inside the service folder,
which means a copy — and a copy made by hand is a copy that silently goes stale.
This script is that copy, scripted and re-runnable, and it records the source
dataset version in the bundle so a stale one is detectable rather than invisible.

JSON rather than the .joblib because the artefact is already a plain dict of
numbers. Loading it as JSON means the service needs NO numpy, NO scikit-learn and
NO joblib — only Flask. On Render's free tier that materially cuts cold-start
time, which the deployment notes flag as the known pain point (30-60s), and it
removes the version-pinning risk of unpickling a fitted estimator against a
different library version than the one that wrote it.

The .joblib artefacts stay in dataset/models/ as the record. This is the
deployable.

WHAT GOES IN, AND WHY EACH PIECE IS NEEDED
-------------------------------------------
  intervals   per predictor x grain x horizon x tier x level: the additive
              residual bounds and their MEASURED coverage.
  tiers       each unit's volume tier, plus the thresholds, so the service
              assigns the same tier the calibration assumed.
  seasonal    mean admissions per (unit, week-of-year). This is the fallback
              POINT estimate when the caller cannot supply recent observed
              admissions — see the honesty note below.
  units       district -> division map, for the regional endpoint.
  conversion  the dengue admissions -> blood bags band, carried verbatim from
              conversion_rates.yaml including the low/high bounds, so the
              service can expose the sensitivity range rather than a single
              number whose provenance is invisible at the API boundary.

THE HONESTY NOTE THAT MUST SURVIVE INTO THE SERVICE
----------------------------------------------------
Stage 6B validated NAIVE PERSISTENCE: predict last week's dengue admissions.
RoktoNet has no live feed of dengue admissions — it observes blood requests. So
the validated predictor is only usable when the caller supplies recent observed
admissions. Otherwise the service must use the seasonal expectation, which is a
DIFFERENT estimator with materially worse error (district, 2-week horizon:
MAE 49.9 against persistence's 19.9).

Both are calibrated separately under the identical walk-forward protocol, both
carry their own measured coverage, and every response states which one it used.
Reporting the seasonal path under the persistence numbers would be a false claim
about accuracy, so the bundle keeps them strictly separate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

try:
    import yaml
except ImportError:
    sys.exit("FATAL: pip install pyyaml")

REPO = Path(__file__).resolve().parents[1]
MODELS = REPO / "models"
RATES = REPO / "conversion_rates.yaml"
DEFAULT_OUT = REPO.parent / "forecast-service" / "forecast_model.json"

GRAINS = ("district", "division")
HORIZONS = (1, 2, 4)
PREDICTORS = ("persistence", "seasonal")


def load_meta(grain: str, h: int, predictor: str) -> dict:
    tag = f"{grain}_h{h}" + ("" if predictor == "persistence" else "_seasonal")
    p = MODELS / f"forecast_{tag}_meta.json"
    if not p.exists():
        sys.exit(f"FATAL: {p} not found. Run:\n"
                 f"  python3 scripts/freeze_baseline.py --all")
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    bundle: dict = {
        "schema_version": 1,
        "generated": str(date.today()),
        "source": "RoktoNet dataset v1.0 — dengue admissions, DGHS daily reports",
        "units_of_measure": "ADMISSIONS (not bags). Apply `conversion` for bags.",
        "intervals": {}, "tiers": {}, "seasonal": {}, "unit_division": {},
        "diagnostics": {},
    }

    for predictor in PREDICTORS:
        bundle["intervals"][predictor] = {}
        bundle["diagnostics"][predictor] = {}
        for grain in GRAINS:
            bundle["intervals"][predictor][grain] = {}
            bundle["diagnostics"][predictor][grain] = {}
            for h in HORIZONS:
                m = load_meta(grain, h, predictor)
                bundle["intervals"][predictor][grain][str(h)] = m["interval"]
                bundle["diagnostics"][predictor][grain][str(h)] = {
                    "walkforward_mae": m["walkforward"]["mae"],
                    "walkforward_rmse": m["walkforward"]["rmse"],
                    "oof_rows": m["walkforward"]["oof_rows"],
                }
                bundle.setdefault("tier_thresholds", {})[grain] = m["tier_thresholds"]

    # --- per-unit tiers and seasonal profile, from the same feature tables ---
    for grain in GRAINS:
        feat = REPO / "processed" / (
            "model_features_weekly.csv" if grain == "district"
            else "model_features_weekly_division.csv")
        if not feat.exists():
            sys.exit(f"FATAL: {feat} not found.")
        df = pd.read_csv(feat, parse_dates=["week"])
        df["week_of_year"] = df["week"].dt.isocalendar().week.astype(int)

        th = bundle["tier_thresholds"][grain]
        mean_adm = df.groupby("district")["admissions"].mean()
        bundle["tiers"][grain] = {
            u: ("high" if v >= th["high"] else
                "medium" if v >= th["medium"] else "low")
            for u, v in mean_adm.items()}

        # MEDIAN — must match seasonal_predictions() in freeze_baseline.py, or
        # the service would serve a point estimate the calibration never saw.
        prof = (df.groupby(["district", "week_of_year"])["admissions"]
                  .median().round(2))
        seas: dict = {}
        for (u, w), v in prof.items():
            seas.setdefault(u, {})[str(int(w))] = float(v)
        bundle["seasonal"][grain] = seas

        if grain == "district":
            bundle["unit_division"] = (df.drop_duplicates("district")
                                       .set_index("district")["division"].to_dict())
            bundle["data_span"] = [str(df["week"].min().date()),
                                   str(df["week"].max().date())]

    # --- conversion band, carried verbatim rather than collapsed to one number ---
    rates = yaml.safe_load(RATES.read_text(encoding="utf-8"))
    dng = rates["dengue"]
    tr, up = dng["transfusion_rate"], dng["units_per_transfused_case"]
    bundle["conversion"] = {
        "driver": "dengue_admissions",
        "component": dng.get("component"),
        "transfusion_rate": {k: tr[k] for k in ("low", "central", "high")},
        "units_per_transfused_case": {k: up[k] for k in ("low", "central", "high")
                                      if k in up},
        "bags_per_admission": {
            b: round(tr[b] * up.get(b, up.get("central")), 5)
            for b in ("low", "central", "high")},
        "warning": ("transfusion_rate.central is a MODELLING CHOICE, not a "
                    "citation. The low/high bounds are cited and span a 4.4x "
                    "range. Any bag figure from this service must be read as a "
                    "band, never a point."),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(bundle, indent=1, sort_keys=True)
    args.out.write_text(payload, encoding="utf-8")

    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    print(f"wrote {args.out}  ({len(payload)/1024:.0f} KB)")
    print(f"  sha256      : {digest}")
    print(f"  predictors  : {', '.join(PREDICTORS)}")
    print(f"  grains      : {', '.join(GRAINS)}   horizons: {HORIZONS}")
    print(f"  units       : {len(bundle['tiers']['district'])} districts, "
          f"{len(bundle['tiers']['division'])} divisions")
    print(f"  data span   : {bundle['data_span'][0]} .. {bundle['data_span'][1]}")
    print(f"  bags/admission (central): "
          f"{bundle['conversion']['bags_per_admission']['central']}")
    print(f"  band        : {bundle['conversion']['bags_per_admission']['low']} .. "
          f"{bundle['conversion']['bags_per_admission']['high']}")


if __name__ == "__main__":
    main()
