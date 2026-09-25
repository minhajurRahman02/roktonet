-- RoktoNet - refinement round (2026-09-25)
--
-- Two unrelated changes that happen to ship together:
--   A. patient identification on requests
--   B. organization uniqueness
--
-- Idempotent, like every other migration here. Run it in the Supabase SQL
-- Editor, top to bottom. Section B has a check you must read the output of
-- before continuing -- it is marked.


-- =========================================================================
-- A. Patient identification on requests
-- =========================================================================
--
-- WHY NULLABLE, WHEN THE FIELDS ARE MANDATORY
--
-- Every request that already exists genuinely has no patient recorded. A
-- NOT NULL column would force a default, and any default here would be
-- invented clinical data sitting in a table people are meant to trust. So
-- the columns are nullable at the schema level and the mandatory rule is
-- enforced in POST /api/requests for new requests only. An old request
-- showing no patient is telling the truth.
--
-- WHY THESE FIELDS CANNOT AFFECT ALLOCATION
--
-- They are display-only, and that is guaranteed structurally rather than by
-- discipline. services/engineClient.js builds the solver's payload with an
-- explicit column list:
--
--   SELECT request_id, org_id, blood_type, component, quantity, urgency_tier
--   FROM requests WHERE fulfillment_path IS NULL AND cancelled_at IS NULL
--
-- These three columns are not in it, so the optimization engine cannot read
-- them even by accident. Changing that line to SELECT * is the only way to
-- break the guarantee, which is why it carries a comment saying so.
--
-- WHO CAN READ THEM
--
-- The requesting hospital and admin. Supplying blood banks and NGOs see the
-- request exactly as they do today (blood type, quantity, urgency, hospital
-- name) with no patient data -- GET /api/allocations in its outgoing
-- direction deliberately does not select these columns. A bank has no
-- clinical involvement with the recipient, and PII cannot be un-shared.

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS patient_name  TEXT,
  ADD COLUMN IF NOT EXISTS patient_phone TEXT,
  ADD COLUMN IF NOT EXISTS patient_note  TEXT;

-- The hospital allocation log searches by patient name across every request
-- the hospital has ever made. Without this that is a sequential scan of the
-- whole table on every keystroke.
CREATE INDEX IF NOT EXISTS idx_requests_patient_name
  ON requests (org_id, lower(patient_name));


-- =========================================================================
-- B. Organization uniqueness
-- =========================================================================
--
-- The rule, as specified:
--   - same name is allowed, but then the district must differ
--   - same name AND district is allowed, but then the thana must differ
--   - contact email must be unique across all organizations, always
--
-- Both are enforced twice on purpose. routes/organizations.js checks first
-- and returns a readable 409; these indexes are the actual guarantee, because
-- a check-then-insert in application code has a race between the two
-- statements that two admins submitting at once can lose.
--
-- Matching is case-insensitive. "Dhaka Medical" and "dhaka medical" in the
-- same thana are the same organization typed by two different people, and a
-- case-sensitive constraint would cheerfully accept both.
--
-- COALESCE(thana, '') is needed because NULL is never equal to NULL in an
-- index, so two rows with the same name and district and no thana would not
-- collide without it. Thana is mandatory for new organizations from now on,
-- but rows created before this migration may have none.

-- -------------------------------------------------------------------------
-- READ THIS OUTPUT BEFORE RUNNING THE CREATE INDEX STATEMENTS BELOW.
--
-- You said to ignore organizations that already exist and apply the rule
-- only to new ones. A unique index cannot do that: it validates every
-- existing row when it is created, and will fail outright if any pair
-- already collides. These two queries list exactly which rows would cause
-- that failure. If both return zero rows, the indexes create cleanly and
-- you get the real guarantee. If either returns rows, either fix those
-- organizations first or skip the two CREATE INDEX statements and rely on
-- the application-level checks alone -- which is weaker, but not nothing.
-- -------------------------------------------------------------------------

-- Duplicate identity (name + district + thana)
SELECT lower(name) AS name, district, COALESCE(thana, '') AS thana, COUNT(*) AS copies
  FROM organizations
 GROUP BY lower(name), district, COALESCE(thana, '')
HAVING COUNT(*) > 1;

-- Duplicate contact email
SELECT lower(contact_email) AS contact_email, COUNT(*) AS copies
  FROM organizations
 WHERE contact_email IS NOT NULL AND contact_email <> ''
 GROUP BY lower(contact_email)
HAVING COUNT(*) > 1;

-- -------------------------------------------------------------------------
-- The constraints themselves. Run these only after the two queries above
-- came back empty.
-- -------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_identity
  ON organizations (lower(name), district, COALESCE(thana, ''));

-- Partial index: organizations with no contact email yet are common and
-- must not collide with each other, so only real addresses are constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_contact_email
  ON organizations (lower(contact_email))
  WHERE contact_email IS NOT NULL AND contact_email <> '';
