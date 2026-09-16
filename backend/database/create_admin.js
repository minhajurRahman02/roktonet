#!/usr/bin/env node
// Creates the first -- primary -- admin account. Spec section 7.
//
//   node database/create_admin.js --email admin@roktonet.org --name "System Admin"
//
// Run ONCE, from backend/, with .env pointing at the target database
// (the same DB_* values the backend uses -- so against production, that's
// the Supabase pooler). Prompts for the password interactively; it is
// never accepted on the command line, because command lines end up in
// shell history.
//
// This is the ONLY place is_primary_admin is ever set to true. No endpoint
// can grant it. Refuses to run if a primary admin already exists -- to
// replace one, that's a deliberate manual database operation, not a
// script re-run.

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const BCRYPT_ROUNDS = 10; // identical to routes/auth.js

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Reads one line. In a real terminal the characters are masked; when stdin
// is piped (CI, or `printf 'pw\npw\n' | node ...`) it reads plainly, since
// there's no echo to mask and readline's terminal mode would mis-consume
// the buffered input.
let pipedLines = null;
function askHidden(question) {
  if (!process.stdin.isTTY) {
    if (pipedLines === null) {
      pipedLines = require('fs').readFileSync(0, 'utf8').split(/\r?\n/);
    }
    process.stdout.write(question + '\n');
    return Promise.resolve(pipedLines.shift() || '');
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Mask typed characters: readline echoes by default, so override _writeToOutput.
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (str) {
      if (str.includes(question)) originalWrite.call(rl, str);
      else originalWrite.call(rl, '*');
    };
    rl.question(question, (answer) => {
      rl._writeToOutput = originalWrite;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const name = (arg('name') || 'System Admin').trim();
  if (!email || !email.includes('@')) {
    console.error('Usage: node database/create_admin.js --email <email> [--name "<full name>"]');
    process.exit(1);
  }

  const existingPrimary = await pool.query('SELECT email FROM users WHERE is_primary_admin = true');
  if (existingPrimary.rows.length > 0) {
    console.error(`A primary admin already exists (${existingPrimary.rows[0].email}). Refusing to create another.`);
    process.exit(1);
  }
  const clash = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (clash.rows.length > 0) {
    console.error(`An account with email ${email} already exists.`);
    process.exit(1);
  }

  const password = await askHidden(`Password for ${email}: `);
  const confirm = await askHidden('Confirm password: ');
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await pool.query(
    `INSERT INTO users (org_id, role, email, password_hash, full_name, is_verified, is_active, is_primary_admin)
     VALUES (NULL, 'admin', $1, $2, $3, true, true, true)
     RETURNING user_id, email, full_name, created_at`,
    [email, hash, name]
  );
  const u = result.rows[0];
  console.log(`\nPrimary admin created:\n  user_id: ${u.user_id}\n  email:   ${u.email}\n  name:    ${u.full_name}\n\nLog in at the frontend with this email and the password you just set.`);
}

main()
  .catch((err) => { console.error('Failed:', err.message); process.exit(1); })
  .finally(() => pool.end());
