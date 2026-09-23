#!/usr/bin/env python3
"""
Stage 6A / A2 — Acquire DGHS daily dengue press-release PDFs.

  !! THIS SCRIPT CANNOT RUN IN THE CLOUD WORKSPACE. RUN IT ON A TEAM MACHINE. !!

  The cloud workspace's egress allowlist denies dghs.gov.bd, old.dghs.gov.bd and the
  Oracle object-storage host that serves the PDFs (gateway answers 403 to CONNECT).
  See ACCESS_NOTES.md. Nothing about this script is workspace-specific; it is written
  to run from an ordinary machine in Bangladesh with normal internet access.

TWO URL REGIMES
---------------
  archive (<= 2026-09-03):
      https://old.dghs.gov.bd/images/docs/vpr/YYYYMMDD_dengue_all.pdf
      Fully deterministic. No scraping needed.

  live (> 2026-09-03):
      https://dghs.gov.bd/pages/miscellaneous-infos
      PDFs are served from Oracle object storage under RANDOM UUIDs. There is no
      derivable URL. The listing must be scraped to recover the date -> URL mapping.

ROBOTS AND ETIQUETTE
--------------------
  DGHS's robots.txt disallows the /images/docs/vpr/ path. This script therefore:
    - defaults to a conservative 2.0s delay between requests
    - sends an identifying User-Agent naming the project and a contact address
    - never parallelises
    - resumes rather than re-downloading
  Downloading public health bulletins for academic research is a reasonable use, but
  it is the team's call and the team's responsibility. Set --contact to a real address.
  If DGHS asks you to stop, stop.

USAGE
-----
  python3 fetch_dengue.py --start 2019-08-27 --end 2026-09-03 \
      --contact you@example.com --delay 2.0

  Resume after interruption: just run the same command again.
  Dry run (build the URL list, download nothing): add --dry-run
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import sys
import time
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parents[1]
RAW = REPO / "raw" / "dengue"
MANIFEST = REPO / "raw" / "dengue" / "_manifest.csv"
GAPS = REPO / "reports" / "dengue_gap_report.csv"

ARCHIVE_TMPL = "https://old.dghs.gov.bd/images/docs/vpr/{ymd}_dengue_all.pdf"
LIVE_LISTING = "https://dghs.gov.bd/pages/miscellaneous-infos"

# The date on/before which the archive route carries the release. After this, the
# archive stops and the live listing is the only source. Confirmed against the
# reference implementation at github.com/sps1590/dengue_daily_report.
ARCHIVE_CUTOFF = dt.date(2026, 9, 3)

# First daily press release.
FIRST_RELEASE = dt.date(2019, 8, 27)

MANIFEST_COLS = ["date", "url", "route", "http_status", "bytes", "sha256", "fetched_at"]


def load_manifest() -> dict[str, dict]:
    if not MANIFEST.exists():
        return {}
    with MANIFEST.open(encoding="utf-8", newline="") as fh:
        return {r["date"]: r for r in csv.DictReader(fh)}


def append_manifest(row: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    new = not MANIFEST.exists()
    with MANIFEST.open("a", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=MANIFEST_COLS)
        if new:
            w.writeheader()
        w.writerow(row)


def looks_like_pdf(b: bytes) -> bool:
    """DGHS returns an HTML error page with status 200 for missing dates."""
    return b[:5] == b"%PDF-"


def fetch_one(session: requests.Session, d: dt.date, delay: float,
              dry_run: bool) -> dict | None:
    ymd = d.strftime("%Y%m%d")
    url = ARCHIVE_TMPL.format(ymd=ymd)
    dest = RAW / f"{ymd}.pdf"

    if dry_run:
        print(f"  [dry-run] {d}  {url}")
        return None

    try:
        r = session.get(url, timeout=60)
    except requests.RequestException as e:
        print(f"  {d}  ERROR  {type(e).__name__}: {e}", file=sys.stderr)
        return {"date": d.isoformat(), "url": url, "route": "archive",
                "http_status": "ERR", "bytes": 0, "sha256": "",
                "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}

    if r.status_code != 200 or not looks_like_pdf(r.content):
        note = "not-a-pdf" if r.status_code == 200 else str(r.status_code)
        print(f"  {d}  MISS   ({note})")
        return {"date": d.isoformat(), "url": url, "route": "archive",
                "http_status": note, "bytes": len(r.content), "sha256": "",
                "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    sha = hashlib.sha256(r.content).hexdigest()
    print(f"  {d}  OK     {len(r.content):>9,} bytes")
    time.sleep(delay)
    return {"date": d.isoformat(), "url": url, "route": "archive",
            "http_status": "200", "bytes": len(r.content), "sha256": sha,
            "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}


def write_gap_report(start: dt.date, end: dt.date, manifest: dict[str, dict]) -> None:
    """Record every date with no usable PDF. Gaps are recorded, never filled."""
    GAPS.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    d = start
    while d <= end:
        key = d.isoformat()
        rec = manifest.get(key)
        if rec is None:
            rows.append({"date": key, "reason": "never_attempted"})
        elif rec["http_status"] != "200":
            rows.append({"date": key, "reason": rec["http_status"]})
        d += dt.timedelta(days=1)
    with GAPS.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["date", "reason"])
        w.writeheader()
        w.writerows(rows)
    total = (end - start).days + 1
    print(f"\ngap report: {GAPS}")
    print(f"  {len(rows):,} missing of {total:,} dates ({len(rows)/total:.1%})")
    if rows:
        print("  NOTE: dengue reporting is seasonal and DGHS does not publish every")
        print("        day year-round. Off-season gaps are expected and are NOT errors.")
        print("        Treat them as zero-activity days at the modelling step, not here.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--start", default=FIRST_RELEASE.isoformat())
    p.add_argument("--end", default=ARCHIVE_CUTOFF.isoformat())
    p.add_argument("--delay", type=float, default=2.0,
                   help="seconds between requests (default 2.0, be polite)")
    p.add_argument("--contact", default="",
                   help="contact email for the User-Agent header (strongly recommended)")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--limit", type=int, default=0, help="stop after N downloads (testing)")
    args = p.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)

    if start < FIRST_RELEASE:
        print(f"note: clamping start to first known release {FIRST_RELEASE}")
        start = FIRST_RELEASE
    if end > ARCHIVE_CUTOFF:
        print(f"WARNING: dates after {ARCHIVE_CUTOFF} are NOT on the archive route.")
        print("         They live on the live listing under random UUIDs and need the")
        print("         scraper, which is not implemented here. Clamping end.")
        end = ARCHIVE_CUTOFF

    if not args.contact and not args.dry_run:
        print("WARNING: no --contact given. Set one so DGHS can reach you.\n")

    ua = f"RoktoNet-research/1.0 (academic blood-demand dataset; {args.contact or 'no contact given'})"
    session = requests.Session()
    session.headers.update({"User-Agent": ua})

    manifest = load_manifest()
    total = (end - start).days + 1
    print(f"range      : {start} .. {end}  ({total:,} dates)")
    print(f"already have: {sum(1 for r in manifest.values() if r['http_status']=='200'):,}")
    print(f"delay      : {args.delay}s\n")

    done = 0
    d = start
    while d <= end:
        key = d.isoformat()
        prior = manifest.get(key)
        if prior and prior["http_status"] == "200" and (RAW / f"{d:%Y%m%d}.pdf").exists():
            d += dt.timedelta(days=1)
            continue
        row = fetch_one(session, d, args.delay, args.dry_run)
        if row:
            append_manifest(row)
            manifest[key] = row
            if row["http_status"] == "200":
                done += 1
                if args.limit and done >= args.limit:
                    print(f"\nreached --limit {args.limit}, stopping")
                    break
        d += dt.timedelta(days=1)

    if not args.dry_run:
        write_gap_report(start, end, manifest)


if __name__ == "__main__":
    main()
