# Backend correctness patches

Five surgical edits. Each one gives the exact block to find and the exact block to
replace it with. These files are long and I only needed to change one region of each,
so regenerating them whole would have risked me quietly dropping an unrelated line.

`services/eligibility.js`, `services/engineClient.js`, `routes/donors.js` and
`utils/pagination.js` ship as complete files instead, because the changes there are
extensive enough that a patch would be harder to apply than a replacement.

**`utils/pagination.js` is a new directory.** Create `backend/utils/` if it does not
exist.

Apply all five before running migrations 13 and 14.

---

## P1. `routes/admin/users.js` — role and organization type must agree

**Your bug 2.** The route validated that the role is org-bound and that the org row
exists, then stopped one check short: it never compared the organization's `org_type`
to the user's `role`. So an `ngo` user could be assigned to a `hospital` organization,
and the User Detail bundle would then branch on `role === 'ngo'` and fetch inventory
and blood drives for an org that is actually a hospital.

Find (around line 219):

```js
    if (org_id) {
      const org = await pool.query('SELECT org_id FROM organizations WHERE org_id = $1', [org_id]);
      if (org.rows.length === 0) return res.status(400).json({ error: 'Organization not found' });
    }
```

Replace with:

```js
    if (org_id) {
      const org = await pool.query('SELECT org_id, name, org_type FROM organizations WHERE org_id = $1', [org_id]);
      if (org.rows.length === 0) return res.status(400).json({ error: 'Organization not found' });

      // 7.7a: the role and the organization's type have to agree.
      //
      // Checking that the role is org-bound and that the org exists was
      // never enough -- both were true for an ngo user pointed at a
      // hospital. Nothing rejected it, and the damage showed up later and
      // somewhere else: the User Detail bundle branches on role, so an
      // "ngo" user on a hospital org gets queried for inventory and blood
      // drives that organization does not have, and the fairness
      // analytics attribute its units to the wrong class of org.
      //
      // Role cannot be edited here by design (spec 2.2), so the role is
      // always the fixed side of this comparison and the org is the side
      // being chosen. The error names both, because "invalid" on its own
      // does not tell an admin which of the two they got wrong.
      const EXPECTED_ORG_TYPE = { hospital: 'hospital', bank: 'blood_bank', ngo: 'ngo' };
      const expected = EXPECTED_ORG_TYPE[target.role];
      if (org.rows[0].org_type !== expected) {
        return res.status(400).json({
          error: `A ${target.role} account must belong to a ${expected} organization, `
               + `but "${org.rows[0].name}" is a ${org.rows[0].org_type}. `
               + `Role cannot be changed on an existing account, so pick a ${expected} organization instead.`,
        });
      }
    }
```

---

## P2. `routes/requests.js` — cancelling after dispatch

**Your bug 4.** Two things were wrong, and one thing was not.

Not wrong: units already dispatched or delivered were never released. The release only
ever targeted `status = 'reserved'`. What you most likely saw was a **partially
dispatched** request, where one unit had gone and one was still reserved: the reserved
one is released and the banner reports it, which reads like the dispatched request gave
units back.

Wrong: there was no guard at all. A request whose blood is already in the hospital's
fridge could be cancelled, the hospital notified that their request was cancelled, and
the row hidden from the default list.

> **I withdrew part of this patch.** In my findings I flagged that `logAdminAction`
> runs after `COMMIT`, so a crash in between leaves a cancellation with no audit entry,
> and I said I would move it inside the transaction. Then I read
> `services/adminAudit.js`, and that placement is deliberate, not an oversight: the
> module never throws, specifically so an audit-write failure cannot roll back or mask
> the admin action it is recording.
>
> Moving it inside would invert that. Postgres marks a transaction failed after any
> error in it, so an audit INSERT that failed would poison the transaction and make the
> following `COMMIT` fail, rolling back a cancellation because its *logging* broke. That
> trades a rare missing audit row for an occasional failed cancellation, which is the
> worse of the two. The original call stays exactly where it is, and only the guard
> below changes.

Find the block starting at `const released = await client.query(` (around line 352):

```js
    const released = await client.query(
```

Insert the following **immediately above** that line, leaving everything from
`const released` onwards exactly as it is:

```js
    // 7.7a: a request whose blood has physically moved cannot be cancelled.
    //
    // There was no check here at all. An admin could cancel a request that
    // a bank had already dispatched and a hospital had already received:
    // cancelled_at was set, the hospital was notified their request was
    // cancelled, and the row disappeared from the default "Hide cancelled"
    // view, while the units sat in their fridge. The state machine had no
    // terminal state.
    //
    // Blocked outright rather than allowed-with-a-warning. Cancelling is
    // meant to mean "this need went away before we acted on it". Once blood
    // has moved, the thing that needs recording is a return, which is a
    // different action with different inventory consequences, and pretending
    // it is a cancellation would put the database in a state that does not
    // describe anything that really happened.
    const moved = await client.query(
      `SELECT iu.unit_id, iu.status
       FROM allocation_records ar
       JOIN inventory_units iu ON iu.unit_id = ar.unit_id
       WHERE ar.request_id = $1 AND iu.status IN ('dispatched', 'delivered')`,
      [request.request_id]
    );
    if (moved.rows.length > 0) {
      await client.query('ROLLBACK');
      const counts = moved.rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
      const detail = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(' and ');
      return res.status(409).json({
        error: `This request cannot be cancelled: ${detail} unit(s) have already left the source organization. `
             + `Cancelling would not bring them back. Record what physically happened to those units instead.`,
        units_already_moved: moved.rows,
      });
    }
```

