"""
RoktoNet forecast service — Flask REST wrapper.

Mirrors the optimization engine's `app.py` deliberately: same health-check shape,
same dynamic-port handling for Render, same /health-only CORS scoping, same
stateless contract. Anyone who has read one service can read this one.

WHY A SEPARATE SERVICE RATHER THAN NEW ROUTES ON THE ENGINE
------------------------------------------------------------
A locked Phase 6 decision. The system's claim is that the non-AI engine owns
current-state feasibility while the AI module owns time-based risk projection.
If both lived in one Flask app that division would exist only in the pitch. Here
it exists in the deployment: two services, two Render instances, and 7B's Check 1
keeps working when this one is down.

STATELESS, LIKE THE ENGINE
---------------------------
This service never touches Postgres. The Node backend fetches stock and request
details and passes them in. All the forecasting state lives in
forecast_model.json, which is regenerated from the dataset repo by
scripts/export_forecast_model.py.

DEPENDENCIES: Flask ONLY
-------------------------
No numpy, scikit-learn or joblib. The artefact is plain JSON because the shipped
predictor is arithmetic on calibrated quantiles, not a fitted estimator. That
keeps Render's free-tier cold start (a documented 30-60s pain point) as short as
possible and removes any unpickling version risk.

FAILING SAFE
------------
7B must degrade to Check 1 alone when this service is unavailable — an elective
request must never be blocked because the forecaster is down. That is the Node
backend's responsibility (D5), but this service helps by answering /health
cheaply and by returning structured errors with a clear HTTP status rather than
a 500 with an HTML body.
"""

import os
import traceback

from flask import Flask, jsonify, request

from forecast import (ModelError, model, model_info, regional_demand,
                      risk_check, seasonal_curve, seasonal_grid, list_units,
                      HORIZONS, LEVELS)

app = Flask(__name__)


