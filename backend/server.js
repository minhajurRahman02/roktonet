require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json()); // lets Express read JSON request bodies

app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/donors', require('./routes/donors'));
app.use('/api/mobilizations', require('./routes/mobilizations'));
app.use('/api/admin', require('./routes/admin'));

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