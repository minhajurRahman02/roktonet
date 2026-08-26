// Manages a reusable pool of connections to Postgres, rather than opening
// and closing a fresh connection on every single request (slow + wasteful).
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, // Supabase (and most cloud Postgres) requires SSL
});

module.exports = pool;