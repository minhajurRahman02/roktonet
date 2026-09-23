#!/usr/bin/env python3
"""
Stage 6B / B3-B7 — Walk-forward training, evaluation and interval calibration
for the district-WEEKLY dengue forecaster.

    python3 scripts/train_forecast_weekly.py [--horizon 1|2|4]

Reads:  processed/model_features_weekly.csv
Writes: reports/wf_weekly_h{h}.csv       per-fold, per-model metrics
        reports/wf_weekly_tier_h{h}.csv  error by district volume tier
        models/forecast_w{h}.joblib      frozen model + interval calibration
        models/forecast_w{h}_meta.json

WHY WALK-FORWARD
----------------
2023 is the only fully-captured major outbreak in the dataset. A single split
forces a bad choice: 2023 in training leaves no outbreak in any test period, so
the module cannot be shown to do the thing it exists for; 2023 in test leaves one
prior year to learn from and fails for a reason that proves nothing. Walk-forward
trains on everything before time T and scores the next block, rolling forward, so
every period is tested — including the outbreak — while the model only ever sees
its past.

BASELINES ARE THE BAR, NOT A FORMALITY
---------------------------------------
The cited research found Linear Regression beating LSTM and ARIMA on a comparable
blood-shortage task. That argument only stands if the simple model is shown to beat
simpler things still. If LR cannot clear naive persistence, that is the finding and
it gets reported. At district-DAILY grain it could not, and that is exactly why
this script exists at weekly grain — see build_features_weekly.py.

PREDICTION INTERVALS
--------------------
Section 7B needs "will stock still be sufficient by needed_by_date", which is a
question about risk, not a point estimate. The interval is built from EMPIRICAL
residual quantiles computed per volume tier on walk-forward residuals — never on
the training fit, which would be optimistically narrow. Coverage is then measured:
an 80% interval that only covers 55% of outcomes is worse than useless, because
7B would under-trigger donor mobilisation and a patient would find out at surgery.

METRICS
-------
MAE is primary. MAPE is reported ONLY for high-volume districts; tiers are
assigned from TRAINING data in each fold, never from the fold being scored.

FEATURE SETS AND THE ABLATION (--ablate)
-----------------------------------------
The endogenous-only feature set failed, and it failed in a specific way: error
rose MONOTONICALLY as features were added (naive 12.968, lags 13.377,
lags+rolling 15.273, all 22 features 16.480, Ridge at h=1). Every one of those
features is a function of past admissions, so none carried information that "last
week's value" lacks, and the extra parameters fit noise.

Weather is the first input here that is NOT derived from the target. That makes
it a real candidate — and also makes "add 23 more columns" the exact move that
already backfired. So the sets are run side by side rather than the full set
being adopted on the strength of a correlation:

    endogenous    the 22 past-admission features. The result to beat is its own.
    weather_only  weather + population + seasonality, no admission history at all.
                  If this beats naive, the weather signal is real and strong.
    parsimonious  a deliberately small mixed set: one level anchor, one trend,
                  one rainfall window, one temperature lag, seasonality.
                  Given that error rose with feature count, this is the set most
                  likely to win, and it is the one that would be honest to ship.
    endo_rain     endogenous + rainfall lags only, no temperature or humidity.
    all           everything.

The bar is unchanged and is not negotiable: mean walk-forward MAE below the best
naive baseline, and a majority of folds won. A set that wins on average while
losing most folds is winning on one lucky quarter.
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
try:
    import joblib
except ImportError:
    sys.exit("FATAL: pip install joblib")
try:
    from scipy.stats import wilcoxon
except ImportError:                                  # graceful, not fatal
    wilcoxon = None

REPO = Path(__file__).resolve().parents[1]
FEAT = REPO / "processed" / "model_features_weekly.csv"
MODELS = REPO / "models"
REPORTS = REPO / "reports"

INITIAL_TRAIN_WEEKS = 52
FOLD_WEEKS = 13
PI = 0.80                                  # target interval coverage

NON_FEATURES = {"week", "grain", "division", "district", "admissions",
                "y_w1", "y_w2", "y_w4"}
# growth_1_4 and growth_4_8 are ratios of other features, not exact linear
# combinations, so they are safe for the linear models. roll_mean_4 and
# roll_mean_8 are independent. No exact collinearity remains at weekly grain.

# Columns that come from the weather join. Identified by prefix rather than by a
# hardcoded list so that adding a lag in build_features_weekly.py does not
# silently leave it out of every named feature set here.
WEATHER_PREFIXES = ("rain_", "temp_", "temp_max_", "humid_")
SEASONAL = ("month", "woy_sin", "woy_cos", "log_population")
# The parsimonious set, named explicitly. One level anchor (lag_0), one trend
# (growth_1_4), one rainfall window at the literature's lag, one temperature
# lag inside that window, plus seasonality and district scale. Six signals, not
# forty-five.
PARSIMONIOUS = ("lag_0", "growth_1_4", "rain_sum_4_8", "temp_lag_6") + SEASONAL
# The control for PARSIMONIOUS. In the first ablation `parsimonious` beat the
# 22-feature endogenous set, but that comparison changed TWO things at once —
# it added weather AND cut the feature count from 22 to 8 — so it could not say
# which one helped. This set is parsimonious WITHOUT any weather, so the two
# effects separate. Without it, a "weather helped a bit" claim would be
# unsupported by the evidence that appears to support it.
PARSIMONIOUS_ENDO = ("lag_0", "growth_1_4", "roll_mean_4") + SEASONAL


def is_weather(col: str) -> bool:
    return col.startswith(WEATHER_PREFIXES)


def feature_sets(all_feats: list[str]) -> dict[str, list[str]]:
    """Named subsets, each filtered to what actually exists in this build.

    When weather has not been fetched yet the weather-bearing sets collapse to
    duplicates of the endogenous set; they are dropped rather than reported as
    separate results that happen to be identical.
    """
    endo = [c for c in all_feats if not is_weather(c)]
    wx = [c for c in all_feats if is_weather(c)]
    sets = {"endogenous": endo, "all": list(all_feats),
            "parsimonious_endo": [c for c in PARSIMONIOUS_ENDO if c in all_feats]}
    if wx:
        sets["weather_only"] = wx + [c for c in SEASONAL if c in all_feats]
        sets["parsimonious"] = [c for c in PARSIMONIOUS if c in all_feats]
        sets["endo_rain"] = endo + [c for c in wx if c.startswith("rain_")]
    # drop any set that ended up identical to another, and any that is empty
    out, seen = {}, {}
    for name, cols in sets.items():
        key = tuple(sorted(cols))
        if not cols or key in seen:
            continue
        seen[key] = name
        out[name] = cols
    return out


def tier_of(mean_adm: float, hi: float, mid: float) -> str:
    if mean_adm >= hi:
        return "high"
    if mean_adm >= mid:
        return "medium"
    return "low"


def metrics(y, p) -> dict:
    err = np.asarray(p) - np.asarray(y)
    out = {"n": int(len(y)), "mae": float(np.mean(np.abs(err))),
           "rmse": float(np.sqrt(np.mean(err ** 2))), "bias": float(np.mean(err))}
    nz = np.asarray(y) > 0
    out["mape_nonzero"] = (float(np.mean(np.abs(err[nz] / np.asarray(y)[nz])) * 100)
                           if nz.any() else float("nan"))
    return out


def build_folds(df: pd.DataFrame, weeks: np.ndarray, min_train: int) -> list[tuple]:
    """(train, test) index pairs for an expanding window. Computed once and
    reused by every feature set, so the sets are compared on identical data."""
    folds = []
    for i, ci in enumerate(range(INITIAL_TRAIN_WEEKS, len(weeks), FOLD_WEEKS), 1):
        cut = weeks[ci]
        end = weeks[min(ci + FOLD_WEEKS, len(weeks) - 1)]
        tr = df.index[df["week"] < cut]
        te = df.index[(df["week"] >= cut) & (df["week"] < end)]
        if len(te) == 0 or len(tr) < min_train:
            continue
        folds.append((i, cut, tr, te))
    return folds


def run_walkforward(df: pd.DataFrame, features: list[str], target: str,
                    folds: list[tuple], tiers_hi: float, tiers_mid: float,
                    target_mode: str, with_gb: bool) -> tuple:
    """One walk-forward pass.

    target_mode == "level"  fits y directly.
    target_mode == "delta"  fits (y - lag_0) and adds lag_0 back at predict time.

    WHY DELTA MATTERS, AND WHY IT IS NOT A TRICK
    ---------------------------------------------
    Fitting the level forces the model to re-derive persistence from scratch: it
    has to learn "output is approximately lag_0" out of 45 standardised
    features. Worse, Ridge shrinks coefficients toward ZERO, which shrinks the
    prediction toward the training MEAN — away from persistence, not toward it.
    That is why every level-target set lost to naive by more as more features
    were added.

    Fitting the delta inverts that geometry. Persistence is handed over for
    free as the base, and shrinkage now collapses the model TOWARD naive: as
    alpha grows the fitted delta goes to zero and the prediction becomes exactly
    lag_0. So a delta model can only depart from persistence where the data
    actually supports departing. It cannot be much worse, and the comparison
    against naive becomes a fair test of whether there is any residual signal at
    all rather than a test of whether 45 features can reconstruct a copy.
    """
    rows, tier_rows, oof = [], [], []
    for i, cut, tri, tei in folds:
        tr, te = df.loc[tri], df.loc[tei]
        tmean = tr.groupby("district")["admissions"].mean()
        tiers = {d: tier_of(v, tiers_hi, tiers_mid) for d, v in tmean.items()}

        Xtr, ytr = tr[features].values, tr[target].values
        Xte, yte = te[features].values, te[target].values
        base_tr = tr["lag_0"].values
        base_te = te["lag_0"].values

        if target_mode == "delta":
            fit_y = ytr - base_tr
            add = base_te
        else:
            fit_y = ytr
            add = np.zeros(len(te))

        # The naive baselines do NOT depend on the feature set or the target
        # mode. They are recomputed in every pass so each configuration is
        # scored against the same bar in the same table.
        preds = {"naive_last": base_te,
                 "naive_mean_4": te["roll_mean_4"].values}

        lr = make_pipeline(
            StandardScaler(), LinearRegression()).fit(Xtr, fit_y)
        preds["linear_regression"] = np.clip(lr.predict(Xte) + add, 0, None)
        rg = make_pipeline(StandardScaler(), Ridge(alpha=10.0)).fit(Xtr, fit_y)
        preds["ridge"] = np.clip(rg.predict(Xte) + add, 0, None)
        if with_gb:
            # loss="absolute_error" optimises MAE, which is the metric actually
            # reported. Everything else here minimises SQUARED error while being
            # judged on absolute error — a mismatch that hands the outbreak weeks
            # disproportionate influence over the fit, which is precisely where
            # these models were already failing worst.
            gb = HistGradientBoostingRegressor(max_iter=300, random_state=0,
                                               loss="absolute_error").fit(Xtr, fit_y)
            preds["gb_mae"] = np.clip(gb.predict(Xte) + add, 0, None)

        for name, p in preds.items():
            rows.append({"fold": i, "cut": pd.Timestamp(cut).date(), "model": name,
                         "train_rows": len(tr), **metrics(yte, p)})
            for tn in ("high", "medium", "low"):
                m = te["district"].map(tiers).eq(tn).values
                if m.sum():
                    tier_rows.append({"fold": i, "cut": pd.Timestamp(cut).date(),
                                      "model": name, "tier": tn,
                                      **metrics(yte[m], np.asarray(p)[m])})

        learned = [k for k in preds if k not in ("naive_last", "naive_mean_4")]
        best_learned = min(
            learned, key=lambda k: np.mean(np.abs(preds[k] - yte)))
        oof.append(pd.DataFrame({
            "week": te["week"].values, "district": te["district"].values,
            "tier": te["district"].map(tiers).values,
            "y": yte, "pred": preds[best_learned], "model": best_learned}))

    return (pd.DataFrame(rows), pd.DataFrame(tier_rows),
            pd.concat(oof, ignore_index=True))


def summarise(wf: pd.DataFrame) -> dict:
    """Aggregate a walk-forward run and decide, statistically, whether it won.

    WHY A SIGNIFICANCE TEST WAS ADDED AFTER THE FACT
    -------------------------------------------------
    The original bar was "lower mean MAE AND a majority of folds". At
    division grain, horizon 1, parsimonious_endo cleared it: +9.5% and 6/10
    folds, and this script duly printed WINNER.

    It was not a win. A paired Wilcoxon signed-rank test over the ten folds
    gives p = 0.322, and the entire margin rests on one fold — the August 2023
    outbreak peak. Remove that single fold and +7.24 mean MAE advantage falls to
    +3.46. Under a null of "identical to naive", winning 6 of 10 coin flips
    happens 38% of the time.

    So the majority-of-folds rule was too weak to do the job it was there for,
    and it was MY rule. It is replaced rather than kept alongside a caveat,
    because a bar that admits a p=0.32 result would admit the next one too.
    A configuration now has to clear THREE things:

        1. lower mean MAE than the best naive baseline
        2. a majority of folds
        3. paired Wilcoxon p < 0.05 across folds

    `mae_drop_worst` is reported alongside: the mean advantage recomputed with
    the single most influential fold removed. It is not part of the bar, but a
    result whose advantage evaporates when one fold is dropped is a result about
    that fold, and the number makes that visible instead of arguable.
    """
    agg = (wf.groupby("model").agg(mae=("mae", "mean"), rmse=("rmse", "mean"),
                                   bias=("bias", "mean")).sort_values("mae"))
    naive_models = [m for m in (
        "naive_last", "naive_mean_4") if m in agg.index]
    naive = float(agg.loc[naive_models, "mae"].min())
    pf = wf.pivot_table(index="fold", columns="model", values="mae")
    nv = pf[[c for c in naive_models if c in pf]].min(axis=1)
    learned = [c for c in ("linear_regression", "ridge", "gb_mae") if c in pf]
    best = min(learned, key=lambda c: pf[c].mean())
    wins, nfolds = int((pf[best] < nv).sum()), int(len(pf))

    diff = nv - pf[best]                 # positive means the model is better
    pval = float("nan")
    if wilcoxon is not None and nfolds >= 6 and diff.abs().sum() > 0:
        try:
            pval = float(wilcoxon(pf[best], nv).pvalue)
        except ValueError:
            pass
    drop_worst = (float(diff.drop(diff.abs().idxmax()).mean())
                  if nfolds > 1 else float("nan"))

    mae = float(agg.loc[best, "mae"])
    beats = bool(mae < naive and wins * 2 > nfolds
                 and (pval == pval) and pval < 0.05)
    return {"agg": agg, "naive": naive, "best": best, "mae": mae,
            "wins": wins, "nfolds": nfolds, "pval": pval,
            "drop_worst": drop_worst, "beats": beats,
            "rmse": float(agg.loc[best, "rmse"]),
            "naive_rmse": float(agg.loc[naive_models, "rmse"].min())}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=2, choices=(1, 2, 4))
    ap.add_argument("--grain", default="district",
                    choices=("district", "division"))
    ap.add_argument("--target", default="delta", choices=("level", "delta"),
                    help="'delta' fits y - lag_0 and adds persistence back; "
                         "'level' fits y directly (the original formulation)")
    ap.add_argument("--feature-set", default="parsimonious")
    ap.add_argument("--ablate", action="store_true",
                    help="compare every feature set under BOTH target modes and "
                         "STOP without freezing a model")
    args = ap.parse_args()
    h = args.horizon
    target = f"y_w{h}"
    grain = args.grain

    feat = (FEAT if grain == "district"
            else FEAT.with_name(FEAT.stem + "_division" + FEAT.suffix))
    if not feat.exists():
        sys.exit(f"FATAL: {feat} not found. Run:\n"
                 f"  python3 scripts/build_features_weekly.py --grain {grain}")
    df = pd.read_csv(feat, parse_dates=["week"])
    df = df[df[target].notna()].copy().reset_index(drop=True)
    all_feats = [c for c in df.columns if c not in NON_FEATURES]
    sets = feature_sets(all_feats)
    has_weather = any(is_weather(c) for c in all_feats)

    # Tier thresholds are absolute counts, so they cannot be shared across
    # grains: a division carries roughly 8 districts' volume and every unit
    # would land in "high". Scaled by the unit-count ratio, and stated.
    n_units = df["district"].nunique()
    scale = 1.0 if grain == "district" else 64.0 / max(n_units, 1)
    tiers_hi, tiers_mid = 20.0 * scale, 5.0 * scale
    min_train = 500 if grain == "district" else 60

    weeks = np.sort(df["week"].unique())
    folds = build_folds(df, weeks, min_train)
    print(f"grain {grain} ({n_units} units) | horizon {h} week(s) | {len(df):,} rows "
          f"| {len(all_feats)} features | weather: {'YES' if has_weather else 'NO'}")
    print(f"span {pd.Timestamp(weeks[0]).date()} .. {pd.Timestamp(weeks[-1]).date()}"
          f"  | tiers: high>={tiers_hi:.0f}, medium>={tiers_mid:.0f} adm/week")
    print(f"walk-forward: {len(folds)} folds of {FOLD_WEEKS} weeks, "
          f"expanding train from {INITIAL_TRAIN_WEEKS} weeks\n")
    if not folds:
        sys.exit("FATAL: no usable folds.")

    if args.ablate:
        comp = []
        for mode in ("level", "delta"):
            for name, cols in sets.items():
                wf, _, _ = run_walkforward(df, cols, target, folds, tiers_hi,
                                           tiers_mid, mode, with_gb=False)
                r = summarise(wf)
                comp.append({"target": mode, "feature_set": name,
                             "n_features": len(cols), "best_model": r["best"],
                             "mae": round(r["mae"], 3),
                             "naive_mae": round(r["naive"], 3),
                             "vs_naive_pct": round(
                                 (r["naive"] - r["mae"]) / r["naive"] * 100, 1),
                             "folds_won": f"{r['wins']}/{r['nfolds']}",
                             "wilcoxon_p": round(r["pval"], 3),
                             "adv_drop_worst_fold": round(r["drop_worst"], 2),
                             "rmse": round(r["rmse"], 1),
                             "naive_rmse": round(r["naive_rmse"], 1),
                             "beats_naive": "YES" if r["beats"] else "no"})
                print(f"  {mode:<6} {name:<18} {len(cols):>3} feats  "
                      f"MAE {r['mae']:>8.3f}  vs naive {r['naive']:>8.3f}  "
                      f"{(r['naive']-r['mae'])/r['naive']:>+6.1%}  "
                      f"folds {r['wins']}/{r['nfolds']}  p={r['pval']:.3f}")

        cdf = pd.DataFrame(comp).sort_values("mae")
        REPORTS.mkdir(parents=True, exist_ok=True)
        tag = f"{grain}_h{h}"
        cdf.to_csv(REPORTS / f"wf_weekly_ablation_{tag}.csv", index=False)
        print("\n" + "=" * 88)
        print(f"ABLATION — {grain}-weekly, horizon {h} week(s), {len(folds)} folds, "
              f"linear models only")
        print("=" * 88)
        print(cdf.to_string(index=False))
        winners = cdf[cdf["beats_naive"] == "YES"]
        print()
        near = cdf[(cdf["mae"] < cdf["naive_mae"])]
        if winners.empty:
            print("  NO configuration clears naive persistence on all three of:")
            print("  lower mean MAE, a majority of folds, and paired Wilcoxon")
            print("  p < 0.05. Persistence survived even when handed to the model")
            print("  for free by the delta target. That is the finding.")
            if not near.empty:
                b = near.iloc[0]
                print(f"\n  Closest: {b['target']}/{b['feature_set']} — "
                      f"MAE {b['mae']} vs {b['naive_mae']} "
                      f"({b['vs_naive_pct']:+}%), folds {b['folds_won']}, "
                      f"p={b['wilcoxon_p']}.")
                print(f"  Its advantage falls to {b['adv_drop_worst_fold']} MAE with the "
                      f"single most influential fold removed —\n  i.e. the margin is "
                      f"one fold, not a capability.")
        else:
            w = winners.iloc[0]
            print(f"  WINNER: target={w['target']}, set={w['feature_set']} "
                  f"({w['n_features']} feats, {w['best_model']}, "
                  f"{w['vs_naive_pct']:+.1f}% vs naive, folds {w['folds_won']})")
            print(f"\n  Freeze it:  python3 scripts/train_forecast_weekly.py "
                  f"--grain {grain} --horizon {h} --target {w['target']} "
                  f"--feature-set {w['feature_set']}")
        print(f"\n  full table: {REPORTS / f'wf_weekly_ablation_{tag}.csv'}")
        return

    if args.feature_set not in sets:
        sys.exit(f"FATAL: unknown feature set '{args.feature_set}'. "
                 f"Available: {', '.join(sets)}")
    features = sets[args.feature_set]
    print(f"feature set '{args.feature_set}': {len(features)} features | "
          f"target mode: {args.target}\n")

    wf, tf, oof = run_walkforward(df, features, target, folds, tiers_hi,
                                  tiers_mid, args.target, with_gb=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    tag = f"{grain}_h{h}"
    wf.to_csv(REPORTS / f"wf_weekly_{tag}.csv", index=False)
    tf.to_csv(REPORTS / f"wf_weekly_tier_{tag}.csv", index=False)

    r = summarise(wf)
    agg, naive, best_learned = r["agg"], r["naive"], r["best"]
    wins, nfolds = r["wins"], r["nfolds"]
    print("=" * 66)
    print(
        f"WALK-FORWARD — {grain}-weekly, horizon {h} week(s), {nfolds} folds")
    print("=" * 66)
    print(agg.round(3).to_string())

    mae, beat = r["mae"], r["beats"]
    print(
        f"\n  best naive MAE        : {naive:.3f}   (RMSE {r['naive_rmse']:.1f})")
    print(f"  best learned model    : {best_learned}  MAE {mae:.3f}  "
          f"({(naive-mae)/naive:+.1%} vs naive)   (RMSE {r['rmse']:.1f})")
    print(f"  folds won             : {wins}/{nfolds}")
    print(f"  paired Wilcoxon p     : {r['pval']:.3f}   "
          f"({'significant' if r['pval'] < 0.05 else 'NOT significant'} at 0.05)")
    print(f"  advantage w/o worst   : {r['drop_worst']:+.2f} MAE  "
          f"(mean advantage recomputed without the most influential fold)")
    print(
        f"  VERDICT               : {'BEATS naive' if beat else 'does NOT beat naive'}")
    if not beat:
        print("\n  A model that does not beat `last week's value` by a margin that\n"
              "  survives a paired test must not be presented as a forecasting\n"
              "  contribution. Report it, and ship the naive baseline with its\n"
              "  calibrated interval instead.")

    print("\n  MAE by volume tier:")
    print(tf.pivot_table(index="model", columns="tier", values="mae", aggfunc="mean")
            .reindex(columns=["high", "medium", "low"]).round(3).to_string())

    lo_q, hi_q = (1 - PI) / 2, 1 - (1 - PI) / 2
    oof["resid"] = oof["y"] - oof["pred"]
    cal = {}
    print(
        f"\n  {int(PI*100)}% prediction interval, calibrated on out-of-fold residuals:")
    for tn in ("high", "medium", "low"):
        s = oof[oof["tier"] == tn]
        if s.empty:
            continue
        lo, hi = float(s["resid"].quantile(lo_q)), float(
            s["resid"].quantile(hi_q))
        cov = float(((s["y"] >= s["pred"] + lo) &
                    (s["y"] <= s["pred"] + hi)).mean())
        cal[tn] = {"lo": lo, "hi": hi, "coverage": cov, "width": hi - lo}
        print(f"    {tn:<7} lo {lo:>8.2f}  hi {hi:>8.2f}  width {hi-lo:>7.2f}  "
              f"empirical coverage {cov:.1%}")

    X, y = df[features].values, df[target].values
    fit_y = y - df["lag_0"].values if args.target == "delta" else y
    final = make_pipeline(StandardScaler(), LinearRegression()).fit(X, fit_y)
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": final, "features": features, "horizon_weeks": h,
                 "grain": grain, "feature_set": args.feature_set,
                 "target_mode": args.target,
                 "interval": cal,
                 "tier_thresholds": {"high": tiers_hi, "medium": tiers_mid}},
                MODELS / f"forecast_{tag}.joblib")
    (MODELS / f"forecast_{tag}_meta.json").write_text(json.dumps({
        "grain": f"{grain}-week",
        "horizon_weeks": h,
        "target": f"weekly dengue admissions per {grain}",
        "target_mode": args.target,
        "note": ("Predicts ADMISSIONS. Convert to bags via conversion_rates.yaml. "
                 "With target_mode=delta the model output is a CHANGE and lag_0 "
                 "must be added back before use."),
        "feature_set": args.feature_set,
        "uses_weather": bool([c for c in features if is_weather(c)]),
        "trained_rows": int(len(df)),
        "train_span": [str(pd.Timestamp(weeks[0]).date()),
                       str(pd.Timestamp(weeks[-1]).date())],
        "features": features,
        "walkforward": {"folds": nfolds, "best_learned_model": best_learned,
                        "mae": mae, "best_naive_mae": naive,
                        "rmse": r["rmse"], "best_naive_rmse": r["naive_rmse"],
                        "beats_naive": bool(beat),
                        "fold_wins": wins, "folds_total": nfolds,
                        "wilcoxon_p": r["pval"],
                        "advantage_without_worst_fold": r["drop_worst"],
                        "bar": "lower mean MAE AND majority of folds AND "
                               "paired Wilcoxon p < 0.05",
                        "best_model_overall": agg.index[0]},
        "interval": {"level": PI, "method": "empirical out-of-fold residual "
                                            "quantiles, per volume tier",
                     "by_tier": cal},
    }, indent=2), encoding="utf-8")
    print(f"\n  froze {MODELS / f'forecast_{tag}.joblib'}")


if __name__ == "__main__":
    main()
