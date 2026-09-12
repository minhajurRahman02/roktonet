// Bridges Postgres and the Python optimization service.
// This module never talks to the frontend directly -- it's called by
// route handlers (immediate trigger) or a scheduler (batch trigger).

const pool = require('../db');
const { triggerDonorFallback } = require('./donorFallback');
const { logRequestEvent } = require('./requestEvents');

const ENGINE_URL = process.env.ENGINE_URL || 'http://127.0.0.1:5001';

async function runAllocationBatch() {
  // "Pending" = hasn't been through the engine yet.
  const requestsResult = await pool.query(
    `SELECT request_id, org_id, blood_type, component, quantity, urgency_tier
     FROM requests WHERE fulfillment_path IS NULL`
  );

  if (requestsResult.rows.length === 0) {
    return { message: 'No pending requests to process.' };
  }

