"""
RoktoNet forecast service — the pure logic, with no Flask in it.

Kept separate from app.py for the same reason `engine.py` is separate from the
optimization engine's `app.py`: the decision rules are testable without standing
up an HTTP server, and the transport layer holds no business logic.

WHAT THIS SERVICE DOES, STATED WITHOUT INFLATION
-------------------------------------------------
It projects district-level dengue-driven blood demand over a 1, 2 or 4 week
horizon and returns a PREDICTION INTERVAL, then answers one question for Section
7B: will current stock still be sufficient by needed_by_date?

The point estimate is naive persistence — last week's admissions. That is not a
placeholder awaiting a real model. Stage 6B ran 72 walk-forward evaluations
across 12 feature-set/target configurations, 3 horizons and 2 grains, including
acquired NASA POWER rainfall and temperature at the 4-8 week lags the dengue
literature points at. Nothing beat persistence by a margin surviving a paired
Wilcoxon test across folds. Persistence won the comparison, so persistence ships.

The contribution is the interval, not the centre. 7B does not ask "how many
admissions next week"; it asks whether stock will hold. That is a question about
the upper tail. The interval is calibrated on out-of-fold walk-forward residuals
per volume tier, and its measured coverage is within 1 percentage point of
nominal at every tier, level, horizon and grain.

THE LIMITATION THAT MUST NOT BE HIDDEN BEHIND THE API
------------------------------------------------------
Persistence needs last week's dengue admissions. RoktoNet does not have them: it
observes blood requests, not DGHS admission counts, and the historical series
ends where the dataset ends.

So there are two paths, and they are NOT equivalent:

  observed_recent      the caller supplied recent admissions. This is the
                       validated estimator. District, 2-week horizon: MAE 19.9.
  seasonal_historical  no admissions supplied, so the service falls back to the
                       mean for that unit and week-of-year. A DIFFERENT
                       estimator, 2.5x worse. District, 2-week: MAE 49.9.

Each path carries its own separately-calibrated interval, and every response
states which was used in `basis`, with its measured coverage. Serving the
fallback under the validated path's accuracy numbers would be a false claim, so
the two never share a calibration.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

MODEL_PATH = Path(__file__).with_name("forecast_model.json")

HORIZONS = (1, 2, 4)
LEVELS = ("0.50", "0.80", "0.95")
DEFAULT_LEVEL = "0.80"

# Section 7B's risk rule, fixed here rather than in the Node backend so the
# clinical-risk decision lives next to the calibration that justifies it.
# A request is at risk if demand at the 80% UPPER bound would leave stock short.
# ~10% of outcomes exceed that bound, so roughly one genuine shortfall in ten
# still passes through to Check 1 alone. That is a deliberate, stated trade
# against flagging requests that would have been fine: the 95% bound is far
# wider (district, 2-week, high tier: +99 admissions against +16) and would
# trigger donor mobilisation constantly.
RISK_LEVEL = "0.80"

# --- the demand-pressure thresholds, and why an absolute comparison was dropped
#
# The original 7B sketch compared projected demand against current stock in
# units. Implementation showed that cannot work: projected DISTRICT-WIDE dengue
# demand for Dhaka over two weeks is ~3,350 bags, against a hospital holding tens
# of units. Every request returns at_risk, so the check carries no information.
# The mismatch is real, not a bug — district-wide dengue demand is not served out
# of one organisation's RoktoNet inventory, so the two quantities are not
# comparable and no threshold on their difference would make them so.
#
# What IS supportable from the data is a RELATIVE signal: is this district
# heading into a period of demand above its own seasonal norm? That was checked
# against history before being adopted, and it discriminates:
#
#     weeks exceeding 1.75x the seasonal norm, by year
#       2022:   4 / 1894   (0.2%)
#       2023: 927 / 2064   (44.9%)   <- the outbreak year
#       2024: 121 / 1289   (9.4%)
#       2025: 241 / 1291   (18.7%)
#
# Thresholds are set at the 75th and 90th percentiles of the historical
# actual/seasonal-normal ratio (1.38 and 3.00), rounded.
PRESSURE_ELEVATED = 1.4      # ~top quartile of historical demand-vs-norm
PRESSURE_HIGH = 3.0          # ~top decile

# POLICY CONSTANT, not derived from data. Marked as such for the same reason
# transfusion_rate.central is marked in conversion_rates.yaml: it is a choice the
# team made, and burying it would make it look like a measurement. It means
# "stock covers this request at least twice over". Change it deliberately.
HEADROOM_MIN = 2.0


class ModelError(RuntimeError):
    pass


_MODEL: dict | None = None


def model() -> dict:
    global _MODEL
    if _MODEL is None:
        if not MODEL_PATH.exists():
            raise ModelError(
                f"{MODEL_PATH.name} is missing. Regenerate it from the dataset repo: "
                f"python3 scripts/export_forecast_model.py")
        _MODEL = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    return _MODEL


def snap_horizon(days: int) -> int:
    """Map days-until-needed onto the horizons the model was calibrated at.

    Rounds UP, never down. A 3-week wait scored against a 2-week interval would
    understate the demand that can accumulate, and the direction of that error
    is a missed shortfall rather than an unnecessary donor call.
    """
    weeks = max(1, -(-max(days, 0) // 7))
    for h in HORIZONS:
        if weeks <= h:
            return h
    return HORIZONS[-1]


def tier_for(unit: str, grain: str) -> str:
    return model()["tiers"][grain].get(unit, "low")


def _bounds(predictor: str, grain: str, h: int, tier: str, level: str) -> dict:
    try:
        return model()["intervals"][predictor][grain][str(h)][tier][level]
    except KeyError as e:
        raise ModelError(f"no calibration for {predictor}/{grain}/h{h}/{tier}/{level}") from e


def seasonal_point(unit: str, grain: str, when: date) -> float | None:
    woy = str(when.isocalendar()[1])
    prof = model()["seasonal"][grain].get(unit)
    if not prof:
        return None
    if woy in prof:
        return float(prof[woy])
    return sum(prof.values()) / len(prof) if prof else None


def admissions_to_bags(adm: float) -> dict:
    """Convert admissions to blood bags across the CITED band, never one number.

    transfusion_rate.central is the single largest un-cited modelling choice in
    the dataset and it sits inside a cited 0.097-0.426 band, so the central
    figure is returned alongside low and high rather than alone. A caller that
    displays only the central value is choosing to hide a 4.4x uncertainty; the
    API will not make that choice on their behalf.
    """
    bp = model()["conversion"]["bags_per_admission"]
    return {k: round(max(0.0, adm) * v, 2) for k, v in bp.items()}


def forecast_unit(unit: str, grain: str, horizon_weeks: int,
                  recent_admissions: list[float] | None = None,
                  as_of: date | None = None,
                  level: str = DEFAULT_LEVEL) -> dict:
    """Point estimate plus interval for one unit, stating which path it took."""
    m = model()
    as_of = as_of or date.today()
    if unit not in m["tiers"][grain]:
        raise ModelError(f"unknown {grain} '{unit}'")
    if level not in LEVELS:
        raise ModelError(f"level must be one of {', '.join(LEVELS)}")
    if horizon_weeks not in HORIZONS:
        raise ModelError(f"horizon_weeks must be one of {HORIZONS}")

    if recent_admissions:
        # Persistence uses the most recent COMPLETE week, which is the last
        # element by the documented ordering (oldest first).
        point = float(recent_admissions[-1])
        predictor, basis = "persistence", "observed_recent"
    else:
        sp = seasonal_point(unit, grain, as_of)
        if sp is None:
            raise ModelError(f"no seasonal profile for {unit}")
        point, predictor, basis = float(sp), "seasonal", "seasonal_historical"

    tier = tier_for(unit, grain)
    b = _bounds(predictor, grain, horizon_weeks, tier, level)
    lower = max(0.0, point + b["lo"])
    upper = point + b["hi"]
    diag = m["diagnostics"][predictor][grain][str(horizon_weeks)]

    return {
        "unit": unit, "grain": grain, "horizon_weeks": horizon_weeks,
        "basis": basis, "predictor": predictor, "tier": tier,
        "admissions": {"point": round(point, 2),
                       "lower": round(lower, 2), "upper": round(upper, 2)},
        "bags": {"point": admissions_to_bags(point),
                 "lower": admissions_to_bags(lower),
                 "upper": admissions_to_bags(upper)},
        "interval": {"level": float(level),
                     "measured_coverage": b["coverage"],
                     "residual_bounds": {"lo": b["lo"], "hi": b["hi"]}},
        "accuracy": {"walkforward_mae": diag["walkforward_mae"],
                     "walkforward_rmse": diag["walkforward_rmse"],
                     "note": ("MAE of THIS path's estimator, measured out-of-fold. "
                              "The seasonal path is materially worse than the "
                              "observed path; they are not interchangeable.")},
    }


def risk_check(district: str, units_required: float, current_stock_units: float,
               needed_by_date: str, as_of_date: str | None = None,
               recent_admissions: list[float] | None = None,
               stock_scope: str = "district") -> dict:
    """Section 7B Check 2. Runs only after Check 1 (current-stock feasibility).

    Check 1 already established that stock is sufficient RIGHT NOW. This asks
    whether it still will be on needed_by_date, given demand expected to draw on
    the same pool in between.
    """
    try:
        nb = datetime.strptime(needed_by_date, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ModelError("needed_by_date must be YYYY-MM-DD")
    ao = (datetime.strptime(as_of_date, "%Y-%m-%d").date()
          if as_of_date else date.today())
    if nb < ao:
        raise ModelError("needed_by_date is in the past relative to as_of_date")

    days = (nb - ao).days
    h = snap_horizon(days)
    f = forecast_unit(district, "district", h,
                      recent_admissions=recent_admissions, as_of=ao,
                      level=RISK_LEVEL)

    # Demand pressure: projected upper bound against this district's own
    # seasonal norm for the week the blood is actually needed.
    normal = seasonal_point(district, "district", nb) or 0.0
    projected_upper = f["admissions"]["upper"]
    headroom = (current_stock_units / units_required) if units_required > 0 else float("inf")

    if f["basis"] == "observed_recent" and normal >= 1.0:
        ratio = projected_upper / normal
        outlook = ("high" if ratio >= PRESSURE_HIGH else
                   "elevated" if ratio >= PRESSURE_ELEVATED else "normal")
        at_risk = (outlook == "high"
                   or (outlook == "elevated" and headroom < HEADROOM_MIN))
        rule = (f"demand outlook from the {float(RISK_LEVEL):.0%} upper bound "
                f"against this district's seasonal norm; at risk if HIGH, or "
                f"ELEVATED with stock headroom below {HEADROOM_MIN}x")
    else:
        # No recent admissions, so the point estimate IS the seasonal norm and
        # the ratio would measure interval width, not demand pressure. The
        # pressure signal is simply not available on this path, and pretending
        # otherwise would manufacture an outlook out of noise.
        ratio = None
        outlook = "unavailable"
        at_risk = headroom < HEADROOM_MIN
        rule = (f"demand pressure UNAVAILABLE without recent admissions; fell "
                f"back to stock headroom below {HEADROOM_MIN}x alone")

    caveats = [
        "Projection covers DENGUE-driven demand only. Dataset v1.0 excludes "
        "trauma, obstetric and surgical demand (deferred to v1.1), so this is a "
        "LOWER BOUND on competing demand and true risk is higher, not lower.",
        "Bag figures use transfusion_rate.central = 0.22, a modelling choice, "
        "not a citation. The cited band spans 0.097-0.426; bags.upper.low and "
        "bags.upper.high carry that range.",
        "projected_district_demand_bags is DISTRICT-WIDE dengue demand. It is "
        "NOT all served from RoktoNet inventory and must not be subtracted from "
        "an organisation's stock — it is context for the outlook, not a "
        "drawdown figure.",
    ]
    if f["basis"] == "seasonal_historical":
        caveats.insert(0,
            "No recent admissions supplied, so this used the SEASONAL fallback "
            "(MAE ~2.5x worse than the validated path) AND the demand-pressure "
            "signal is unavailable. The decision reduces to stock headroom. "
            "Supply `recent_admissions` for a meaningful risk check.")
    if stock_scope != "district":
        caveats.append(
            "current_stock_units declared as organization scope; headroom is "
            "therefore relative to this organisation only.")
    if days > 28:
        caveats.append(
            f"needed_by_date is {days} days out; the longest calibrated horizon "
            f"is 4 weeks, so this was scored at 4 weeks and understates demand "
            f"accumulating beyond that.")

    return {
        "at_risk": at_risk,
        "fulfillment_path": ("scheduled_donor_mobilization" if at_risk
                             else "scheduled_reservation"),
        "decision": {
            "rule": rule,
            "demand_outlook": outlook,
            "pressure_ratio": round(ratio, 3) if ratio is not None else None,
            "seasonal_normal_admissions": round(normal, 2),
            "projected_upper_admissions": projected_upper,
            "projected_district_demand_bags": f["bags"]["upper"]["central"],
            "stock_headroom": (round(headroom, 2) if headroom != float("inf")
                               else None),
            "days_until_needed": days,
            "horizon_weeks_used": h,
            "current_stock_units": current_stock_units,
            "units_required": units_required,
            "stock_scope": stock_scope,
            "thresholds": {"pressure_elevated": PRESSURE_ELEVATED,
                           "pressure_high": PRESSURE_HIGH,
                           "headroom_min": HEADROOM_MIN,
                           "headroom_min_is_policy_not_measured": True},
        },
        "forecast": f,
        "caveats": caveats,
    }


def regional_demand(horizon_weeks: int = 2, grain: str = "division",
                    as_of_date: str | None = None,
                    level: str = DEFAULT_LEVEL) -> dict:
    ao = (datetime.strptime(as_of_date, "%Y-%m-%d").date()
          if as_of_date else date.today())
    units = sorted(model()["tiers"][grain])
    rows = []
    for u in units:
        try:
            f = forecast_unit(u, grain, horizon_weeks, as_of=ao, level=level)
        except ModelError:
            continue
        rows.append({"unit": u, "tier": f["tier"],
                     "admissions": f["admissions"], "bags": f["bags"],
                     "basis": f["basis"]})
    rows.sort(key=lambda r: r["admissions"]["point"], reverse=True)
    return {
        "grain": grain, "horizon_weeks": horizon_weeks,
        "as_of": str(ao), "level": float(level),
        "basis": "seasonal_historical",
        "note": ("Regional outlook uses the seasonal path for every unit, since "
                 "no live admissions feed exists. It is an expectation from "
                 "history, not a live forecast, and is materially less accurate "
                 "than the observed path used by /forecast/risk-check when the "
                 "caller supplies recent admissions."),
        "units": rows,
    }


def model_info() -> dict:
    m = model()
    return {
        "schema_version": m["schema_version"],
        "generated": m["generated"],
        "source": m["source"],
        "data_span_weeks": m["data_span"],
        "grains": sorted(m["tiers"]),
        "horizons_weeks": list(HORIZONS),
        "interval_levels": [float(x) for x in LEVELS],
        "risk_rule_level": float(RISK_LEVEL),
        "predictors": {
            "observed_recent": "naive persistence — last complete week's "
                               "admissions. The Stage 6B validated estimator.",
            "seasonal_historical": "mean admissions for this unit and "
                                   "week-of-year. Fallback when no recent "
                                   "admissions are supplied. Separately "
                                   "calibrated; materially less accurate.",
        },
        "why_no_learned_model": (
            "72 walk-forward evaluations across 12 feature-set/target "
            "configurations, 3 horizons and 2 grains, including NASA POWER "
            "rainfall and temperature lagged 2-12 weeks. None beat naive "
            "persistence with paired Wilcoxon p < 0.05. Closest: division "
            "h=1, 7 endogenous features, +9.5% but p=0.322 with the margin "
            "resting on a single fold."),
        "accuracy": m["diagnostics"],
        "conversion": m["conversion"],
        "excluded_demand": ["trauma", "obstetric", "surgical", "oncology",
                            "anaemia"],
    }
