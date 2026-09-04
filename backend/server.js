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
app.use(express.json()); // lets Express read JSON request bodies
app.use(cookieParser()); // lets Express read the httpOnly auth cookie

app.use('/api/auth', require('./routes/auth'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/donors', require('./routes/donors'));
app.use('/api/mobilizations', require('./routes/mobilizations'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/notifications', require('./routes/notifications'));

// Simple proof-of-life route: if this works, Node is successfully
// talking to your Postgres database.
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db_time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RoktoNet backend running on port ${PORT}`));

const { startScheduler } = require('./scheduler');
startScheduler();