# --- CORS, widened deliberately in Phase 6E (Roktim) -----------------------
#
# This used to open /health alone, mirroring the optimization engine, because
# /forecast/* was to be reached only by the Node backend. The Roktim design
# changed that: the browser now calls this service DIRECTLY, and the backend is
# not in the advisory path at all. See ROKTIM_UI_SPEC.md section 2.
#
# The reasoning for why that is safe HERE and would not be for the engine:
#   - this service is read-only; no route mutates anything, anywhere
#   - it holds no credentials, reads no cookies and issues no session
#   - its only input is published DGHS dengue statistics
#   - the engine, by contrast, allocates real inventory
#
# So the widening is a property of what this service is, not a relaxation of
# the project's stance. It is still not '*': ROKTIM_ALLOWED_ORIGINS is an
# explicit allowlist, and an unlisted origin gets no CORS headers at all.
# /health keeps '*' because uptime checks and the wake-up ping have no origin.
_ALLOWED_ORIGINS = {
    o.strip().rstrip("/")
    for o in os.environ.get("ROKTIM_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
} or {"http://localhost:5173", "http://127.0.0.1:5173"}


@app.after_request
def apply_cors(response):
    if request.path == "/health":
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response

    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin and origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        # Without Vary, a shared cache could serve one origin's CORS header to
        # another origin's request.
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Max-Age"] = "600"
    return response


@app.errorhandler(ModelError)
def handle_model_error(e):
    return jsonify({"error": str(e), "type": "ModelError"}), 400


@app.route("/health", methods=["GET"])
def health():
    """Readiness, not just liveness.

    The model loads lazily on first use, so a health check that only returns
    {"status": "ok"} would pass on a deployment whose forecast_model.json never
    made it into the build — and the first real risk-check would then be the
    thing that discovers it. That failure would surface during a demo, not here.

    So this actually loads the artefact. It is cached after the first call, so
    the cost is one 79 KB JSON parse per process, which also usefully warms the
    service on Render's free tier where the frontend pings /health to wake it.

    503, not 200, when the model is unavailable: Render and any uptime check
    should see a service that cannot answer as DOWN, because it is.
    """
    try:
        m = model()
    except Exception as e:                                  # noqa: BLE001
        return jsonify({"status": "error", "model_loaded": False,
                        "error": str(e)}), 503
    return jsonify({"status": "ok", "model_loaded": True,
                    "schema_version": m.get("schema_version"),
                    "generated": m.get("generated")})


@app.route("/model-info", methods=["GET"])
def info():
    return jsonify(model_info())


@app.route("/forecast/risk-check", methods=["POST"])
def forecast_risk_check():
    """Section 7B Check 2. Call ONLY after Check 1 has passed.

    Body:
      {
        "district": "Dhaka",                  required
        "units_required": 4,                  required
        "current_stock_units": 40,            required
        "needed_by_date": "2026-10-08",       required, YYYY-MM-DD
        "as_of_date": "2026-09-24",           optional, defaults to today
        "recent_admissions": [110, 132],      optional, oldest first, weekly
        "stock_scope": "district"             optional: district | organization
      }
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    missing = [k for k in ("district", "units_required", "current_stock_units",
                           "needed_by_date") if data.get(k) is None]
    if missing:
        return jsonify({"error": f"missing required field(s): "
                        f"{', '.join(missing)}"}), 400
    try:
        units_required = float(data["units_required"])
        current_stock = float(data["current_stock_units"])
    except (TypeError, ValueError):
        return jsonify({"error": "units_required and current_stock_units must "
                                 "be numeric"}), 400
    if units_required < 0 or current_stock < 0:
        return jsonify({"error": "units_required and current_stock_units must "
                                 "not be negative"}), 400

    recent = data.get("recent_admissions")
    if recent is not None:
        if not isinstance(recent, list) or not recent:
            return jsonify({"error": "recent_admissions must be a non-empty "
                                     "list of weekly counts, oldest first"}), 400
        try:
            recent = [float(x) for x in recent]
        except (TypeError, ValueError):
            return jsonify({"error": "recent_admissions must be numeric"}), 400

    try:
        return jsonify(risk_check(
            district=str(data["district"]),
            units_required=units_required,
            current_stock_units=current_stock,
            needed_by_date=str(data["needed_by_date"]),
            as_of_date=data.get("as_of_date"),
            recent_admissions=recent,
            stock_scope=str(data.get("stock_scope", "district"))))
    except ModelError as e:
        return jsonify({"error": str(e), "type": "ModelError"}), 400
    except Exception as e:                                  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/forecast/regional-demand", methods=["GET"])
def forecast_regional_demand():
    """Division- or district-level demand outlook for the admin analytics page.

    Query: ?horizon=2&grain=division&level=0.80&as_of=2026-09-24
    """
    try:
        h = int(request.args.get("horizon", 2))
    except ValueError:
        return jsonify({"error": "horizon must be an integer"}), 400
    if h not in HORIZONS:
        return jsonify({"error": f"horizon must be one of "
                        f"{', '.join(map(str, HORIZONS))}"}), 400

    grain = request.args.get("grain", "division")
    if grain not in ("district", "division"):
        return jsonify({"error": "grain must be district or division"}), 400

    level = request.args.get("level", "0.80")
    if level not in LEVELS:
        return jsonify({"error": f"level must be one of "
                        f"{', '.join(LEVELS)}"}), 400
    try:
        return jsonify(regional_demand(horizon_weeks=h, grain=grain,
                                       as_of_date=request.args.get("as_of"),
                                       level=level))
    except ModelError as e:
        return jsonify({"error": str(e), "type": "ModelError"}), 400
    except Exception as e:                                  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/forecast/units", methods=["GET"])
def forecast_units():
    """Every district (or division) the model covers, with its volume tier.

    Query: ?grain=district
    """
    grain = request.args.get("grain", "district")
    if grain not in ("district", "division"):
        return jsonify({"error": "grain must be district or division"}), 400
    try:
        return jsonify(list_units(grain))
    except ModelError as e:
        return jsonify({"error": str(e), "type": "ModelError"}), 400


@app.route("/forecast/seasonal-curve", methods=["GET"])
def forecast_seasonal_curve():
    """One unit's 52-week seasonal profile with its calibrated band.

    Added for Roktim's curve explorer. Read-only, and it exposes nothing the
    advisory responses did not already imply -- it just shows the whole shape
    instead of the single week an advisory happens to land on.

    Query: ?unit=Dhaka&grain=district&horizon=2&level=0.80
    """
    unit = request.args.get("unit")
    if not unit:
        return jsonify({"error": "unit is required"}), 400

    grain = request.args.get("grain", "district")
    if grain not in ("district", "division"):
        return jsonify({"error": "grain must be district or division"}), 400

    try:
        h = int(request.args.get("horizon", 2))
    except ValueError:
        return jsonify({"error": "horizon must be an integer"}), 400
    if h not in HORIZONS:
        return jsonify({"error": f"horizon must be one of "
                                 f"{', '.join(map(str, HORIZONS))}"}), 400

    level = request.args.get("level", "0.80")
    if level not in LEVELS:
        return jsonify({"error": f"level must be one of "
                                 f"{', '.join(LEVELS)}"}), 400
    try:
        return jsonify(seasonal_curve(unit=unit, grain=grain,
                                      horizon_weeks=h, level=level))
    except ModelError as e:
        return jsonify({"error": str(e), "type": "ModelError"}), 400
    except Exception as e:                                  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/forecast/seasonal-grid", methods=["GET"])
def forecast_seasonal_grid():
    """Every unit's seasonal profile in one response, for the 64-sparkline grid.

    Query: ?grain=district
    """
    grain = request.args.get("grain", "district")
    if grain not in ("district", "division"):
        return jsonify({"error": "grain must be district or division"}), 400
    try:
        return jsonify(seasonal_grid(grain))
    except ModelError as e:
        return jsonify({"error": str(e), "type": "ModelError"}), 400
    except Exception as e:                                  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Render assigns the port dynamically via PORT. 5002, not 5001 — the
    # optimization engine already owns 5001, and both run side by side locally
    # and in docker-compose.
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port)
