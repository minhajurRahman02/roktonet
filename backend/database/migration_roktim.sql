-- RoktoNet - Roktim advisory log (Phase 6E)
--
-- ONE table, and it is deliberately an island.
--
-- The Roktim design has to pass a removability test: taking the module out
-- means dropping one table, deleting one route file and deleting one frontend
-- folder, with nothing else changed and nothing broken. A foreign key from
-- here into `requests` would fail that test, because dropping this table would
-- then be a schema change to the requests table's dependents, and because a
-- request could no longer be deleted while an advisory referenced it. So
-- request_id is a plain UUID column with NO constraint: it records which
-- request was being advised on, and if that request ever disappears the
-- advisory is simply orphaned rather than blocking anything.
--
-- ORGANISATION ONLY, NEVER user_id.
-- The audit question worth answering is "which hospital was advised what",
-- not "which member of staff clicked". A per-person activity log inside a
-- hospital system raises consent and retention questions this project has no
-- need to answer, so the column does not exist and cannot later be filled in
-- by accident.
--
-- MODEL PROVENANCE ON EVERY ROW.
-- model_schema_version and model_generated record WHICH artefact produced the
-- advisory. Without them, regenerating forecast_model.json would silently
-- rewrite the meaning of the entire history: old rows would appear to have
-- been produced by the new calibration. With them, a recalibration is visible
-- as a change of version partway down the table.
--
-- Idempotent, like every other migration here, so a re-run is harmless.

CREATE TABLE IF NOT EXISTS roktim_advisories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- No REFERENCES clause. See the note above; this is intentional.
  request_id            UUID NULL,

  org_id                UUID NOT NULL,
  district              TEXT NOT NULL,
  needed_by_date        DATE NOT NULL,
  horizon_weeks         SMALLINT NOT NULL,

  -- observed_recent | seasonal_historical
  basis                 TEXT NOT NULL,
  -- normal | elevated | high | unavailable
  demand_outlook        TEXT NOT NULL,

  -- All three are NULL on the seasonal path, where the demand-pressure signal
  -- genuinely does not exist. A zero here would be a fabricated reading.
  pressure_ratio        NUMERIC NULL,
  seasonal_normal_adm   NUMERIC NULL,
  projected_upper_adm   NUMERIC NULL,

  at_risk               BOOLEAN NOT NULL,

  model_schema_version  SMALLINT NOT NULL,
  model_generated       DATE NOT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The log is read newest-first on the admin page, and filtered by district
-- more often than by anything else.
CREATE INDEX IF NOT EXISTS idx_roktim_advisories_created
  ON roktim_advisories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roktim_advisories_district_created
  ON roktim_advisories (district, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roktim_advisories_org
  ON roktim_advisories (org_id, created_at DESC);

-- Enum-style guards as CHECK constraints rather than Postgres ENUM types:
-- adding a value to an ENUM is a migration, adding one to a CHECK is a
-- migration too, but the CHECK version never needs a type cast and reads
-- plainly in \d output. Wrapped so a re-run does not error on an existing
-- constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roktim_basis_chk') THEN
    ALTER TABLE roktim_advisories ADD CONSTRAINT roktim_basis_chk
      CHECK (basis IN ('observed_recent', 'seasonal_historical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roktim_outlook_chk') THEN
    ALTER TABLE roktim_advisories ADD CONSTRAINT roktim_outlook_chk
      CHECK (demand_outlook IN ('normal', 'elevated', 'high', 'unavailable'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roktim_horizon_chk') THEN
    ALTER TABLE roktim_advisories ADD CONSTRAINT roktim_horizon_chk
      CHECK (horizon_weeks IN (1, 2, 4));
  END IF;
END $$;
