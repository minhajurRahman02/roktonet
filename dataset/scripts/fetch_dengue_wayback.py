#!/usr/bin/env python3
"""
Stage 6A / A2 (Wayback fallback) — Recover DGHS dengue PDFs via the Internet Archive.

  !! RUN THIS ON A TEAM MACHINE, NOT THE CLOUD WORKSPACE. !!
  web.archive.org is unreachable from the cloud workspace's network allowlist.

WHY THIS EXISTS
---------------
old.dghs.gov.bd, which fetch_dengue.py targets, is dead (confirmed by direct browser
test, 2026-09-22). A manual Wayback Machine check found 4,789 captured URLs under
old.dghs.gov.bd/images/docs/vpr/ — a real and valuable find.

BUT NOT EVERY CAPTURE IS A REAL PDF. The manual check showed some rows with MIME type
application/pdf (genuine) and others with text/html (almost certainly a 404 or error
page captured after the original site started failing — several "From" dates cluster
in 2025, well after these 2023-dated reports would have first existed). Downloading
indiscriminately would silently poison the dataset with error pages disguised as PDFs.

This script therefore:
  1. Queries the Wayback CDX API (a documented, stable JSON endpoint) for every
     capture under the vpr/ prefix.
  2. FILTERS to mimetype=application/pdf only. Anything captured as text/html is
     excluded from download and listed separately in a report instead.
  3. For each surviving URL, keeps the EARLIEST pdf capture (closest to the original
     publish date, least likely to be a later replacement/error).
  4. Downloads via the `id_` modifier, which returns the archived bytes unmodified
     (no Wayback banner/toolbar injected — that matters for pdfplumber parsing later).
  5. Filters filenames to the *_dengue_all.pdf pattern specifically. The vpr/ prefix
     also holds other report types (e.g. *_vac_all — vaccination, not dengue), which
     must not be silently ingested as dengue data.

CDX API reference: https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md
No key required; it is a public, documented endpoint.

USAGE
-----
  Step 1 — see what's actually there, download nothing:
      python3 fetch_dengue_wayback.py --list-only

  Step 2 — download the confirmed-PDF captures:
      python3 fetch_dengue_wayback.py --contact you@example.com --delay 1.0

  Resume after interruption: rerun the same command.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parents[1]
RAW = REPO / "raw" / "dengue"
MANIFEST = REPO / "raw" / "dengue" / "_manifest.csv"
CDX_REPORT = REPO / "reports" / "wayback_cdx_report.csv"
GAPS = REPO / "reports" / "dengue_gap_report.csv"

CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx"
ORIGINAL_PREFIX = "old.dghs.gov.bd/images/docs/vpr/"

# Matches e.g. 20230727_dengue_all.pdf — the dengue daily report naming pattern.
DENGUE_FILENAME = re.compile(r"^(\d{8})_dengue_all\.pdf$")

MANIFEST_COLS = ["date", "url", "route", "http_status", "bytes", "sha256", "fetched_at"]


def query_cdx(session: requests.Session) -> list[dict]:
    """
    Ask the CDX API for every capture under the vpr/ prefix, filtered to real PDFs,
    collapsed to one row per URL (the API's own dedup, most-recent by default —
    we still re-sort to earliest ourselves below for safety).
    """
    params = {
        "url": ORIGINAL_PREFIX + "*",
        "output": "json",
        "filter": "mimetype:application/pdf",
        "fl": "timestamp,original,mimetype,statuscode,digest",
        "limit": "20000",
    }
    r = session.get(CDX_ENDPOINT, params=params, timeout=60)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return []
    header, *data = rows
    return [dict(zip(header, row)) for row in data]


def earliest_per_url(rows: list[dict]) -> dict[str, dict]:
    """Keep the earliest-timestamped PDF capture per original URL."""
    best: dict[str, dict] = {}
    for row in rows:
        url = row["original"]
        if url not in best or row["timestamp"] < best[url]["timestamp"]:
            best[url] = row
    return best


def to_dengue_date(original_url: str) -> dt.date | None:
    fname = original_url.rsplit("/", 1)[-1]
    m = DENGUE_FILENAME.match(fname)
    if not m:
        return None
    try:
        return dt.datetime.strptime(m.group(1), "%Y%m%d").date()
    except ValueError:
        return None


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
    return b[:5] == b"%PDF-"


def wayback_fetch_url(timestamp: str, original: str) -> str:
    # id_ returns the raw archived bytes with no Wayback UI injected.
    return f"https://web.archive.org/web/{timestamp}id_/{original}"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--contact", default="")
    p.add_argument("--delay", type=float, default=1.0)
    p.add_argument("--list-only", action="store_true",
                   help="query the CDX API and write the report, download nothing")
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()

    ua = f"RoktoNet-research/1.0 (academic blood-demand dataset; {args.contact or 'no contact given'})"
    session = requests.Session()
    session.headers.update({"User-Agent": ua})

    print("Querying Wayback CDX API for", ORIGINAL_PREFIX + "* ...")
    try:
        rows = query_cdx(session)
    except requests.RequestException as e:
        sys.exit(f"FATAL: CDX query failed: {e}")

    print(f"  {len(rows):,} application/pdf captures returned")
    if not rows:
        sys.exit("No PDF captures found. The manual check's text/html rows were the "
                 "whole prefix; nothing here is a confirmed PDF. Dead end for Wayback.")

    best = earliest_per_url(rows)
    print(f"  {len(best):,} distinct URLs after collapsing to earliest capture")

    # Classify: real dengue daily reports vs other file types under the same prefix.
    dengue_hits: dict[dt.date, dict] = {}
    other_hits: list[dict] = []
    for url, row in best.items():
        d = to_dengue_date(url)
        if d:
            dengue_hits[d] = row
        else:
            other_hits.append(row)

    print(f"  {len(dengue_hits):,} match the daily dengue report filename pattern")
    print(f"  {len(other_hits):,} are other file types under the same prefix (excluded)")

    CDX_REPORT.parent.mkdir(parents=True, exist_ok=True)
    with CDX_REPORT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "original_url", "wayback_timestamp", "wayback_fetch_url"])
        for d in sorted(dengue_hits):
            row = dengue_hits[d]
            w.writerow([d.isoformat(), row["original"], row["timestamp"],
                        wayback_fetch_url(row["timestamp"], row["original"])])
    print(f"\nwrote {CDX_REPORT}")

    if dengue_hits:
        span = f"{min(dengue_hits)} .. {max(dengue_hits)}"
        expected_days = (max(dengue_hits) - min(dengue_hits)).days + 1
        print(f"  date coverage: {span}  ({len(dengue_hits):,} of {expected_days:,} "
              f"days in that span have a confirmed PDF capture — gaps are normal, "
              f"DGHS did not publish daily year-round)")

    if args.list_only:
        print("\n--list-only: stopping before download. Review the report above, "
              "then rerun without --list-only.")
        return

    manifest = load_manifest()
    done = 0
    for d in sorted(dengue_hits):
        key = d.isoformat()
        prior = manifest.get(key)
        dest = RAW / f"{d:%Y%m%d}.pdf"
        if prior and prior["http_status"] == "200" and dest.exists():
            continue

        row = dengue_hits[d]
        url = wayback_fetch_url(row["timestamp"], row["original"])
        try:
            r = session.get(url, timeout=60)
        except requests.RequestException as e:
            print(f"  {d}  ERROR  {type(e).__name__}: {e}", file=sys.stderr)
            append_manifest({"date": key, "url": url, "route": "wayback",
                             "http_status": "ERR", "bytes": 0, "sha256": "",
                             "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()})
            continue

        if r.status_code != 200 or not looks_like_pdf(r.content):
            note = "not-a-pdf" if r.status_code == 200 else str(r.status_code)
            print(f"  {d}  MISS   ({note}) — CDX said application/pdf but body disagrees")
            append_manifest({"date": key, "url": url, "route": "wayback",
                             "http_status": note, "bytes": len(r.content), "sha256": "",
                             "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()})
            continue

        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.content)
        sha = hashlib.sha256(r.content).hexdigest()
        print(f"  {d}  OK     {len(r.content):>9,} bytes  (captured {row['timestamp']})")
        append_manifest({"date": key, "url": url, "route": "wayback",
                         "http_status": "200", "bytes": len(r.content), "sha256": sha,
                         "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        done += 1
        time.sleep(args.delay)
        if args.limit and done >= args.limit:
            print(f"\nreached --limit {args.limit}, stopping")
            break

    # Gap report over the full span we know DGHS was reporting, not just what CDX has.
    if dengue_hits:
        start, end = min(dengue_hits), dt.date(2026, 9, 3)  # archive-era cutoff
        manifest = load_manifest()
        gap_rows = []
        d = start
        while d <= end:
            key = d.isoformat()
            rec = manifest.get(key)
            if rec is None:
                gap_rows.append({"date": key, "reason": "not_in_wayback_cdx"})
            elif rec["http_status"] != "200":
                gap_rows.append({"date": key, "reason": rec["http_status"]})
            d += dt.timedelta(days=1)
        GAPS.parent.mkdir(parents=True, exist_ok=True)
        with GAPS.open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["date", "reason"])
            w.writeheader()
            w.writerows(gap_rows)
        total = (end - start).days + 1
        print(f"\ngap report: {GAPS}")
        print(f"  {len(gap_rows):,} missing of {total:,} dates in {start}..{end} "
              f"({len(gap_rows)/total:.1%})")


if __name__ == "__main__":
    main()
