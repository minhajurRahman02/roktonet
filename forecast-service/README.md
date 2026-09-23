# RoktoNet Forecast Service (Stage 6C)

The AI module's REST service. Separate Flask app from the optimization engine —
a locked Phase 6 decision, so that "non-AI engine owns current-state feasibility,
AI owns time-based risk projection" is true in the deployment and not only in the
pitch.

**Folder name is lowercase-hyphen on purpose.** `Optimization Engine` (capital
letters, a space) has already caused one Render root-directory failure and needs
quoting in `docker-compose.yml`. Not repeating that.

---

## What it actually does, without inflation

Projects district-level dengue-driven blood demand 1, 2 or 4 weeks ahead and
returns a **calibrated prediction interval**, then answers Section 7B's Check 2.

The point estimate is **naive persistence** — last week's admissions. That is not
a placeholder. Stage 6B ran 72 walk-forward evaluations across 12 feature-set and
target configurations, 3 horizons and 2 grains, including acquired NASA POWER
rainfall and temperature at the 4–8 week lags the dengue literature points at.
Nothing beat persistence by a margin surviving a paired Wilcoxon test. Persistence
won the comparison, so persistence ships.

**The interval is the contribution.** Measured coverage is within 1 percentage
point of nominal at every tier, level, horizon and grain.

---

## Setup

```bash
cd forecast-service
pip install -r requirements.txt
python3 app.py
```

Runs on **5002** (the optimization engine owns 5001; both run side by side).
Only dependency is Flask — no numpy, scikit-learn or joblib, because the artefact
is arithmetic on calibrated quantiles rather than a fitted estimator. That keeps
Render's cold start short and removes unpickling version risk.

### Regenerating the model artefact

`forecast_model.json` is generated from the dataset repo, never edited by hand:

```bash
cd dataset
python3 scripts/freeze_baseline.py --all
python3 scripts/export_forecast_model.py --out ../forecast-service/forecast_model.json
```

### Deploying to Render

Root Directory `forecast-service`, Build `pip install -r requirements.txt`,
Start `gunicorn app:app`. Stateless — no environment variables needed, same as
the engine. Add `FORECAST_URL` to the backend's env pointing at the deployed URL.

---

## The limitation you must understand before using this

Persistence needs last week's dengue admissions. **RoktoNet does not have them** —
it observes blood requests, not DGHS admission counts. So there are two paths and
they are not equivalent:

| `basis` | When | District, 2-week MAE |
|---|---|---|
| `observed_recent` | caller supplied `recent_admissions` | **19.9** |
| `seasonal_historical` | nothing supplied — falls back to the seasonal median | **49.8** |

Each is calibrated separately under the identical walk-forward protocol and every
response states which was used. **On the fallback path the demand-pressure signal
is not computed at all** — the point estimate *is* the seasonal norm, so a ratio
against it would measure interval width rather than demand, and manufacturing an
outlook out of that would be noise wearing a label.

Until a DGHS feed exists, production calls will take the fallback path unless the
backend supplies admissions. That is the honest state of the module.

---

## Endpoints

### `GET /health`
`{"status": "ok"}`. CORS-open (only this route), same scoping as the engine.

### `GET /model-info`
Calibration provenance, both predictors' accuracy, the conversion band, and why
no learned model shipped.

### `GET /forecast/regional-demand?horizon=2&grain=division&level=0.80`
Demand outlook per division or district, for the admin analytics page. Always uses
the seasonal path — it is an expectation from history, not a live forecast.

### `POST /forecast/risk-check`
Section 7B Check 2. **Call only after Check 1 passes.**

```json
{
  "district": "Dhaka",
  "units_required": 4,
  "current_stock_units": 6,
  "needed_by_date": "2026-10-08",
  "as_of_date": "2026-09-24",
  "recent_admissions": [4000, 9000],
  "stock_scope": "district"
}
```

`recent_admissions` is weekly counts, **oldest first**; the last element is the
most recent complete week.

---

## The decision rule, and why it is not what the plan originally said

The Phase 6 plan said Check 2 should test whether current stock *remains*
sufficient by subtracting projected demand. **Implementation showed that cannot
work.** Projected district-wide dengue demand for Dhaka over two weeks is ~7,900
bags against a hospital holding tens of units. Every request would return
`at_risk`, so the check would carry no information. The mismatch is real, not a
bug: district-wide dengue demand is not served out of one organisation's RoktoNet
inventory, so the two quantities are not comparable and no threshold on their
difference makes them so.

