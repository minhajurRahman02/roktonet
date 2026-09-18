# Database migration order

`roktonetSchema.sql` is the **Phase 2 baseline**, not the current schema. It creates
7 tables with the columns we had at the time. Everything since then lives in the
migration files, and the current schema only exists once they have all been applied
on top of it, in order.

That matters because `SETUP.md` currently says you can rebuild from scratch by
pasting "`schema.sql`/`seed_data.sql`" into the Supabase SQL Editor. Doing only that
gives you a Phase 2 database: no `notifications`, no `request_events`, no
`admin_actions`, no `donor_drives`, no `bd_thanas`, and a `donors` table missing
`full_name`, `sex`, `last_donation_component` and everything else the code depends
on. The application will not run against it.

Nobody has hit this because the live Supabase database has had the migrations applied
incrementally as we built each phase. It only bites on a genuine rebuild.

## Run order

Each file is idempotent, so a re-run is harmless. Run them top to bottom in the
Supabase SQL Editor.

| # | File | Adds |
|---|---|---|
| 1 | `roktonetSchema.sql` | Baseline: organizations, users, donors, inventory_units, requests, allocation_records, donor_mobilizations |
| 2 | `migration_auth.sql` | Real authentication columns on users and organizations |
| 3 | `migration_password_reset.sql` | Reset token columns on users |
| 4 | `migration_ngo.sql` | `donor_drives` table; NGO columns on donors and inventory_units |
| 5 | `migration_donor_profile.sql` | Contact info and avatars on users and organizations |
| 6 | `migration_donors_created_at.sql` | `donors.created_at` |
| 7 | `migration_eligibility.sql` | `donors.sex`, `donors.last_donation_component` |
| 8 | `migration_restock.sql` | `restock` urgency tier on requests |
| 9 | `migration_location.sql` | `bd_thanas` and `notifications` tables; thana columns; `delivered` unit status |
| 10 | `seed_bd_thanas.sql` | Populates `bd_thanas` (requires step 9) |
| 11 | `migration_request_events.sql` | `request_events` table |
| 12 | `migration_admin.sql` | `admin_actions` table; admin columns on users, requests, notifications |
| 13 | `migration_dedupe_allocations.sql` | Repairs allocation race damage; `UNIQUE (request_id, unit_id)` |
| 14 | `migration_drop_eligibility_status.sql` | Drops the stale `donors.eligibility_status` column |
| 15 | `seed_data.sql` | Demo data. Optional, and only on a database you are happy to fill with fake rows |

## Real ordering constraints

Most of these are independent and could be reordered, but three cannot:

- **9 before 12.** `migration_admin.sql` alters `notifications`, which
  `migration_location.sql` creates.
- **9 before 10.** `seed_bd_thanas.sql` populates `bd_thanas`, which
  `migration_location.sql` creates.
- **13 before 14** is not a hard dependency, but run it that way anyway: the
  allocation repair is the riskier of the two and you want a clean result from it
  before changing anything else.

## Before running 13 on a live database

Run `preflight_allocation_audit.sql` first and keep the output. It is read-only and
tells you exactly what the repair is going to touch. `migration_dedupe_allocations.sql`
prints the same counts afterwards, so the two can be compared.