That is the entire change to this file. `409 Conflict` rather than `400`, because the
request is valid and the caller did nothing wrong: the resource is simply in a state
that does not permit this operation.

---

## P3. `routes/auth.js` — stop writing the hardcoded status

**Your bugs 1 and 8, at the source.** This INSERT wrote the literal string `'eligible'`
on every self-registration. Once the column is dropped it will throw, so this must land
before migration 14.

Find (around line 158):

```js
        await client.query(
          `INSERT INTO donors (user_id, full_name, blood_type, current_district, current_thana, current_thana_id, phone_number, sex, eligibility_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'eligible')`,
          [newUser.user_id, full_name || null, blood_type, current_district, current_thana || null, thanaId, phone_number, sex]
        );
```

Replace with:

```js
        // 7.7a: eligibility_status is gone. It was written here as the
        // literal 'eligible' and never updated by anything anywhere, so it
        // was a claim the system made once and then never revisited.
        // Eligibility is now derived from last_donation_date,
        // last_donation_component and sex by services/eligibility.js.
        await client.query(
          `INSERT INTO donors (user_id, full_name, blood_type, current_district, current_thana, current_thana_id, phone_number, sex)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [newUser.user_id, full_name || null, blood_type, current_district, current_thana || null, thanaId, phone_number, sex]
        );
```

---

## P4. `routes/admin/analytics.js` — the "Donors eligible now" KPI

That card was counting donor rows, not eligible donors, because every row said
`'eligible'`.

**Add the import** near the top, alongside the existing requires:

```js
const { eligibilityStatusSql } = require('../../services/eligibility');
```

> Check the relative depth. From `routes/admin/` it is `../../services/eligibility`.

Find (around line 57):

```js
      pool.query(`SELECT eligibility_status, COUNT(*) AS count FROM donors GROUP BY eligibility_status`),
```

Replace with:

```js
      // 7.7a: computed, not read off a column. The old version grouped by
      // donors.eligibility_status, which was the string 'eligible' on every
      // row the application had ever created -- so this KPI was a count of
      // all donors wearing the label of a real metric.
      pool.query(
        `SELECT ${eligibilityStatusSql('d')} AS eligibility_status, COUNT(*) AS count
         FROM donors d GROUP BY 1`
      ),
```

The response shape is unchanged: still `donors.by_eligibility.eligible`, still an
object keyed by status. Only `pending` disappears, which nothing ever produced.

---

## P5. `routes/admin/reports.js` — the donors export

**Add the import** near the top:

```js
const { eligibilityStatusSql } = require('../../services/eligibility');
```

Find, inside the `donors` report definition (around line 117):

```js
        `SELECT d.donor_id, d.full_name, d.blood_type, d.sex, o.name AS org_name, d.current_district, d.eligibility_status,
                d.last_donation_date, (d.user_id IS NOT NULL) AS has_login, d.created_at
         FROM donors d LEFT JOIN organizations o ON o.org_id = d.org_id ${w.sql} ORDER BY d.full_name`, w.values);
```

Replace with:

```js
        `SELECT d.donor_id, d.full_name, d.blood_type, d.sex, o.name AS org_name, d.current_district,
                ${eligibilityStatusSql('d')} AS eligibility_status,
                d.last_donation_component,
                d.last_donation_date, (d.user_id IS NOT NULL) AS has_login, d.created_at
         FROM donors d LEFT JOIN organizations o ON o.org_id = d.org_id ${w.sql} ORDER BY d.full_name`, w.values);
```

And add the component column to that report's `columns` array, after the
`last_donation_date` entry, so the export says what they last gave and not just when.
Without it the eligibility figure in the spreadsheet cannot be checked by hand:

```js
      { key: 'last_donation_component', header: 'Last component' },
```

---

## After applying

```bash
cd backend
npm start
```

It should boot with no errors. It will still work against the **current** database,
because every one of these changes either stops writing the column or computes around
it. Nothing above reads `donors.eligibility_status` any more, which is the point: the
code has to be safe on both sides of the migration, so you are never in a window where
the deployed backend and the database disagree.

Order on the day:

1. Apply P1 to P5 and the four full files.
2. `npm start` locally, confirm clean boot.
3. Push. Wait for Render to finish deploying.
4. Run `preflight_allocation_audit.sql`, then migration 13, then migration 14.

Backend before database, deliberately. The new code runs correctly against the old
schema, but the old code would break the moment the column disappears.
