# RoktoNet blood demand dataset — v1.0

**Frozen 2026-09-23.** Stage 6A of the RoktoNet AI module.

`processed/blood_demand_daily.csv` — 161,984 rows, 2,531 days × 64 districts,
2019-08-27 to 2026-07-31, 30 columns.

---

## 1. What this dataset is, and what it is not

**It is** daily district-level blood demand, in bags, arising from **two named
causes**: dengue and thalassemia. Each carries a low / central / high band derived
from cited clinical conversion rates.

**It is not** total national blood demand. Surgery, obstetrics, oncology, anaemia,
GI bleeding and road trauma are **absent**. Every total in this dataset is a
**lower bound**.

Quote it as *"dengue + thalassemia demand"*. Never as *"blood demand"*.

This scope is the result of a finding, documented in §5.

---

## 2. Naming

**Epidemiologically-grounded blood demand estimation dataset.**

Not "real" — the bag counts are inferred from case counts via conversion rates.
Not "synthetic" — nothing is generated or sampled; every driver is an observed,
published count. The demand figures are *estimates built on observations*, and
that distinction is the whole point of the name.

---

## 3. Schema

| Column | Meaning |
|---|---|
| `date`, `division`, `district` | key; districts match `raw/reference/districts.csv` exactly |
| `dengue_admissions` | observed daily admissions; blank where no source reported |
| `dengue_observed` | `False` = no dengue data that day; the row carries the chronic floor only |
| `dengue_is_estimated` | `True` = division figure apportioned by population, not observed at district grain |
| `dengue_bags_{low,central,high}` | `admissions × transfusion_rate × units_per_transfused_case` |
| `chronic_bags_{low,central,high}` | per-district daily constant, population-apportioned |
| `total_bags_{low,central,high}` | sum of the two streams at the **same** percentile |
| 16 calendar columns | Eid, Ramadan, holidays, weekend, winter fog season, day/week/month indices |

Bounds compose at matching percentiles: `total_low` uses dengue-low **with**
chronic-low. This is deliberately wide. It does not assume the two streams' errors
are independent, because they are not — both rest on the same kind of
literature-derived conversion rate, and a reviewer who doubts one will doubt the
other the same way.

---

## 4. Provenance and verification

### Dengue — the strong part of this dataset

| | |
|---|---|
| Primary source | DGHS daily dengue press releases, 1,639 PDFs |
| Acquisition | Internet Archive CDX API, after `old.dghs.gov.bd` went offline mid-project |
| Coverage | 1,787 of 2,531 days (70.6%); 90.9% of rows observed at true district grain |
| Secondary source | Kaggle division-level series, contributing only the 158 days the PDFs cannot reach |

**Independent verification — none of this can be produced by a parser accidentally:**

- **2023 national total: 321,179 against DGHS's published 321,179. Exact.**
- **Correlation 0.998** with an independent third-party extraction over 435
  overlapping days; daily national totals **identical on 77%** of them.
- Every one of 1,625 PDF-derived days resolves to exactly 65 reporting units
  (64 districts + Dhaka Metro) — which is also what proves the Bangla name mapping
  is correct, since a wrong merge would leave some day short.

### Chronic — the most defensible inputs, the least defensible total

Every input is published and Bangladeshi (Orphanet J Rare Dis 2025): 60–70k
thalassemia patients, 67% transfusion-dependent, 42% of those on a monthly cycle,
1–4 bags per month. Produces a near-constant seasonal floor.

But see §5 — this chain's own central value implies 56% of the entire national
blood supply, which cannot be right.

### Conversion rates

`conversion_rates.yaml`. Every value carries low/central/high and a citation.

One value remains a **modelling choice rather than a citation**:
`dengue.transfusion_rate.central` = 0.22. It sits inside a cited band (0.097 from
observed bleeding rate, 0.426 from observed transfusion rate, same n=225 study),
and it is the single largest un-cited lever in the dataset. Sensitivity analysis
must move it across the whole band.

---

## 5. The finding that set v1's scope

The original design solved a residual stream as
`residual = national_total − sum(other streams)`, and that property was described
as what made the dataset defensible.

**It does not hold.** Two streams alone exceed the published national figure:

