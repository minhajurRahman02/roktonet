// Notes an NGO writes against a date on its scheduler calendar.
//
// Deliberately a small, self-contained file. A note is not part of any
// drive: it can exist on a date with no drive at all, which is most of
// the point ("call the school about the hall" on a date before anything
// is booked). Attaching these to routes/drives.js would have implied a
// relationship that does not exist.
//
// Scope is the ORGANIZATION, always taken from the authenticated user
// and never from the request body. There is no way to read or write
// another NGO's notes, because org_id is never a parameter.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const MAX_NOTE_LENGTH = 2000;

// Anchors a YYYY-MM-DD string. Rejecting anything else keeps a
// malformed date from reaching Postgres and coming back as a 500.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const d = new Date(`${value}T00:00:00Z`);
  // Catches 2026-02-31, which the regex is happy with.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// GET /api/drive-notes?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// A range rather than one date per call, because the calendar renders a
// whole month at once. Fetching 31 dates individually would be 31 round
// trips to paint one screen.
router.get('/', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) {
    return res.status(400).json({ error: 'from and to are required, as YYYY-MM-DD dates' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must not be later than to' });
  }
  if (!req.user.org_id) {
    return res.status(400).json({ error: 'Your account is not linked to an organization' });
  }

  try {
    const result = await pool.query(
      `SELECT note_id, to_char(note_date, 'YYYY-MM-DD') AS note_date, body, updated_at
         FROM drive_notes
        WHERE org_id = $1 AND note_date BETWEEN $2 AND $3
        ORDER BY note_date`,
      [req.user.org_id, from, to]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drive-notes/:date  { body }
//
// PUT rather than POST, and one note per date, so saving is idempotent:
// the calendar opens a date, shows whatever is there, and saving
// replaces it. An empty body deletes the note, which is what clearing
// the box and pressing save plainly means.
//
// ON CONFLICT does the create-or-update in one statement. A
// read-then-decide would race two people in the same NGO editing the
// same date, and the unique constraint would turn the loser into a 500.
router.put('/:date', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD form' });
  }
  if (!req.user.org_id) {
    return res.status(400).json({ error: 'Your account is not linked to an organization' });
  }

  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (body.length > MAX_NOTE_LENGTH) {
    return res.status(400).json({ error: `A note can be at most ${MAX_NOTE_LENGTH} characters` });
  }

  try {
    if (!body) {
      await pool.query('DELETE FROM drive_notes WHERE org_id = $1 AND note_date = $2', [
        req.user.org_id,
        date,
      ]);
      return res.json({ note_date: date, body: null, deleted: true });
    }

    const result = await pool.query(
      `INSERT INTO drive_notes (org_id, note_date, body, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id, note_date)
       DO UPDATE SET body = EXCLUDED.body, updated_at = now()
       RETURNING note_id, to_char(note_date, 'YYYY-MM-DD') AS note_date, body, updated_at`,
      [req.user.org_id, date, body, req.user.user_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
