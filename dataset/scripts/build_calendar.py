#!/usr/bin/env python3
"""
Stage 6A / A8 — Build calendar features for the RoktoNet blood demand dataset.

Reads:  raw/reference/calendar_anchors.yaml
Writes: interim/calendar_features.csv

This script needs no network access and no downloaded source files. It is fully
reproducible from the anchors file, which carries its own citations.

Bangladesh-specific behaviour that a Western default would get wrong:
  - The weekend is FRIDAY and SATURDAY, not Saturday and Sunday.
  - Eid dates are moon-sighting declarations, not computed astronomically. They are
    read from the anchors file, never derived.
  - Ramadan start is DERIVED (Eid - 30d) and carries +/- 1 day uncertainty.

Sign convention:
    days_to_eid_* = (date - eid_date).days
      negative -> date is BEFORE Eid  (outbound travel build-up)
      zero     -> Eid day
      positive -> date is AFTER Eid   (return travel)
  The model can learn the asymmetry between build-up and aftermath from the sign.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parents[1]
ANCHORS = REPO / "raw" / "reference" / "calendar_anchors.yaml"
OUT = REPO / "interim" / "calendar_features.csv"

# Bangladesh weekend. Monday=0 ... Friday=4, Saturday=5, Sunday=6.
WEEKEND_DOW = {4, 5}

# Gazetted Eid public holiday block, in days either side of Eid day.
# Bangladesh normally gazettes three days per Eid (Eid day +/- 1). Longer blocks
# have been declared in some years; this is an assumption, flagged in DATASET.md.
EID_HOLIDAY_PAD = 1


def _as_date(v) -> dt.date:
    """YAML may give date or str depending on quoting. Accept both."""
    if isinstance(v, dt.date):
        return v
    return dt.datetime.strptime(str(v), "%Y-%m-%d").date()


def load_anchors(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"FATAL: anchors file not found: {path}")
    with path.open(encoding="utf-8") as fh:
        a = yaml.safe_load(fh)
    a["eid_ul_fitr"] = {int(k): _as_date(v) for k, v in a["eid_ul_fitr"].items()}
    a["eid_ul_adha"] = {int(k): _as_date(v) for k, v in a["eid_ul_adha"].items()}
    return a


def signed_days_to_nearest(d: dt.date, anchors: dict) -> int | None:
    """Signed distance to the nearest anchor date, or None if no anchor is in range."""
    if not anchors:
        return None
    best = min(anchors.values(), key=lambda e: abs((d - e).days))
    return (d - best).days


def in_window(delta: int | None, before: int, after: int) -> bool:
    if delta is None:
        return False
    return -before <= delta <= after


def month_day_in_range(d: dt.date, start_md: str, end_md: str) -> bool:
    """Handle ranges that wrap the new year, e.g. 12-15 .. 02-15."""
    md = f"{d.month:02d}-{d.day:02d}"
    if start_md <= end_md:
        return start_md <= md <= end_md
    return md >= start_md or md <= end_md


def build(start: dt.date, end: dt.date, anchors: dict) -> pd.DataFrame:
    fitr = anchors["eid_ul_fitr"]
    adha = anchors["eid_ul_adha"]
    fixed = anchors.get("fixed_holidays", {}) or {}

    ram_len = int(anchors["ramadan"]["assumed_length_days"])
    tw = anchors["eid_travel_window"]
    tw_before, tw_after = int(tw["days_before"]), int(tw["days_after"])

    fog = anchors["winter_fog_season"]
    fog_start, fog_end = fog["start_month_day"], fog["end_month_day"]

    # Pre-compute the gazetted Eid holiday block and the Ramadan span as date sets.
    eid_holiday: set[dt.date] = set()
    for e in list(fitr.values()) + list(adha.values()):
        for k in range(-EID_HOLIDAY_PAD, EID_HOLIDAY_PAD + 1):
            eid_holiday.add(e + dt.timedelta(days=k))

    ramadan_day_of: dict[dt.date, int] = {}
    for e in fitr.values():
        # Ramadan ends the day before Eid ul-Fitr.
        for i in range(ram_len):
            day = e - dt.timedelta(days=ram_len - i)
            ramadan_day_of[day] = i + 1

    rows = []
    d = start
    while d <= end:
        dtf = signed_days_to_nearest(d, fitr)
        dta = signed_days_to_nearest(d, adha)
        md = f"{d.month:02d}-{d.day:02d}"

        is_fixed_holiday = md in fixed
        is_eid_holiday = d in eid_holiday

        rows.append(
            {
                "date": d.isoformat(),
                "year": d.year,
                "month": d.month,
                "day_of_week": d.weekday(),          # Monday=0
                "week_of_year": d.isocalendar().week,
                "day_of_year": d.timetuple().tm_yday,
                "is_weekend": int(d.weekday() in WEEKEND_DOW),
                "is_public_holiday": int(is_fixed_holiday or is_eid_holiday),
                "is_fixed_holiday": int(is_fixed_holiday),
                "is_eid_holiday": int(is_eid_holiday),
                "is_ramadan": int(d in ramadan_day_of),
                "ramadan_day": ramadan_day_of.get(d, 0),
                "days_to_eid_fitr": dtf if dtf is not None else "",
                "days_to_eid_adha": dta if dta is not None else "",
                "is_eid_travel_window": int(
                    in_window(dtf, tw_before, tw_after)
                    or in_window(dta, tw_before, tw_after)
                ),
                "is_winter_fog_season": int(month_day_in_range(d, fog_start, fog_end)),
            }
        )
        d += dt.timedelta(days=1)

    return pd.DataFrame(rows)


def sanity_check(df: pd.DataFrame, anchors: dict) -> list[str]:
    """Fail loudly rather than emitting a quietly wrong calendar."""
    problems = []

    # Every Eid day must be flagged as an Eid holiday and sit at delta 0.
    for year, e in anchors["eid_ul_fitr"].items():
        row = df[df["date"] == e.isoformat()]
        if row.empty:
            continue
        if int(row.iloc[0]["is_eid_holiday"]) != 1:
            problems.append(f"Eid ul-Fitr {year} ({e}) not flagged as Eid holiday")
        if str(row.iloc[0]["days_to_eid_fitr"]) != "0":
            problems.append(f"Eid ul-Fitr {year} ({e}) days_to_eid_fitr != 0")

    for year, e in anchors["eid_ul_adha"].items():
        row = df[df["date"] == e.isoformat()]
        if row.empty:
            continue
        if str(row.iloc[0]["days_to_eid_adha"]) != "0":
            problems.append(f"Eid ul-Adha {year} ({e}) days_to_eid_adha != 0")

    # Weekend must be Friday/Saturday, never Sunday.
    wk = df[df["is_weekend"] == 1]["day_of_week"].unique().tolist()
    if sorted(wk) != [4, 5]:
        problems.append(f"weekend days are {sorted(wk)}, expected [4, 5] (Fri, Sat)")

    # Ramadan must be contiguous and end the day before each Eid ul-Fitr.
    for year, e in anchors["eid_ul_fitr"].items():
        prev = (e - dt.timedelta(days=1)).isoformat()
        row = df[df["date"] == prev]
        if row.empty:
            continue
        if int(row.iloc[0]["is_ramadan"]) != 1:
            problems.append(f"day before Eid ul-Fitr {year} ({prev}) not in Ramadan")

    # No duplicate dates, no gaps.
    if df["date"].duplicated().any():
        problems.append("duplicate dates present")
    span = (dt.date.fromisoformat(df["date"].iloc[-1])
            - dt.date.fromisoformat(df["date"].iloc[0])).days + 1
    if span != len(df):
        problems.append(f"date gaps: {len(df)} rows spanning {span} days")

    return problems


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--start", default="2019-01-01")
    p.add_argument("--end", default="2027-12-31")
    p.add_argument("--out", default=str(OUT))
    args = p.parse_args()

    anchors = load_anchors(ANCHORS)
    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)

    df = build(start, end, anchors)

    problems = sanity_check(df, anchors)
    if problems:
        print("SANITY CHECK FAILED:", file=sys.stderr)
        for pr in problems:
            print(f"  - {pr}", file=sys.stderr)
        sys.exit(1)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)

    print(f"wrote {out}  ({len(df):,} rows, {start} .. {end})")
    print(f"  public holidays     : {int(df['is_public_holiday'].sum()):,}")
    print(f"  Ramadan days        : {int(df['is_ramadan'].sum()):,}")
    print(f"  Eid travel days     : {int(df['is_eid_travel_window'].sum()):,}")
    print(f"  winter fog days     : {int(df['is_winter_fog_season'].sum()):,}")
    print("  sanity checks       : PASS")


if __name__ == "__main__":
    main()