| Stream (central) | Annual bags | Share of the 975,000 anchor |
|---|---|---|
| Chronic (thalassemia) | 548,730 | 56.3% |
| Dengue, 2023 | 282,638 | 29.0% |
| **Combined** | **831,368** | **85.3%** |

At high bounds the sum reaches **153%** — the residual goes negative. And the MDPI
review of β-thalassemia in Bangladesh states *"All thalassemia children require at
least one to four bags of blood each month"*, with no 42% narrowing; read that way,
**thalassemia alone is 134% of the entire national anchor.**

These published Bangladeshi figures are mutually inconsistent by more than 1.5×.

**Most probable reading:** 950,000–1,000,000 is a *reported-collections floor*, not
a demand estimate — DGHS itself notes private blood banks do not all report.

**Decision:** no central value was tuned to make the sum fit. The residual stream
was removed, the anchor demoted from reconciliation target to cross-check, and v1
now claims only what it can evidence. A dataset that silently reconciled to a floor
would look tidier and be wrong.

---

## 6. Limitations

1. **v1 totals are a lower bound.** Surgery, obstetrics, oncology, anaemia, GI
   bleeding and trauma are absent entirely.
2. **744 of 2,531 days have no dengue observation** — chiefly a 370-day run
   (2020-01-31 → 2021-02-03) and a 311-day run (2021-02-05 → 2021-12-12), the real
   COVID-era collapse of dengue surveillance reporting. Those rows carry the
   chronic floor only and are flagged `dengue_observed=False`. **Nothing is
   interpolated.** A modelling step may choose to; the dataset does not decide it.
3. **The 2019 outbreak peak is missing.** Coverage starts 2019-08-27, after the
   July–August peak; 127 days totalling 37,691 admissions against a published
   annual 101,354. **2023 is therefore the only fully-captured major outbreak**,
   which directly constrains how train/test can be split.
4. **9.1% of dengue rows are estimated, not observed** — division totals
   apportioned by population share, flagged per row. Within that period Dhaka
   division carries a known distortion: metro cases were part of the division
   total and got spread across all 13 member districts, so some genuinely-Dhaka-city
   cases sit on districts like Tangail.
5. **Population-share disaggregation assumes uniform attack rate within a
   division.** Untrue in practice — a district with a large tertiary hospital draws
   referred cases from neighbours.
6. **`dengue.transfusion_rate.central` is a modelling choice**, not a citation.
7. **Dengue conversion rates are Indian**, not Bangladeshi; no Bangladeshi
   per-patient unit count was found.
8. **Transfusion practice in the region is acknowledged to be over-liberal.** We
   model *observed practice*, not clinical ideal, because RoktoNet must supply what
   hospitals actually request. The low bound shows the clinically-indicated floor.
9. **Unit definitions are not perfectly commensurate.** Dengue figures are
   random-donor platelet units; the national anchor counts whole-blood donations.
   Comparable at the donation level, not at the patient-episode level.
10. **District populations come from Wikipedia articles citing the 2022 census**,
    a secondary source. Reconciles to −0.14% of the BBS national total. Replacing
    with the BBS primary release is a cheap upgrade.

---

## 7. Regenerating

Raw PDFs are gitignored but fully reproducible — `raw/dengue/_manifest.csv` holds
a SHA-256 for each of the 1,639 files.

```bash
python3 scripts/fetch_dengue_wayback.py --contact <email> --delay 1.0   # ~1 hr
python3 scripts/parse_dengue.py --extract                               # ~1 hr
python3 scripts/build_dengue_pdf_district.py
python3 scripts/build_dengue_division.py
python3 scripts/disaggregate_dengue_district.py
python3 scripts/merge_dengue.py
python3 scripts/build_calendar.py
python3 scripts/build_chronic.py
python3 scripts/build_blood_demand.py
```

Every build script fails loudly rather than writing suspect output.

---

## 8. Deferred to v1.1

- Trauma / road traffic. Its three conversion rates are unsourced, and its sources
  disagree by ~45% on the same Eid period (RSF vs BPWA), so it needs a genuine
  multi-source reconciliation design.
- Obstetric stream — never scoped.
- Surgical / oncology / anaemia demand.
- Blood-component split. v1 treats demand as whole-blood-equivalent bags;
  `raw/reference/blood_type_shares.yaml` carries the ABO/Rh distribution
  (Karim, Hoque et al., n=39,512) for when the split is added.
