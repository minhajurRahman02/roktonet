require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pool = require('./db');

const app = express();

// CORS must allow credentials (cookies) and a SPECIFIC origin -- the
// wildcard '*' origin (the old config) is incompatible with
// credentialed requests; browsers reject that combination outright.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);