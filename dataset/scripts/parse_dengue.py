#!/usr/bin/env python3
"""
Stage 6A / A3 — Parse DGHS daily dengue press-release PDFs.

  !! STATUS: DIAGNOSTIC-FIRST. THE EXTRACTION RULES ARE NOT YET CALIBRATED. !!

  This parser has never been run against a real DGHS PDF, because the cloud workspace
  cannot reach dghs.gov.bd (see ACCESS_NOTES.md). Shipping a speculative full parser
  would be guesswork dressed as code. So this file does two things instead:

    1. --dump-text   Extract the raw text layer of a PDF, page by page, and write it
                     to reports/pdf_text/. THIS IS THE DELIVERABLE FOR THE FIRST RUN.
                     Run it on 4 PDFs from different years and share the output; the
                     extraction rules can then be written against ground truth in
                     one pass instead of guessed at over several.

    2. --probe       Apply the current heuristics and report what they found WITHOUT
                     writing a dataset. Use this to watch the rules converge.

  Only once --probe is reliable across years should --extract be trusted.

WHAT WE ALREADY KNOW ABOUT THESE PDFs
-------------------------------------
Derived from the reference implementation (github.com/sps1590/dengue_daily_report),
whose own README states it has NEVER been run against a live PDF either. Treat all of
this as a structural hint, not as verified fact:

  - The PDF is a BI-dashboard export, not a clean table. Values are positioned
    graphics, so column alignment is unreliable and order matters more than layout.
  - Page 1 charts admissions and deaths per DIVISION.
  - Discharged and "currently admitted" per division appear much further down, inside
    a district-by-district table that rolls up into per-division grand-total rows.
  - Division grand-total rows are matched by their 24-hour admission figure, cross-
    checked against the cumulative admitted figure (a smaller district subtotal can
    coincidentally share the same 24h count).
  - Dhaka North and Dhaka South City Corporations are NEVER separated. They appear
    only as a combined "ঢাকা মহানগর" figure.

  CRITICAL DIVERGENCE FROM OUR PLAN: the reference tool targets DIVISION-level output.
  We need DISTRICT-level. The district table is present in the PDF but the reference
  implementation only reads it to recover division totals. District extraction is
  therefore NEW work, not inherited work, and carries its own risk.

BANGLA TEXT HAZARD
------------------
The reference source carries three spellings of Chattogram (চট্টগ্রাম / চট্টগ্ৰাম / চট্রগ্রাম),
two of Rajshahi (রাজশাহি / রাজশাহী), and a mangled 'সববম ট' where 'সর্বমোট' belongs.
That last one is the tell: conjunct glyphs break during text extraction. Any matching
must run on normalised text, never on raw text.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import unicodedata
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("FATAL: pip install pdfplumber")

REPO = Path(__file__).resolve().parents[1]
RAW = REPO / "raw" / "dengue"
TEXTDUMP = REPO / "reports" / "pdf_text"

# ---------------------------------------------------------------------------
# Bangla normalisation
# ---------------------------------------------------------------------------
# Strip zero-width joiners/non-joiners, collapse whitespace, NFC-normalise. These
# are the characters that make 'সর্বমোট' extract as 'সববম ট'.
_ZW = dict.fromkeys(map(ord, "​‌‍﻿"), None)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s or "")
    s = s.translate(_ZW)
    return re.sub(r"\s+", " ", s).strip()


def strip_marks(s: str) -> str:
    """Aggressive form: drop combining marks entirely, for fuzzy division matching."""
    s = unicodedata.normalize("NFD", norm(s))
    return "".join(c for c in s if not unicodedata.combining(c))


# Division name variants seen in the wild, all mapped to a canonical English name.
DIVISION_VARIANTS: dict[str, str] = {
    "ঢাকা": "Dhaka",
    "চট্টগ্রাম": "Chattogram",
    "চট্টগ্ৰাম": "Chattogram",
    "চট্রগ্রাম": "Chattogram",
    "রাজশাহী": "Rajshahi",
    "রাজশাহি": "Rajshahi",
    "খুলনা": "Khulna",
    "বরিশাল": "Barishal",
    "সিলেট": "Sylhet",
    "রংপুর": "Rangpur",
    "ময়মনসিংহ": "Mymensingh",
}
DIVISION_LOOKUP = {strip_marks(k): v for k, v in DIVISION_VARIANTS.items()}

# Structural anchors.
ANCHOR_DIVISION_TOTAL = ["বিভাগের সর্বমোট"]   # division grand-total row
ANCHOR_GRAND_TOTAL = ["সর্বমোট"]              # national grand total
ANCHOR_DHAKA_METRO = ["ঢাকা মহানগর"]          # combined DNCC + DSCC
ANCHOR_DHAKA_DIVISION = ["ঢাকা বিভাগ"]

BN_DIGITS = "০১২৩৪৫৬৭৮৯"
BN_TO_EN = str.maketrans(BN_DIGITS, "0123456789")


def to_int(tok: str) -> int | None:
    t = tok.translate(BN_TO_EN).replace(",", "").strip()
    return int(t) if re.fullmatch(r"-?\d+", t) else None


def numbers_in(line: str) -> list[int]:
    out = []
    for tok in re.findall(r"[\d০-৯][\d০-৯,]*", line):
        v = to_int(tok)
        if v is not None:
            out.append(v)
    return out


# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------
def dump_text(pdf_path: Path) -> Path:
    """THE FIRST-RUN DELIVERABLE. Dump the raw text layer for calibration."""
    TEXTDUMP.mkdir(parents=True, exist_ok=True)
    out = TEXTDUMP / (pdf_path.stem + ".txt")
    chunks: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        chunks.append(f"# {pdf_path.name}   pages={len(pdf.pages)}\n")
        for i, page in enumerate(pdf.pages, 1):
            chunks.append(f"\n{'='*70}\n=== PAGE {i} ===\n{'='*70}\n")
            chunks.append(page.extract_text() or "(no text layer)")
            tables = page.extract_tables() or []
            for j, tbl in enumerate(tables, 1):
                chunks.append(
                    f"\n--- page {i} table {j} ({len(tbl)} rows) ---\n")
                for row in tbl:
                    cells = [norm(c or "") for c in row]
                    chunks.append(" | ".join(cells) + "\n")
    out.write_text("".join(chunks), encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# --extract : district-level daily table
# ---------------------------------------------------------------------------
# CALIBRATED 2026-09-22 against 4 real recovered PDFs spanning 2021-12-13 to
# 2025-05-03. Findings that shape everything below:
#
#   1. The district table is a 10-COLUMN table:
#        [division, serial, district, institution, sarkari_24h, besarkari_24h,
#         total_24h, cumulative_total, cumulative_deaths, cumulative_discharged]
#      present in every sample, unchanged in column count across 2021-2025.
#
#   2. The word for "district" ITSELF renders inconsistently across PDFs —
#      বজলা in 3/4 samples, বিলা in the 2024-03-13 sample — because of legacy
#      font-to-Unicode glyph mapping drift, not a real spelling difference.
#      DO NOT match on that literal string. Instead the table is located
#      structurally, by its header row: first cell "রেভাগ" (Division, itself a
#      degraded "বিভাগ"), second cell containing "ক্রর ক" (degraded "ক্রমিক" /
#      Serial No.), fourth cell containing "প্ররতষ্ঠা" (degraded prefix of
#      "প্রতিষ্ঠানের নাম" / Institution name). These three markers were
#      byte-identical across all 4 samples despite the district-label drift,
#      so they are the stable anchor.
#
#   3. The table's PAGE NUMBER moved: pages 4-5 pre-2024, pages 8-10 from
#      2024-03-13 onward (DGHS inserted 5 new English chart pages before the
#      Bangla tables at some point in early-to-mid 2024). Never hardcode a
#      page range — search every page for the header marker instead.
#
#   4. From 2024 onward, some districts split their count across MULTIPLE
#      rows: one bare per-district row plus one or more named-hospital rows
#      for the same district (e.g. a district's own count plus a separate
#      row for "<District> Medical College Hospital, <District>"). Decision
#      (locked 2026-09-22): SUM every row sharing a district name into one
#      true daily per-district total, the same way the division subtotal
#      rows already aggregate their member districts.
#
#   5. Division and district names are only printed on the FIRST row of their
#      block (merged-cell rendering); subsequent rows in the same block leave
#      that cell blank. Both must be carried forward from the last non-blank
#      value.
#
#   6. Subtotal / grand-total rows (division subtotal, national "সব িব মাট")
#      have a BLANK serial-number cell. A row only counts as a genuine
#      district-level observation if its serial cell parses as an integer.
#      Subtotal rows are not written to the dataset, but the parser cross-
#      checks against them: summed district rows per division must equal
#      that division's own subtotal row, or the page is flagged, not
#      silently trusted.
#
#   7. Column 6 ("total_24h" = sarkari_24h + besarkari_24h, i.e. new
#      admissions in the last 24 hours) is the metric comparable to the
#      Kaggle stream's "Patients" column — confirmed by the national daily
#      peak figure (2,959 on 2023-08-10) matching this same definition in
#      the Kaggle data. This is the column written as admissions_24h below,
#      so the two dengue sources can be merged/cross-validated on a common
#      metric during the 2021-12..2023-08 overlap.
# DO NOT MATCH BANGLA HEADER WORDS. Calibration across 5 real samples showed
# the SAME header renders with different letter substitutions depending on
# which font subset the PDF embedded:
#
#     era                      "Division"  "Serial No."   "Institution name"
#     2021, 2023, 2024, 2025   রেভাগ       ক্রর ক নিং       প্ররতষ্ঠামনি না
#     2022                     তেভাগ       ক্রত ক নিং       প্রতিষ্ঠামনর না
#
# The 'ি' vowel sign collapses into 'র' in one subset and 'ত' in another, so
# every Bangla header string is unreliable — as was the district label itself
# (বজলা / বিলা / বিলা). Two earlier attempts to anchor on these strings each
# worked on the eras they were calibrated against and silently matched nothing
# on the others.
#
# DIGITS, however, render identically in every sample — they have to, or the
# data values themselves would be unreadable and nothing would work at all.
# So the table is located purely structurally, on digits and column position:
#
#   - Find the column holding the "২৪ ঘন্টায়" (last 24 hours) group label.
#   - The DISTRICT table has FOUR label columns before it
#     (division, serial, district, institution).
#   - The HOSPITAL table (pages 2-3) has TWO (serial, institution).
#   That offset is the discriminator, and it held across all five samples.
#   - Confirm with the "০১-০১-২০" year-to-date range label in a later column.
#
# All downstream column offsets are then DERIVED from where that 24-hour
# column was found, rather than hardcoded, so a future column insertion
# shifts everything correctly instead of silently misreading a column.
BN_24H_MARKER = "২৪"
BN_YTD_MARKER = "০১-০১-২০"
MIN_LABEL_COLS_DISTRICT = 3  # hospital table has 2; district table has 4

# CALIBRATION NOTE: the Bangla তারিখ line is NOT reliably near the front of the
# PDF. It sits on page 4 in the 2021 sample (page 1-3 there are either a legacy-
# font-garbled summary or the Dhaka-metro hospital table, neither of which
# carries a clean তারিখ line), and on page 6 in the 2024/2025 samples (after
# 5 new English chart pages were inserted ahead of the Bangla tables). So this
# searches EVERY page, not just the first few, and stops at the first hit.
# Dates also appear in Bangla digits (১৩-১২-২০২১) as often as ASCII (28/01/2023),
# so digits are normalised to ASCII before the date regex runs — matching on
# raw Bangla digit glyphs would silently miss the 2021/2023 samples.
DATE_LINE_RE = re.compile(
    r"তারিখ[:\s]*([0-3]?\d[/-][01]?\d[/-]\d{4}|\d{4}-\d{2}-\d{2})")
# Fallback for the English front-matter pages (2024+ era): "13-Mar-2024".
DATE_LINE_RE_EN = re.compile(
    r"\b([0-3]?\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})\b")
_EN_MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def _detect_district_header(row: list[str]) -> dict | None:
    """
    Structural, glyph-independent header detection. Returns the derived column
    layout if this row is the district table's header, else None.
    """
    if len(row) < 10:
        return None
    idx24 = next((i for i, c in enumerate(row) if BN_24H_MARKER in c), None)
    if idx24 is None or idx24 < MIN_LABEL_COLS_DISTRICT:
        return None  # not found, or only 2 label columns => hospital table
    if not any(BN_YTD_MARKER in c for c in row[idx24 + 1:]):
        return None  # no year-to-date range label after it => not this table
    return {
        "division": 0,
        "serial": idx24 - 3,
        "district": idx24 - 2,
        "institution": idx24 - 1,
        "num_start": idx24,
    }


def _find_report_date(pdf) -> str | None:
    """Search every page for a তারিখ line (Bangla or ASCII digits), falling
    back to the English 'DD-Mon-YYYY' front-matter format if none is found."""
    en_fallback: str | None = None
    for page in pdf.pages:
        text = page.extract_text() or ""
        for ln in text.splitlines():
            n = norm(ln)
            n_ascii_digits = n.translate(BN_TO_EN)
            m = DATE_LINE_RE.search(n_ascii_digits)
            if m:
                raw = m.group(1)
                for sep in ("/", "-"):
                    if sep in raw:
                        parts = raw.split(sep)
                        if len(parts[0]) == 4:  # YYYY-MM-DD
                            return raw.replace(sep, "-")
                        d, mo, y = parts
                        return f"{y}-{int(mo):02d}-{int(d):02d}"
            if en_fallback is None:
                m2 = DATE_LINE_RE_EN.search(n)
                if m2:
                    d, mon, y = m2.groups()
                    en_fallback = f"{y}-{_EN_MONTHS[mon]:02d}-{int(d):02d}"
    return en_fallback


def extract_one(pdf_path: Path) -> tuple[str | None, list[dict], list[str]]:
    """
    Returns (report_date, district_rows, warnings).
    district_rows: one dict per (division, district) with summed 24h/cumulative
    figures. warnings: reconciliation problems, never silently swallowed.
    """
    warnings: list[str] = []
    parsed: list[dict] = []

    # ---- pass 1: read every row of the district table, in document order ----
    with pdfplumber.open(pdf_path) as pdf:
        report_date = _find_report_date(pdf)
        for page in pdf.pages:
            # Reset per page: the header repeats on every page the district
            # table spans, and NOT resetting this let the flag leak into
            # later, unrelated pages (the page-6 monthly-summary chart table
            # was getting swept in as garbage once the district table ended).
            layout: dict | None = None
            for tbl in (page.extract_tables() or []):
                for raw in tbl:
                    row = [norm(c or "") for c in raw]
                    if len(row) < 10:
                        continue
                    found = _detect_district_header(row)
                    if found:
                        layout = found
                        continue
                    if layout is None:
                        continue
                    ns = layout["num_start"]
                    if len(row) < ns + 6:
                        continue
                    parsed.append({
                        "division_cell": row[layout["division"]],
                        "serial": to_int(row[layout["serial"]]),
                        "district": row[layout["district"]],
                        "institution": row[layout["institution"]],
                        "nums": [to_int(x) for x in row[ns:ns + 6]],
                    })

    if not parsed:
        warnings.append(
            "no district-level rows found — district table not located in this PDF")
        return report_date, [], warnings

    # ---- pass 2: assign divisions BY BLOCK, never by carry-forward ----
    #
    # CALIBRATION NOTE — this is the subtlest bug found in this parser, and
    # the reconciliation check below is what exposed it.
    #
    # The division label lives in a merged cell spanning its whole block of
    # districts. pdfplumber attributes that text to whichever single row the
    # merged cell vertically CENTERS on — which is NOT reliably the first row
    # of the block. In the 2024-03-13 sample the Dhaka label lands on serial 9
    # of a 1-18 block, the Chattogram label on serial 25 of a 24-36 block, and
    # the Barishal label on serial 72 of a 69-76 block, while Khulna, Rajshahi,
    # Rangpur and Sylhet happen to carry theirs on their first row.
    #
    # Carrying the last-seen label forward therefore mis-assigned every row
    # ABOVE the label to the PREVIOUS division — inflating that division by
    # exactly the amount it starved the current one, which showed up in the
    # 2023-10 files as mirrored reconciliation failures (Mymensingh +69 /
    # Chattogram -69, Rangpur +87 / Barishal -87).
    #
    # Blocks are instead delimited structurally: every division's block ends
    # with its own subtotal row (blank serial, blank division, blank
    # district). So rows are buffered until that subtotal, and whichever row
    # in the buffered block carries the label supplies the division for ALL
    # of them, wherever in the block it happened to land.
    rows_raw: list[tuple[str, str, int, int, int, int, int, int]] = []
    block: list[dict] = []
    # (division, subtotal, summed)
    reconciliations: list[tuple[str, int, int]] = []
    seen_serial = False

    def flush_block(subtotal: int | None) -> None:
        nonlocal block
        if not block:
            return
        label = next((r["division_cell"]
                     for r in block if r["division_cell"]), "")
        if not label:
            warnings.append("a division block carried no division label anywhere; "
                            "its rows are recorded with an empty division")
        cur_district = ""
        summed = 0
        for r in block:
            district = r["district"] or cur_district
            cur_district = district
            n = r["nums"]
            tot24h = n[2] or 0
            summed += tot24h
            rows_raw.append((label, district, n[0] or 0, n[1] or 0, tot24h,
                             n[3] or 0, n[4] or 0, n[5] or 0))
        if subtotal is not None:
            reconciliations.append((label, subtotal, summed))
        block = []

    for r in parsed:
        if r["serial"] is None and not r["district"]:
            if r["division_cell"]:
                # A labelled row with no serial and no district. Two cases,
                # separated by position rather than by matching any Bangla
                # word (those drift between font subsets): the "ঢাকা মহানগর"
                # (Dhaka Metro, DNCC+DSCC combined) entity row always appears
                # BEFORE serial no. 1, while the two footer grand-total rows
                # always appear after every district row.
                if not seen_serial and r["nums"][2] is not None:
                    n = r["nums"]
                    rows_raw.append((r["division_cell"], r["division_cell"],
                                     n[0] or 0, n[1] or 0, n[2],
                                     n[3] or 0, n[4] or 0, n[5] or 0))
                continue  # footer grand totals fall through here and are dropped
            # Blank division + blank serial + blank district: this is a
            # division subtotal row, which ends the current block.
            flush_block(r["nums"][2])
            continue
        if r["serial"] is not None and r["nums"][2] is not None:
            seen_serial = True
            block.append(r)
    flush_block(None)  # any trailing block that had no subtotal row

    if not rows_raw:
        warnings.append(
            "district table located but no usable data rows parsed from it")
        return report_date, [], warnings

    # Aggregate: sum every row sharing (division, district). This is what
    # folds a district's own row together with its separately-listed named
    # hospital rows (the 2024+ format) into one true per-district total.
    agg: dict[tuple[str, str], dict] = {}
    for division, district, sark, besark, tot24h, cumtot, cumdeath, cumdis in rows_raw:
        key = (division, district)
        d = agg.setdefault(key, dict(sarkari_24h=0, besarkari_24h=0, admissions_24h=0,
                                     cumulative_total=0, cumulative_deaths=0,
                                     cumulative_discharged=0))
        d["sarkari_24h"] += sark
        d["besarkari_24h"] += besark
        d["admissions_24h"] += tot24h
        d["cumulative_total"] += cumtot
        d["cumulative_deaths"] += cumdeath
        d["cumulative_discharged"] += cumdis

    out = [dict(division=div, district=dist, **vals)
           for (div, dist), vals in agg.items()]

    # Reconciliation: each block's summed district admissions vs the subtotal
    # DGHS printed for that same block. Now that both sides come from the same
    # physically contiguous block, this genuinely tests whether every row was
    # captured and every number read correctly — it is no longer confounded by
    # label placement. Flag, never silently trust either figure.
    for division, subtotal, summed in reconciliations:
        if summed != subtotal:
            warnings.append(f"division '{division}': district rows sum to {summed}, "
                            f"subtotal row says {subtotal}")

    return report_date, out, warnings


FILENAME_DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})$")


def _date_from_filename(path: Path) -> str | None:
    """
    Fallback date source. The filename comes from DGHS's own published URL
    (YYYYMMDD_dengue_all.pdf), so it is the publisher's own labelling of the
    report date — a second attestation of the same fact, NOT an invented
    value. It is still recorded separately in the date_source column so any
    row dated this way is auditable, and a WARN is printed at extraction
    time rather than the substitution happening silently.
    """
    m = FILENAME_DATE_RE.match(path.stem)
    if not m:
        return None
    y, mo, d = m.groups()
    try:
        dt.date(int(y), int(mo), int(d))
    except ValueError:
        return None
    return f"{y}-{mo}-{d}"


def extract(pdf_paths: list[Path], out_path: Path) -> None:
    import csv as _csv
    # Write incrementally, flushing after every PDF. A run over ~1,600 PDFs
    # takes the better part of an hour; buffering everything in memory and
    # writing once at the end meant a failure at file 1,600 lost the lot.
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["date", "division", "district", "sarkari_24h", "besarkari_24h",
                  "admissions_24h", "cumulative_total", "cumulative_deaths",
                  "cumulative_discharged", "source", "date_source"]
    fh = out_path.open("w", encoding="utf-8", newline="")
    writer = _csv.DictWriter(fh, fieldnames=fieldnames)
    writer.writeheader()

    n_rows = 0
    n_ok = 0
    n_warn = 0
    n_filename_dated = 0
    for path in pdf_paths:
        date, rows, warnings = extract_one(path)
        date_source = "pdf_text"
        if not date:
            date = _date_from_filename(path)
            if date:
                date_source = "filename"
                n_filename_dated += 1
                print(f"  {path.name}  WARN  no date line in PDF text; "
                      f"using the DGHS filename date ({date}) instead — "
                      f"recorded as date_source=filename")
            else:
                print(f"  {path.name}  SKIP  no report date in text and "
                      "filename is not a YYYYMMDD date")
                continue
        if warnings:
            n_warn += 1
            for w in warnings:
                print(f"  {path.name}  WARN  {w}")
        if not rows:
            continue
        for r in rows:
            writer.writerow(dict(date=date, source="wayback_dghs_pdf",
                                 date_source=date_source, **r))
            n_rows += 1
        fh.flush()
        n_ok += 1

    fh.close()
    if n_rows == 0:
        sys.exit(
            "FATAL: extracted zero rows from all PDFs. Do not trust an empty dataset.")

    print(f"\nwrote {out_path}  ({n_rows:,} rows from {n_ok} PDFs, "
          f"{n_warn} with reconciliation warnings)")
    if n_filename_dated:
        print(f"  {n_filename_dated} PDF(s) dated from the DGHS filename rather than "
              "the PDF text — filter on date_source=filename to review them")


def probe(pdf_path: Path) -> None:
    """Report what the current heuristics can find. Writes nothing."""
    print(f"\n{'='*70}\n{pdf_path.name}\n{'='*70}")
    with pdfplumber.open(pdf_path) as pdf:
        print(f"pages: {len(pdf.pages)}")
        all_lines: list[tuple[int, str]] = []
        for i, page in enumerate(pdf.pages, 1):
            for ln in (page.extract_text() or "").splitlines():
                n = norm(ln)
                if n:
                    all_lines.append((i, n))

    print(f"non-empty lines: {len(all_lines)}")

    def find(anchors: list[str], label: str) -> None:
        hits = [(p, l) for p, l in all_lines
                if any(strip_marks(a) in strip_marks(l) for a in anchors)]
        print(f"\n[{label}] {len(hits)} hit(s)")
        for p, l in hits[:6]:
            print(f"   p{p}: {l[:100]}")
            nums = numbers_in(l)
            if nums:
                print(f"        numbers: {nums[:12]}")

    find(ANCHOR_GRAND_TOTAL, "national grand total  সর্বমোট")
    find(ANCHOR_DIVISION_TOTAL, "division total  বিভাগের সর্বমোট")
    find(ANCHOR_DHAKA_METRO, "Dhaka metro  ঢাকা মহানগর")
    find(ANCHOR_DHAKA_DIVISION, "Dhaka division  ঢাকা বিভাগ")

    seen: dict[str, int] = {}
    for _, l in all_lines:
        sl = strip_marks(l)
        for k, v in DIVISION_LOOKUP.items():
            if k in sl:
                seen[v] = seen.get(v, 0) + 1
    print(f"\n[divisions matched] {len(seen)}/8")
    for k, v in sorted(seen.items(), key=lambda x: -x[1]):
        print(f"   {k:<12} {v} line(s)")
    missing = set(DIVISION_VARIANTS.values()) - set(seen)
    if missing:
        print(f"   MISSING: {sorted(missing)}")
        print("   -> normalisation is not yet sufficient. Run --dump-text and inspect.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("pdfs", nargs="*",
                   help="PDF paths (default: a sample from raw/dengue)")
    p.add_argument("--dump-text", action="store_true",
                   help="THE FIRST-RUN MODE")
    p.add_argument("--probe", action="store_true")
    p.add_argument("--extract", action="store_true",
                   help="CALIBRATED MODE — parse district-level tables from all given "
                        "PDFs (or all of raw/dengue/*.pdf) into interim/dengue_wayback_district_daily.csv")
    p.add_argument("--sample", type=int, default=4,
                   help="how many PDFs to sample across the range (default 4, ignored for --extract)")
    args = p.parse_args()

    if args.extract:
        # --extract always runs over every PDF in raw/dengue/, not a sample,
        # unless specific paths are given explicitly.
        paths = [Path(x) for x in args.pdfs] if args.pdfs else sorted(
            RAW.glob("*.pdf"))
        if not paths:
            sys.exit(f"No PDFs in {RAW}. Run fetch_dengue_wayback.py first.")
        missing = [p_ for p_ in paths if not p_.exists()]
        if missing:
            sys.exit(f"not found: {missing}")
        out_path = REPO / "interim" / "dengue_wayback_district_daily.csv"
        extract(paths, out_path)
        return

    if args.pdfs:
        paths = [Path(x) for x in args.pdfs]
    else:
        every = sorted(RAW.glob("*.pdf"))
        if not every:
            sys.exit(f"No PDFs in {RAW}. Run fetch_dengue.py first "
                     "(on a machine that can reach DGHS — see ACCESS_NOTES.md).")
        # Spread the sample across the whole range so year-to-year layout drift shows.
        step = max(1, len(every) // max(1, args.sample))
        paths = every[::step][: args.sample]

    missing = [p_ for p_ in paths if not p_.exists()]
    if missing:
        sys.exit(f"not found: {missing}")

    if not (args.dump_text or args.probe):
        print("Pick a mode: --dump-text (start here), --probe, or --extract\n")
        print(__doc__)
        return

    for path in paths:
        if args.dump_text:
            out = dump_text(path)
            print(f"wrote {out}  ({out.stat().st_size:,} bytes)")
        if args.probe:
            probe(path)

    if args.dump_text:
        print(
            f"\nNEXT STEP: share the files in {TEXTDUMP} so the extraction rules")
        print("can be written against real text rather than guessed at.")


if __name__ == "__main__":
    main()
