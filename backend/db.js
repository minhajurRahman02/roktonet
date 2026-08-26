// Manages a reusable pool of connections to Postgres, rather than opening
// and closing a fresh connection on every single request (slow + wasteful).
require('dotenv').config();
const { Pool } = require('pg');

