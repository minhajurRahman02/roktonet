#!/usr/bin/env python3
"""
Stage 6B / B10b — Fetch daily weather per district from NASA POWER.

  !! RUN THIS ON A TEAM MACHINE, NOT THE CLOUD WORKSPACE. !!
  power.larc.nasa.gov is refused by the cloud workspace's network policy
  (verified 2026-09-23: the proxy answers 403 to CONNECT). Same situation as
  fetch_dengue_wayback.py.

WHY WEATHER, AND WHY IT IS NOT OPTIONAL
---------------------------------------
Stage 6B's walk-forward evaluation produced a negative result that no amount of
tuning fixed: at district-weekly grain, NO learned model beat naive persistence.
A feature-set ablation showed error rising MONOTONICALLY as features were added:

    feature set        walk-forward MAE (Ridge, h = 1 week)
    naive_last                12.968
    lags + growth             13.286
    lags only                 13.377
    lag_0 only                13.585
    lags + rolling            15.273
    ALL 22 features           16.480

The diagnosis is structural, not a hyperparameter. Every feature built so far is
a function of past admissions, so the model has strictly no information that
"last week's value" lacks, and the extra parameters only fit noise. The models
failed WORST during the 2023 outbreak — the one event the module exists to
anticipate.

What is missing is a LEADING INDICATOR: something that moves BEFORE cases do.
For dengue that is rainfall and temperature. Aedes aegypti breeding needs
standing water and warmth, and the lag from rainfall to reported cases in South
Asia is consistently reported at roughly 4-8 weeks. That lag is the entire point:
it is a window in which rainfall already observed can say something about
admissions not yet observed. Nothing currently in the dataset can do that.

SOURCE
------
NASA POWER (Prediction Of Worldwide Energy Resources), daily point API, AG
community. Satellite- and reanalysis-derived (MERRA-2 / GEOS), global, free, no
key required, documented and stable.

    https://power.larc.nasa.gov/api/temporal/daily/point
    Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/

Parameters requested:
    PRECTOTCORR  precipitation, bias-corrected            mm/day
    T2M          mean temperature at 2 m                  degC
    T2M_MAX      maximum temperature at 2 m               degC
    RH2M         relative humidity at 2 m                 %

PRECTOTCORR rather than PRECTOT: the corrected product is bias-adjusted against
gauge observations and is the one POWER itself recommends for land applications.
RH2M is included because humidity is reported alongside rainfall in the Aedes
literature and costs nothing to carry; whether it survives into the model is a
question for the ablation, not for this script.

FILL VALUES — THE THING MOST LIKELY TO SILENTLY RUIN THIS
----------------------------------------------------------
POWER encodes "no data" as -999, an ordinary-looking number. A -999 rainfall day
averaged into a 4-week rolling window would drag it to roughly -250 mm and the
model would train on it without complaint. This script does NOT convert to CSV;
it stores the API's raw JSON exactly as returned, and build_weather.py does the
-999 -> NaN conversion in one audited place, counts every occurrence, and fails
the build if the rate is material. Nothing here silently repairs anything.

WHY ONE CALL PER DISTRICT
--------------------------
POWER's point API returns a whole date range in a single response, so 64 calls
cover everything. The regional endpoint would be fewer calls but returns a raw
grid that would then have to be mapped to districts by nearest neighbour — extra
machinery with its own failure mode, to save five minutes. Coordinates come from
raw/reference/district_centroids.csv, derived by arithmetic from a committed
boundary file (see build_district_centroids.py).

The start date is 2021-06-01, seven months before the modelling window opens on
2022-01-01, so that an 8-week rainfall lag is computable for the very first
modelled week instead of being dropped.

USAGE
-----
  Step 1 - confirm one district works before committing to all 64:
      python3 scripts/fetch_weather.py --only Dhaka

  Step 2 - fetch the rest:
      python3 scripts/fetch_weather.py --delay 1.0

  Resume after interruption: rerun the same command. Districts already fetched
  and validated are skipped.

  Force a refetch of everything:
      python3 scripts/fetch_weather.py --force
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("FATAL: pip install requests")

REPO = Path(__file__).resolve().parents[1]
CENTROIDS = REPO / "raw" / "reference" / "district_centroids.csv"
OUTDIR = REPO / "raw" / "weather"
MANIFEST = OUTDIR / "_manifest.csv"

API = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "PRECTOTCORR,T2M,T2M_MAX,RH2M"
COMMUNITY = "AG"
START = "20210601"
END = "20260731"

MANIFEST_COLS = ["district", "latitude", "longitude", "start", "end",
                 "http_status", "bytes", "days_returned", "sha256", "url"]


def slug(name: str) -> str:
    return (name.lower().replace("'", "").replace(" ", "_"))


def load_manifest() -> dict[str, dict]:
    if not MANIFEST.exists():
        return {}
    with MANIFEST.open(encoding="utf-8") as fh:
        return {r["district"]: r for r in csv.DictReader(fh)}


def append_manifest(row: dict) -> None:
    new = not MANIFEST.exists()
    with MANIFEST.open("a", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=MANIFEST_COLS)
        if new:
            w.writeheader()
        w.writerow(row)


def validate_payload(payload: dict) -> int:
    """Confirm the response is the shape we asked for. Returns day count.

    A 200 with an error body is the failure mode that matters here: POWER can
    answer 200 and hand back a message object instead of data. Writing that to
    disk as though it were weather is exactly the 'captured error page' problem
    that fetch_dengue_wayback.py had to defend against, so the same defence
    applies - verify the structure, not the status code.
    """
    try:
        par = payload["properties"]["parameter"]
    except (KeyError, TypeError):
        raise ValueError("response has no properties.parameter block")
    wanted = PARAMS.split(",")
    missing = [p for p in wanted if p not in par]
    if missing:
        raise ValueError(f"response is missing parameter(s): {', '.join(missing)}")
    lens = {p: len(par[p]) for p in wanted}
    if len(set(lens.values())) != 1:
        raise ValueError(f"parameters have unequal day counts: {lens}")
    n = next(iter(lens.values()))
    if n < 365:
        raise ValueError(f"only {n} days returned; expected a multi-year range")
    return n


def fetch_one(session: requests.Session, lat: float, lon: float,
              timeout: int, retries: int) -> tuple[dict, str, int, bytes]:
    q = {"parameters": PARAMS, "community": COMMUNITY,
         "longitude": f"{lon}", "latitude": f"{lat}",
         "start": START, "end": END, "format": "JSON"}
    url = session.prepare_request(requests.Request("GET", API, params=q)).url
    last = None
    for attempt in range(1, retries + 1):
        try:
            r = session.get(API, params=q, timeout=timeout)
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
                time.sleep(2.0 * attempt)
                continue
            payload = r.json()
            n = validate_payload(payload)
            return payload, url, n, r.content
        except Exception as e:                      # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
            time.sleep(2.0 * attempt)
    raise RuntimeError(last or "unknown failure")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="fetch a single district by name, for a smoke test")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="seconds between requests (be polite to a free service)")
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--force", action="store_true",
                    help="refetch districts that are already on disk")
    args = ap.parse_args()

    if not CENTROIDS.exists():
        sys.exit(f"FATAL: {CENTROIDS} not found. "
                 f"Run scripts/build_district_centroids.py first.")

    with CENTROIDS.open(encoding="utf-8") as fh:
        districts = list(csv.DictReader(fh))
    if len(districts) != 64:
        sys.exit(f"FATAL: expected 64 centroids, got {len(districts)}")

    if args.only:
        districts = [d for d in districts if d["district"].lower() == args.only.lower()]
        if not districts:
            sys.exit(f"FATAL: no district named '{args.only}' in {CENTROIDS.name}")

    OUTDIR.mkdir(parents=True, exist_ok=True)
    done = load_manifest()
    session = requests.Session()
    session.headers["User-Agent"] = ("RoktoNet-dataset/1.0 "
                                     "(academic project; NASA POWER daily point API)")

    print(f"NASA POWER daily point  |  {START} .. {END}  |  {PARAMS}")
    print(f"{len(districts)} district(s) to consider, {len(done)} already in manifest\n")

    ok = skipped = failed = 0
    for i, d in enumerate(districts, 1):
        name = d["district"]
        out = OUTDIR / f"power_{slug(name)}.json"
        if out.exists() and name in done and not args.force:
            skipped += 1
            continue

        lat, lon = float(d["latitude"]), float(d["longitude"])
        print(f"  [{i:>2}/{len(districts)}] {name:<18} ({lat:.4f}, {lon:.4f}) ... ",
              end="", flush=True)
        try:
            payload, url, ndays, raw = fetch_one(session, lat, lon,
                                                 args.timeout, args.retries)
        except Exception as e:                      # noqa: BLE001
            print(f"FAILED  {e}")
            failed += 1
            append_manifest({"district": name, "latitude": lat, "longitude": lon,
                             "start": START, "end": END, "http_status": "ERROR",
                             "bytes": 0, "days_returned": 0, "sha256": "",
                             "url": f"ERROR: {e}"})
            time.sleep(args.delay)
            continue

        out.write_bytes(raw)
        append_manifest({"district": name, "latitude": lat, "longitude": lon,
                         "start": START, "end": END, "http_status": 200,
                         "bytes": len(raw), "days_returned": ndays,
                         "sha256": hashlib.sha256(raw).hexdigest(), "url": url})
        print(f"OK  {ndays:,} days, {len(raw)/1024:.0f} KB")
        ok += 1
        time.sleep(args.delay)

    print(f"\nfetched {ok}, skipped {skipped} (already present), failed {failed}")
    print(f"raw JSON  : {OUTDIR}")
    print(f"manifest  : {MANIFEST}")
    if failed:
        print("\nRerun the same command to retry the failures; successes are skipped.")
        sys.exit(1)
    on_disk = len(list(OUTDIR.glob("power_*.json")))
    if not args.only and on_disk != 64:
        sys.exit(f"FATAL: {on_disk} JSON files on disk, expected 64.")
    print("\nNext: python3 scripts/build_weather.py")


if __name__ == "__main__":
    main()
