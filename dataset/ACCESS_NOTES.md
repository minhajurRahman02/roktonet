# Stage 6A — Access notes and findings

Written 2026-09-21, updated 2026-09-22 (see §8 and §9 for what changed). Read this
before running anything.

---

## RESOLVED as of 2026-09-23 — the dengue PDF stream is DONE

`interim/dengue_pdf_district_daily.csv` — **105,625 rows, 1,625 days
(2021-12-13 .. 2026-07-31), true district grain (64 districts + Dhaka Metro),
100% of days complete.** The 2023 national total reproduces DGHS's published
321,179 exactly, and the series correlates at 0.998 with an independent
third-party extraction. Full evidence table in SOURCES.md.

Five things had to be solved to get there, each one found only by running
against real files rather than reasoning about them (§10 records them, because
the sequence is itself a methods finding worth reporting):

  1. The primary source went offline mid-project; recovered via the Internet
     Archive CDX API (§8).
  2. Bangla header text is unstable across font subsets — the SAME header
     renders with different letters by era, so the table had to be located by
     digits and column position instead (§10).
  3. The date line sits on a different page in each era and sometimes uses
     Bangla digits.
  4. Merged division-label cells attach to a vertically-centred row, not the
     first row of their block, which silently mis-assigned districts to the
     wrong division until block-based assignment replaced carry-forward (§10).
  5. 166 distinct Bangla strings for 65 districts, resolved by row position
     rather than fuzzy matching (§11).

**The parser's `division` column is still damaged on ~37% of files** (late-era
per-district subtotal rows split its blocks). This is deliberately NOT fixed:
division is re-derived from district via `districts.csv` downstream, so the
damaged label never reaches the dataset. The district rows themselves are
unaffected — which is what the verification above establishes.

---

## 0. Status as of 2026-09-22 — read this first

Two things below (§1, §2, §6) describe the *original* plan, which the team's own
testing has since overtaken:

- **`old.dghs.gov.bd` is dead**, confirmed by direct browser test, not just a
  workspace network block. `fetch_dengue.py`'s deterministic archive-route
  acquisition is obsolete. See §8.
- The dengue stream is being rebuilt from two sources instead: the **Wayback
  Machine** (`fetch_dengue_wayback.py`, recovering the same PDFs the dead route
  would have served, 2021-12-13 onward) and a **Kaggle division-level CSV**
  covering 2019-08-27..2023-08-21 (`build_dengue_division.py` +
  `disaggregate_dengue_district.py`). See §8 and §9.

§1–§7 are kept for their still-accurate parts (the workspace blocker in general, the
parser structural notes in §3, the chronic-baseline finding in §4, the Nilphamari fix
in §5) but the dengue acquisition plan specifically (§2, §6) is superseded.

---

## 1. The blocker: source acquisition cannot happen in the cloud workspace

The cloud workspace routes all outbound traffic through an egress allowlist. Every
primary data source for this dataset is denied at the gateway.

Probed directly, with the gateway's own failure log as evidence:

| Host | Result |
|---|---|
| `dghs.gov.bd` | 403 CONNECT — policy denial |
| `old.dghs.gov.bd` | 403 CONNECT — policy denial |
| `denguereports.dghs.gov.bd` | 403 CONNECT — policy denial |
| `objectstorage.ap-dcc-gazipur-1.oraclecloud15.com` (serves the PDFs) | unreachable |
| `data.mendeley.com` | 403 CONNECT — policy denial |
| `kaggle.com`, `zenodo.org`, `figshare.com`, `data.humdata.org`, `who.int`, `reliefweb.int` | all unreachable |