What **is** supportable is a relative signal — is this district heading into
demand above its own seasonal norm? That was checked against history *before*
being adopted:

```
weeks exceeding 1.75x the seasonal norm, by year
  2022:   4 / 1894   (0.2%)
  2023: 927 / 2064   (44.9%)   <- the outbreak year
  2024: 121 / 1289   (9.4%)
  2025: 241 / 1291   (18.7%)
```

It discriminates outbreaks cleanly, so it is the rule:

```
pressure_ratio = 80% upper bound / this district's seasonal median for that week
  >= 3.0  -> "high"      (~top decile historically)
  >= 1.4  -> "elevated"  (~top quartile)
  else    -> "normal"

at_risk = high, OR (elevated AND stock headroom < 2.0x)
```

**The seasonal norm is a MEDIAN, not a mean.** With a mean, 2023 dragged Dhaka's
early-October norm to ~3,200 admissions/week, so a normal year read as a demand
*collapse* and the signal never fired. The median is robust to one extreme year in
four.

`headroom_min = 2.0` is a **policy constant, not a measurement** — flagged in the
response as `headroom_min_is_policy_not_measured`, the same treatment
`transfusion_rate.central` gets. Change it deliberately.

Behaviour across the range (Dhaka, seasonal norm 2,971):

| last week | ratio | outlook | at_risk |
|---|---|---|---|
| 2,200 | 0.75 | normal | false |
| 3,000 | 1.02 | normal | false |
| 4,500 | 1.52 | elevated | false (headroom 10x) |
| 9,000 | 3.04 | **high** | **true** |

---

## Postman testing guide

Base URL `http://localhost:5002` (or the Render URL).

**1. Health** — `GET /health` → `200 {"status":"ok"}`

**2. Model info** — `GET /model-info` → `200`. Check `data_span_weeks` is
`["2022-02-28","2026-06-29"]` and `risk_rule_level` is `0.8`.

**3. Risk check, outbreak → mobilize.** `POST /forecast/risk-check`, body as
above with `"recent_admissions": [4000, 9000]`.
Expect `200`, `at_risk: true`, `fulfillment_path: "scheduled_donor_mobilization"`,
`decision.demand_outlook: "high"`, `decision.pressure_ratio: 3.035`,
`forecast.basis: "observed_recent"`.

**4. Risk check, normal demand → reserve.** Same body, `"recent_admissions":
[2000, 2200]`.
Expect `at_risk: false`, `fulfillment_path: "scheduled_reservation"`,
`demand_outlook: "normal"`, `pressure_ratio: 0.746`.

**5. Fallback path.** Same body with `recent_admissions` removed entirely.
Expect `forecast.basis: "seasonal_historical"`, `demand_outlook: "unavailable"`,
`pressure_ratio: null`, and a first caveat saying the pressure signal is
unavailable. **This is what production returns today** — confirm your frontend
handles it.

**6. Regional demand.** `GET /forecast/regional-demand?horizon=2` → `200`,
8 divisions, Dhaka first.

**7. Unknown district.** `POST` with `"district": "Atlantis"` →
`400 {"error":"unknown district 'Atlantis'","type":"ModelError"}`.

**8. Missing field.** `POST` without `needed_by_date` →
`400 missing required field(s): needed_by_date`.

**9. Bad horizon.** `GET /forecast/regional-demand?horizon=3` →
`400 horizon must be one of 1, 2, 4`.

**10. Past date.** `POST` with `needed_by_date` before `as_of_date` → `400`.

**11. Service down (D5 degradation).** Stop the service and submit an elective
request through the backend. The request must still succeed on Check 1 alone and
log that Check 2 was skipped. **A forecast outage must never block an elective
request** — if it does, that is a backend bug, not a service bug.

---

## Reading the numbers correctly

- `admissions` are **dengue admissions**, not bags. `bags` applies the conversion.
- Every bag figure is a **band**: `low` / `central` / `high`.
  `transfusion_rate.central = 0.22` is a modelling choice, not a citation, and the
  cited band spans 0.097–0.426 — a 4.4× range. Displaying only `central` hides
  that; the API will not make that choice for you.
- `projected_district_demand_bags` is district-wide. **Do not subtract it from an
  organisation's stock.** It is context for the outlook.
- Dataset v1.0 covers **dengue and chronic demand only**. Trauma, obstetric and
  surgical demand are deferred to v1.1, so every projection is a **lower bound**
  on competing demand — true risk is higher, never lower.
