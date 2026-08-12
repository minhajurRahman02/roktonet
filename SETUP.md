# RoktoNet — Setup Guide (Any Machine)

Follow this top to bottom on a fresh machine (uni PC, friend's PC, new laptop, etc.) to get the full system running. Thanks to the Supabase migration, there's no local database install anymore — this is now much faster than the first time we did it.

---

## Prerequisites (install once per machine)

- **Git**
- **Node.js** (v18 or newer — we've been using v24)
- **Python** (3.11 or newer)
- **Postman** (for testing API calls)

Verify each with: `git --version`, `node --version`, `python --version` (or `py --version`).

---

## 1. Clone the repository

```
git clone <your-repo-url>
cd RoktoNet
```

---

## 2. Backend setup (Node/Express)

```
cd backend
npm install
```

Copy `.env.example` to a new file named exactly `.env` in the same folder, then fill it in:

```
DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
DB_PORT=6543
DB_NAME=postgres
DB_USER=postgres.pcvxrlblqgbcrknzmcdl
DB_PASSWORD=<the Supabase database password>
PORT=3000
ENGINE_URL=http://127.0.0.1:5001
BATCH_INTERVAL_MS=60000
```

**Never commit `.env`** — it's already covered by `.gitignore`. Every machine needs its own copy of this file, filled in by hand.

---

## 3. Optimization engine setup (Python/Flask)

```
cd ../optimization-engine
pip install -r requirements.txt
```

(If `pip` complains about system packages on Linux, use `pip install -r requirements.txt --break-system-packages`. Not usually needed on Windows.)

---

## 4. Run the system (two terminals, both required)

**Terminal 1 — the optimization engine:**
```
cd optimization-engine
python app.py
```
Should say it's running on `http://127.0.0.1:5001`.

**Terminal 2 — the backend:**
```
cd backend
npm start
```
Should say `RoktoNet backend running on port 3000`.

Both must stay running for the full pipeline (immediate triggers, donor fallback) to work.

---

## 5. Verify it's alive

In a browser or Postman:
- `GET http://localhost:3000/api/health` → should return `{"status":"ok","db_time":"..."}`
- `GET http://localhost:3000/api/organizations` → should return the 20 seeded organizations

If both work, you're fully up and running — same live data as every other machine, since the database now lives in the cloud, not on any one PC.

---

## About the database

You do **not** need to install Postgres locally anymore, and you do **not** need to re-run `schema.sql` or `seed_data.sql` on a new machine — the cloud database already has everything loaded, and every machine connects to the exact same one.

If you ever need to inspect data visually, or run SQL directly, use Supabase's own tools instead of pgAdmin:
- **Table Editor** (left sidebar) — spreadsheet-style view of every table
- **SQL Editor** (left sidebar) — same as pgAdmin's Query Tool; this is where you'd paste `schema.sql`/`seed_data.sql` if you ever needed to rebuild from scratch, or run the reset command:
  ```sql
  TRUNCATE TABLE organizations, users, donors, inventory_units, requests, allocation_records, donor_mobilizations CASCADE;
  ```

---

## Important: this database is now shared

Every machine that fills in the same `.env` credentials is talking to the **same live database**. This is actually useful for team collaboration later (everyone sees the same data), but it also means:

- Test data you create is visible to anyone else connected — including teammates once they set this up too.
- Don't `TRUNCATE` casually if others might be actively using it — coordinate first.
- Share the Supabase password only through a private channel (not committed to GitHub, not posted anywhere public) — anyone with it has full access to the live database.

---

## Quick troubleshooting

- **`ENOTFOUND` on DB_HOST** — you're likely using the "Direct connection" host instead of the "Connection pooling" one. Supabase's direct connection is IPv6-only and often unreachable; always use the pooler host/port/user shown under Supabase's "Connect" → "Connection pooling."
- **Node says port 3000 already in use** — another `npm start` is probably still running somewhere; close that terminal first.
- **`/api/admin/run-batch` or requests hang** — check that `python app.py` (port 5001) is actually running; the backend depends on it for anything engine-related.