Reachable: `pypi.org`, `raw.githubusercontent.com`, and repo-scoped GitHub only.
The GitHub search API is also denied ("sessions are bound to their configured
repositories"), so mirror-hunting on GitHub is not possible either.

The web-fetch tool reaches the **new** `dghs.gov.bd` portal but not `old.dghs.gov.bd`
(its robots.txt fetch times out). Even where it works it returns model-extracted text
rather than the PDF bytes, one page per call. For ~2,580 PDFs that is not a route.

**Consequence:** `fetch_dengue.py` must be run on a team machine with ordinary
internet access. Nothing else in Stage 6A depends on the workspace.

---

## 2. Two URL regimes, and the convenient one is the older one

**Archive route, on or before 2026-09-03** — fully deterministic, no scraping:

```
https://old.dghs.gov.bd/images/docs/vpr/YYYYMMDD_dengue_all.pdf
```

This covers 2019-08-27 through 2026-09-03, which is the entire training period.
`fetch_dengue.py` implements this route.

**Live route, after 2026-09-03** — the new portal serves PDFs from Oracle object
storage under **random UUIDs**:

```
https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-dghs/2026/8/b098cd3d-0674-48f6-95c9-818b38ecd6c6.pdf
```

There is no derivable URL. The listing at `dghs.gov.bd/pages/miscellaneous-infos`
must be scraped to recover the date → UUID mapping. Not implemented yet; it is only
needed to keep the dataset current after the training cut, not to build v1.

Also note the live listing sometimes carries **two PDFs for the same date**. Decide
which is canonical before ingesting, rather than silently taking the first.

---

## 3. The reference parser is weaker than the roadmap assumed

The roadmap said to adapt `github.com/sps1590/dengue_daily_report` rather than write
a parser. Having read its source and README, two things change that assessment.

**It has never been run against a real PDF.** Its own README states DGHS blocks
automated fetches of `/images/docs/vpr/` via robots.txt, so it could not be tested
from its author's development sandbox either. It is untested code.

**It targets division-level output, not district-level.** Its functions
(`chartValuesByArea`, `districtTableDivisionTotals`) read the district table only to
recover division grand totals. Our dataset needs district grain. District extraction
is therefore **new work, not inherited work**, and carries its own risk.

What it does give us, and this is genuinely valuable, is the structural map:

- The PDF is a BI-dashboard export, not a clean table. Values are positioned
  graphics; column alignment is unreliable and reading order matters more than layout.
- Page 1 charts admissions and deaths per division.
- Discharged and "currently admitted" per division appear much further down, inside a
  district-by-district table that rolls up into per-division grand-total rows.
- Division grand-total rows are matched by their 24-hour admission figure, cross-checked
  against the cumulative admitted figure, because a smaller district subtotal can
  coincidentally share the same 24h count.
- Dhaka North and Dhaka South City Corporations are never separated. They appear only
  as a combined `ঢাকা মহানগর` figure.

**Bangla text hazard.** The reference source carries three spellings of Chattogram
(`চট্টগ্রাম` / `চট্টগ্ৰাম` / `চট্রগ্রাম`), two of Rajshahi (`রাজশাহী` / `রাজশাহি`), and a mangled
`সববম ট` where `সর্বমোট` belongs. That last one is the tell: conjunct glyphs break during
text extraction. All matching must run on normalised text. `parse_dengue.py` implements
NFC normalisation plus zero-width stripping plus combining-mark removal, and its
self-test confirms all five variants above collapse correctly.

---

## 4. Finding: the chronic baseline strains against the national anchor

`build_chronic.py` ran cleanly and produced a result that needs a decision, not a tweak.

Chain, every link cited (Orphanet J Rare Dis 2025):
65,000 patients × 0.67 transfusion-dependent × 0.42 on a regular monthly cycle
× 2.5 bags/month = **45,728 bags/month = 548,730 bags/year**.

Against the DGHS national annual requirement of 950,000–1,000,000 bags:

| Bound | Share of national requirement |
|---|---|
| low | 20.3% |
| central | **56.3%** |
| high | **99.5%** |

Thalassemia alone consuming 56% of national blood supply is implausible, and the high
bound consuming essentially all of it is impossible. One of these is wrong:

1. `bags_per_patient_month` central of 2.5 is too high as a population average. The
   source's "one to four bags every month" likely describes the upper tier of patients,
   and the 0.67 × 0.42 chain has already narrowed to 28% of patients.
2. The national anchor is a severe undercount. The same source that gives the 1M figure
   notes private blood banks do not all report to DGHS and that experts believe actual
   demand is much higher.

Both are probably true to some degree. **This is exactly what the A13 reconciliation
step exists to resolve, so it has been recorded rather than tuned away.** Do not adjust
the central value to make the number look better; resolve it with a sourced decision
and write the reasoning into `DATASET.md`.

---

## 5. Finding: caught a bad population figure

The district table initially extracted Nilphamari at 3,092,567. The national sum came
to +0.46% over the BBS 2022 census and Rangpur division ran about 1M high. Checked
against the district's own record: the true 2022 figure is **2,092,568** — a leading-digit
error. Corrected.

After correction: national sum 164,924,748 against the census 165,158,616 (**−0.14%**),
and Rangpur division 17,610,957 against a published ~17.6M. Both reconcile.

This is the validation discipline working as intended, and it is worth noting in the
paper: the reconciliation checks are not ceremony, they caught a real error on the
first pass. `build_chronic.py` now refuses to run if the population sum drifts more
than 1% from the census.

---

## 6. What the team must run

One task, on a machine in Bangladesh with normal internet.

**Step 1 — sanity check, 20 PDFs, about a minute.**

```bash
cd dataset
python3 scripts/fetch_dengue.py \
    --start 2023-08-01 --end 2023-08-20 \
    --contact <a-real-email> --delay 2.0
```

Confirm files land in `raw/dengue/` and `_manifest.csv` shows status 200.

**Step 2 — dump the text layer. This is the deliverable.**

```bash
python3 scripts/parse_dengue.py --dump-text --sample 4
```

Share the files written to `reports/pdf_text/`. The extraction rules can then be
written against real text in one pass instead of guessed at over several. Pick PDFs
from different years — layout drifts between seasons and the sample should show it.

**Step 3 — only after the rules are calibrated, the full pull.**

```bash
python3 scripts/fetch_dengue.py \
    --start 2019-08-27 --end 2026-09-03 \
    --contact <a-real-email> --delay 2.0
```

About 2,580 dates at 2s each: roughly 90 minutes. It resumes if interrupted, so
re-running the same command is safe. Expect gaps — DGHS does not publish every day
year-round. The gap report records them; they are not errors and must not be filled.

### Etiquette, which is the team's call and the team's responsibility

DGHS's robots.txt disallows the `/images/docs/vpr/` path. `fetch_dengue.py` defaults
to a 2-second delay, never parallelises, resumes rather than re-downloading, and sends
a User-Agent naming the project and a contact address. Set `--contact` to a real
address. Downloading public health bulletins for academic research is a reasonable
use, but if DGHS asks you to stop, stop.

---

## 7. Stage 6A status (superseded by §8/§9 below — kept for the steps unaffected)

| Step | State |
|---|---|
| A1 scaffolding | done |
| A2 dengue acquisition | ~~blocked~~ — `old.dghs.gov.bd` confirmed dead, see §8 |
| A3 dengue parsing | diagnostic mode written; rules still await real text (now from Wayback-recovered PDFs) |
| A4 dengue validation | blocked on A3 |
| A5 district normalisation | **done for the Kaggle stream** (population-share disaggregation, see §9); awaits A3 for the Wayback stream |
| A6–A7 trauma | blocked — Mendeley unreachable from workspace |
| A8 calendar features | **done and validated** |
| A9 chronic baseline | **done**, with the reconciliation tension in §4 recorded |
| A10 conversion rates | drafted with citations; 4 values still unsourced |
| A11 blood type shares | **done** |
| A12–A14 assembly, validation, freeze | blocked on merging the two dengue sources, which is blocked on A3 |

---

## 8. Finding: `old.dghs.gov.bd` is dead, and the Wayback recovery that replaced it

Confirmed 2026-09-22 by the team testing the URL directly in a browser: the site is
genuinely offline, not slow or blocked only from the workspace. `fetch_dengue.py`'s
deterministic URL-pattern route (`old.dghs.gov.bd/images/docs/vpr/YYYYMMDD_dengue_all.pdf`)
is obsolete for acquisition. Its manifest format and scraping etiquette (delay,
resumable manifest, contact User-Agent) were reused rather than discarded.

**Recovery: `scripts/fetch_dengue_wayback.py`**, querying the Internet Archive's CDX
API (`https://web.archive.org/cdx/search/cdx`, public, documented, no key) for every
capture under the same URL prefix, filtered server-side to `mimetype:application/pdf`
so error-page captures (some rows under the prefix are `text/html`, almost certainly
404s captured after the site started failing) are excluded before download rather
than silently ingested as PDFs.

Team's `--list-only` run (2026-09-22):
```
16,301 application/pdf captures returned
5,857 distinct URLs after collapsing to earliest capture
1,640 match the daily dengue report filename pattern
3,019 are other file types under the same prefix (excluded)
date coverage: 2021-12-13 .. 2026-07-31  (1,640 of 1,692 days, 97% density)
```
The team then launched the full download (`--contact teamhoneybadgeruiu@gmail.com
--delay 1.0`); as of the last update to this file it was in progress ("1640 files
are fetching in the terminal"). **Completion not yet confirmed.**

This recovery only reaches back to 2021-12-13 — the Wayback Machine's earliest PDF
capture of this prefix. Everything before that (2019-08-27..2021-12-13) is not
recoverable through this route, hence §9.

---

## 9. Finding: Kaggle fills the pre-2021-12 gap, but only at division grain

A Kaggle dataset titled "district-wise dengue dataset for Bangladesh"
(`kaggle.com/datasets/shampabanik12/district-wise-dengue-dataset-for-bangladesh`)
covers 2019-08-27..2023-08-21 — exactly the span the Wayback recovery cannot reach,
plus an 18-month overlap with it. Its own description states it was built from
DGHS's daily press releases, the same primary source this whole pipeline targets,
extracted by someone else before the source went offline.

**Its name is a misnomer.** Direct inspection found exactly 8 distinct location
strings — Bangladesh's 8 divisions, not its 64 districts. Verified clean before
being trusted: 4,776 rows = 597 reported dates × 8 divisions exactly, zero
duplicate (division, date) pairs, zero negative counts, mixed date formats parse
with zero failures under `pd.to_datetime(format='mixed', dayfirst=True)`.

**Reporting density finding.** Only 597 of 1,456 calendar days in the span (41.0%)
have a report at all — recorded in `reports/dengue_kaggle_gap_report.csv`, not
filled. Breaking the reported dates down by year (2019=127, 2020=30, 2021=19,
2022=188, 2023=233) surfaces a real, citable pattern rather than random
missingness: a COVID-era collapse in dengue-surveillance reporting, with the two
largest single gaps being 371 days (2020-01-30→2021-02-04) and 312 days
(2021-02-04→2021-12-13). This means 2020 through most of 2021 will stay
thin-coverage in the final merged dataset even after the Wayback stream is added,
since Wayback's own earliest capture is 2021-12-13 — the gap in one source lines
up almost exactly with the start of the other. Disclosed as a dataset limitation,
not worked around.

**Division-to-district disaggregation — explicit team decision, not a default.**
Presented as an AskUserQuestion with the trade-off spelled out; the team chose
population-share disaggregation over leaving the stream at division grain or
waiting for the (still uncalibrated) Wayback PDF parser to possibly deliver true
district grain. Implemented in `scripts/disaggregate_dengue_district.py`:

- Built `interim/dengue_division_daily.csv` first (`scripts/build_dengue_division.py`),
  which caught and required fixing a bug — the initial version assumed every
  calendar day in the span should report all 8 divisions and hard-failed
  (`FATAL: 4776 rows, expected 11648`). Recognised as a real reporting-density
  characteristic, not a data error, and fixed by checking only that *reported*
  dates carry all 8 divisions (still a hard failure otherwise), with the
  every-calendar-day gap tracked separately in the gap report instead.
- Each district's share of its division's population (not its national share) is
  computed from `raw/reference/districts.csv`, then applied to the division's
  observed daily admissions: `admissions_est = admissions_observed × share_within_division`.
- Ran cleanly 2026-09-22: **38,208 rows**, 2019-08-27..2023-08-21, all 64
  districts. Self-check re-sums district estimates back to division totals:
  **max |reconstructed − original| = 0.0003 admissions (PASS)**.
- Every output row carries `disaggregation_method = "population_share_within_division"`
  plus both the district estimate and the original division-level observation, so
  the modelling assumption is never hidden from anything built downstream.
- **Known limitation, disclosed not corrected:** this assumes uniform dengue attack
  rate within a division. It isn't literally true — a district with a large
  tertiary hospital draws referred cases from neighbouring districts, inflating its
  apparent share relative to true local incidence. No sub-division data exists for
  most of the range to correct for this, so it stands as a stated assumption.

**Still pending:** merging this Kaggle-derived district series with whatever the
Wayback-recovered PDFs eventually yield (§8) into one coherent dengue time series,
which cannot happen until `parse_dengue.py --dump-text` is run against real
recovered PDFs and the extraction rules are calibrated against them. The
2021-12..2023-08 overlap between the two sources remains a planned cross-validation
opportunity once that happens.

The critical path now runs through the Wayback PDF parser calibration, which needs
the team's `--dump-text` output — not yet received.

---

## 10. Finding: the parser had to stop reading Bangla to work

Four successive attempts to anchor the district table on Bangla header strings
each worked on the era they were calibrated against and silently matched nothing
on the others. The cause: the PDFs embed different font subsets across eras, and
the same header renders with different letters.

| era | "Division" | "Serial No." | "Institution name" | "District" |
|---|---|---|---|---|
| 2021, 2023, 2025 | রেভাগ | ক্রর ক নিং | প্ররতষ্ঠামনি না | বজলা |
| 2022 | তেভাগ | ক্রত ক নিং | প্রতিষ্ঠামনর না | বজলা |
| 2024 | রেভাগ | ক্রর ক নিং | প্ররতষ্ঠামনি না | **বিলা** |

The `ি` vowel sign collapses into `র` in one subset and `ত` in another. No
Bangla string in the header is stable.

**Digits are stable** — they have to be, or the data values themselves would be
unreadable. So the table is now located structurally: find the column carrying
the `২৪ ঘন্টায়` (last 24 hours) group label, and count the label columns before
it. The district table has FOUR (division, serial, district, institution); the
hospital table on pages 2-3 has TWO. All downstream column offsets are derived
from that position rather than hardcoded. Validated against header rows from all
five eras plus three decoys.

**The subtler bug, and the check that caught it.** Division labels live in merged
cells; pdfplumber attributes the text to whichever row the merged cell vertically
centres on, which is NOT reliably the block's first row. In the 2024 sample the
Dhaka label lands on serial 9 of a 1-18 block and the Barishal label on serial 72
of a 69-76 block. Carrying the last-seen label forward therefore charged every
row above the label to the PREVIOUS division — inflating it by exactly the amount
it starved the current one. It surfaced as mirrored reconciliation failures
(Mymensingh +69 / Chattogram −69, Rangpur +87 / Barishal −87) and would otherwise
have produced a clean-looking CSV with quietly wrong division totals.

Fixed by delimiting blocks on their subtotal rows and taking whichever row in the
block carries the label. **This is the single strongest argument for the
reconciliation check: without it, the error was invisible.**

---

## 11. Finding: 166 Bangla strings for 65 districts

The same font drift hits the district names themselves. Faridpur appears as
ফরিদপুি, ফরিদপযি and ফতরদপুর; Munshiganj has six variants.

Automatic character-folding was tried FIRST and **rejected**: it merged মাগুরা
(Magura) with বগুড়া (Bogura). Two different districts collapsing silently is
precisely the failure this dataset cannot absorb, so the mapping is explicit and
auditable in `raw/reference/district_name_variants.yaml`.

Assignment used row position, which needs no glyph reading at all: the table
order is fixed and every file yields exactly 65 rows, so position identifies the
district directly. 57 of 65 positions are stable across every era. The exception
is the Chattogram block (positions 20-27), where DGHS genuinely reordered
districts between eras — visible in the 2024 sample, whose serial numbers run out
of sequence (24, 35, 25, 28, 26, 27, 29, 33, 30…). Those eight were mapped by
reading the strings, with position as a cross-check.

**The mapping is falsifiable, and was falsified-tested:** a wrong merge would
leave at least one date with fewer than 65 distinct districts. All 1,625 dates
resolve to exactly 65. `build_dengue_pdf_district.py` asserts this and refuses to
write output otherwise.

---

## 12. What is still open on this stream

- **2024 is 6.5% below the published annual figure** (94,587 vs 101,214), from
  97% day coverage plus three unparseable files (2024-07-29..31). Recorded, not
  adjusted. Worth one attempt to re-fetch those three from Wayback.
- **One impossible date**, `2024-16-06` — a month/day transposition in a single
  source PDF. 65 rows dropped and recorded rather than guessed at.
- **Nine duplicate report dates**, first occurrence kept.
- **Merging with the Kaggle stream.** The PDF series starts 2021-12-13; Kaggle
  covers 2019-08-27 .. 2023-08-21 at division grain. The PDF series is the better
  source wherever both exist (true district grain vs population-share estimate),
  so Kaggle's unique contribution is 2019-08 .. 2021-12. Their 435-day overlap
  agrees at 0.998 correlation, which is what licenses joining them at all.