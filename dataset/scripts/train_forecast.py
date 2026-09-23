#!/usr/bin/env python3
"""
Stage 6B / B3-B5, B7 — Walk-forward training and evaluation of the dengue forecaster.

    python3 scripts/train_forecast.py [--horizon 7]

Reads:  processed/model_features.csv
Writes: reports/model_walkforward_{h}.csv     per-fold, per-model metrics
        reports/model_by_tier_{h}.csv         error broken out by district volume
        models/forecast_lr_h{h}.joblib        the frozen final model
        models/forecast_meta_h{h}.json        what it was trained on, and its residual quantiles

EVALUATION DESIGN — WHY WALK-FORWARD
-------------------------------------
2023 is the only fully-captured major outbreak in the dataset. A single train/test
split forces a bad choice: put 2023 in training and no test period contains an
outbreak, so the module cannot be shown to do the thing it exists for; put it in
test and the model has one prior year to learn from and fails for a reason that
proves nothing.

Walk-forward (expanding window) avoids the trade entirely. Train on everything
before time T, predict the next block, roll T forward, repeat. Every period is
tested — including the outbreak — while the model only ever sees that period's
past. The final shipped model is then refit on all data.

BASELINES ARE NOT A FORMALITY
------------------------------
The cited prior research found simple Linear Regression beating LSTM and ARIMA on a
comparable blood-shortage task. That argument only holds if the simple model is
actually shown to beat simpler things still. Three naive baselines run in every
fold; if Linear Regression cannot clear them, that is the finding and it gets
reported rather than buried.

METRICS
-------
MAE is primary. MAPE is reported ONLY for high-volume districts — 66.9% of
district-days are zero and 17 of 64 districts average under one admission per day,
so percentage error there divides by ~0 and is meaningless. Districts are tiered by
volume computed on TRAINING data only, never on the fold being scored.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

try:
    from sklearn.linear_model import LinearRegression, Ridge
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
except ImportError:
    sys.exit("FATAL: pip install scikit-learn")

# Features that are EXACT linear combinations of others:
#   trend_7_28 = roll_mean_7 - roll_mean_28
#   trend_7_14 = roll_mean_7 - roll_mean_14
# They are useful to a tree model (which would otherwise need many splits to
# express a difference) but make the linear design matrix singular. Left in the
# feature table, excluded from the linear models only.
COLLINEAR = ("trend_7_28", "trend_7_14")


def linear_features(features: list[str]) -> list[str]:
    return [f for f in features if f not in COLLINEAR]
try:
    import joblib
except ImportError:
    sys.exit("FATAL: pip install joblib")

REPO = Path(__file__).resolve().parents[1]
FEAT = REPO / "processed" / "model_features.csv"
MODELS = REPO / "models"
REPORTS = REPO / "reports"

INITIAL_TRAIN_DAYS = 365      # first fold trains on at least a year
FOLD_DAYS = 90                # each fold scores the next quarter
QUANTILES = (0.10, 0.90)      # the 80% prediction interval the 7B risk-check needs

NON_FEATURES = {"date", "division", "district", "dengue_admissions",
                "y_h7", "y_h14", "y_h7_observed", "y_h14_observed"}


def tier_of(mean_adm: float) -> str:
    if mean_adm >= 5:
        return "high"
    if mean_adm >= 1:
        return "medium"
    return "low"


def metrics(y: np.ndarray, p: np.ndarray) -> dict:
    err = p - y
    out = {"n": len(y), "mae": float(np.mean(np.abs(err))),
           "rmse": float(np.sqrt(np.mean(err ** 2))),
           "bias": float(np.mean(err))}
    nz = y > 0
    out["mape_nonzero"] = (float(np.mean(np.abs(err[nz] / y[nz])) * 100)
                           if nz.any() else float("nan"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=7, choices=(7, 14))
    args = ap.parse_args()
    h = args.horizon
    target = f"y_h{h}"

    if not FEAT.exists():
        sys.exit(f"FATAL: {FEAT} not found. Run build_features.py first.")
    df = pd.read_csv(FEAT, parse_dates=["date"])
    df = df[df[target].notna() & df[f"{target}_observed"]].copy()
    if df.empty:
        sys.exit(f"FATAL: no usable rows for {target}")

    features = [c for c in df.columns if c not in NON_FEATURES]
    print(f"horizon {h} days | {len(df):,} usable rows | {len(features)} features")
    print(f"span {df['date'].min().date()} .. {df['date'].max().date()}")

    # ---- fold boundaries ----
    d0, d1 = df["date"].min(), df["date"].max()
    first_cut = d0 + pd.Timedelta(days=INITIAL_TRAIN_DAYS)
    cuts = list(pd.date_range(first_cut, d1, freq=f"{FOLD_DAYS}D"))
    if len(cuts) < 2:
        sys.exit("FATAL: not enough history for walk-forward folds")
    print(f"walk-forward: {len(cuts)} folds of {FOLD_DAYS} days, "
          f"expanding train from {INITIAL_TRAIN_DAYS} days\n")

    rows, tier_rows = [], []
    for i, cut in enumerate(cuts, 1):
        tr = df[df["date"] < cut]
        te = df[(df["date"] >= cut) & (df["date"] < cut + pd.Timedelta(days=FOLD_DAYS))]
        if len(te) == 0 or len(tr) < 1000:
            continue

        # tiers from TRAINING data only
        tmean = tr.groupby("district")["dengue_admissions"].mean()
        tiers = {d: tier_of(v) for d, v in tmean.items()}

        lin = linear_features(features)
        Xtr, ytr = tr[features].values, tr[target].values
        Xte, yte = te[features].values, te[target].values
        Ltr, Lte = tr[lin].values, te[lin].values

        preds = {
            "naive_last":     te["lag_0"].values,
            "naive_mean_7":   te["roll_mean_7"].values,
            "naive_mean_28":  te["roll_mean_28"].values,
        }

        # TARGET IS MODELLED ON RAW COUNTS, NOT log1p — and that was measured,
        # not assumed. A log1p target with expm1 back-transform scored MAE 3.011
        # against 1.616 on raw, because expm1 amplifies log-space error
        # asymmetrically on exactly the high-volume districts that dominate the
        # metric, leaving a -1.100 bias. Raw counts come back essentially
        # unbiased (-0.014). The log transform was a reasonable default for
        # count data and it was wrong here; the diagnostic is kept in the repo
        # history rather than the conclusion being asserted.
        #
        # StandardScaler is REQUIRED, not cosmetic: feature scales span
        # log_population ~16 to lag_0 ~1327, and without it the linear solve is
        # ill-conditioned enough to overflow.
        lr = make_pipeline(StandardScaler(), LinearRegression()).fit(Ltr, ytr)
        preds["linear_regression"] = np.clip(lr.predict(Lte), 0, 1e4)

        rg = make_pipeline(StandardScaler(), Ridge(alpha=10.0)).fit(Ltr, ytr)
        preds["ridge"] = np.clip(rg.predict(Lte), 0, 1e4)

        gb = HistGradientBoostingRegressor(max_iter=200, random_state=0)
        gb.fit(Xtr, ytr)
        preds["gradient_boosting"] = np.clip(gb.predict(Xte), 0, 1e4)

        for name, p in preds.items():
            m = metrics(yte, np.asarray(p, dtype=float))
            rows.append({"fold": i, "cut": cut.date(), "model": name,
                         "train_rows": len(tr), **m})
            for tname in ("high", "medium", "low"):
                mask = te["district"].map(tiers).eq(tname).values
                if mask.sum():
                    mm = metrics(yte[mask], np.asarray(p, dtype=float)[mask])
                    tier_rows.append({"fold": i, "cut": cut.date(), "model": name,
                                      "tier": tname, **mm})

        best = min(preds, key=lambda k: np.mean(np.abs(np.asarray(preds[k]) - yte)))
        print(f"  fold {i:>2}  {cut.date()}  train {len(tr):>6,}  test {len(te):>5,}  "
              f"best: {best}")

    wf = pd.DataFrame(rows)
    tf = pd.DataFrame(tier_rows)
    REPORTS.mkdir(parents=True, exist_ok=True)
    wf.to_csv(REPORTS / f"model_walkforward_{h}.csv", index=False)
    tf.to_csv(REPORTS / f"model_by_tier_{h}.csv", index=False)

    print("\n" + "=" * 62)
    print(f"WALK-FORWARD RESULT, horizon {h} days ({wf['fold'].nunique()} folds)")
    print("=" * 62)
    agg = (wf.groupby("model")
             .agg(mae=("mae", "mean"), rmse=("rmse", "mean"),
                  bias=("bias", "mean"), folds=("fold", "nunique"))
             .sort_values("mae"))
    print(agg.round(3).to_string())

    naive = agg.loc[["naive_last", "naive_mean_7", "naive_mean_28"], "mae"].min()
    winner = agg.index[0]
    lr_mae = agg.loc["linear_regression", "mae"]
    print(f"\n  best naive baseline MAE : {naive:.3f}")
    print(f"  linear regression MAE   : {lr_mae:.3f}  "
          f"({'BEATS' if lr_mae < naive else 'DOES NOT BEAT'} the best naive "
          f"by {abs(naive-lr_mae)/naive:.1%})")
    print(f"  overall best model      : {winner}")

    print("\n  MAE by district volume tier (mean across folds):")
    pt = tf.pivot_table(index="model", columns="tier", values="mae", aggfunc="mean")
    print(pt.reindex(columns=["high", "medium", "low"]).round(3).to_string())
    print("\n  MAPE%% shown for high-volume districts only "
          "(low/medium divide by ~0 and are meaningless):")
    ph = (tf[tf.tier == "high"].pivot_table(index="model", values="mape_nonzero",
                                            aggfunc="mean"))
    print(ph.round(1).to_string())

    # ---- freeze the final model on ALL data, with residual-based intervals ----
    lin = linear_features(features)
    X, y = df[lin].values, df[target].values
    final = make_pipeline(StandardScaler(), LinearRegression()).fit(X, y)
    resid = y - final.predict(X)
    qlo, qhi = np.quantile(resid, QUANTILES[0]), np.quantile(resid, QUANTILES[1])

    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": final, "features": lin,
                 "log1p_target": False, "resid_q": {str(QUANTILES[0]): float(qlo),
                                                   str(QUANTILES[1]): float(qhi)}},
                MODELS / f"forecast_lr_h{h}.joblib")
    (MODELS / f"forecast_meta_h{h}.json").write_text(json.dumps({
        "horizon_days": h,
        "target": "dengue_admissions",
        "note": "Predicts ADMISSIONS. Convert to bags with conversion_rates.yaml.",
        "trained_rows": int(len(df)),
        "train_span": [str(df["date"].min().date()), str(df["date"].max().date())],
        "features": lin,
        "transform": "none on target (raw counts); predictions clipped at 0",
        "interval": {"method": "empirical residual quantiles in count space",
                     "quantiles": list(QUANTILES),
                     "resid_low": float(qlo), "resid_high": float(qhi)},
        "walkforward_mae": float(lr_mae),
        "best_naive_mae": float(naive),
        "best_model_overall": winner,
    }, indent=2), encoding="utf-8")

    print(f"\n  froze {MODELS / f'forecast_lr_h{h}.joblib'}")
    print(f"  meta  {MODELS / f'forecast_meta_h{h}.json'}")
    print(f"  reports: model_walkforward_{h}.csv, model_by_tier_{h}.csv")


if __name__ == "__main__":
    main()
