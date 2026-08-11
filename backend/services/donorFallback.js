// Implements Section 7A's fallback stage: when the optimization engine
// can't fully cover a request from inventory, find compatible eligible
// donors and invite a small, targeted batch -- not a blanket alert.

const pool = require('../db');

const MAX_DONORS_PER_INVITE = 5;

// Same donor->recipient logic as compatibility.py, but REVERSED: for a
// given recipient blood type, which donor blood types can give to them.
// Kept in sync manually with the Python version -- if the ABO/Rh chart
// ever changes, both files need updating together.
const COMPATIBLE_DONORS_FOR_WHOLE_BLOOD = {
  'O-':  ['O-'],
  'O+':  ['O-', 'O+'],
  'A-':  ['O-', 'A-'],
  'A+':  ['O-', 'O+', 'A-', 'A+'],
  'B-':  ['O-', 'B-'],
  'B+':  ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'], // universal recipient
};

function getCompatibleDonorTypes(bloodType, component) {
  if (component === 'whole_blood') {
    return COMPATIBLE_DONORS_FOR_WHOLE_BLOOD[bloodType] || [bloodType];
  }
  // platelets, plasma: exact match only -- same v1 simplification as the engine.
  return [bloodType];
}

// Invites a fresh batch of eligible, compatible donors for one request,
// excluding anyone already invited for it. Sets the request's
// fulfillment_path so it stops competing in future inventory batches.
async function triggerDonorFallback(request) {
  const compatibleTypes = getCompatibleDonorTypes(request.blood_type, request.component);

  const alreadyInvited = await pool.query(
    'SELECT donor_id FROM donor_mobilizations WHERE request_id = $1',
    [request.request_id]
  );
  const excludeIds = alreadyInvited.rows.map((r) => r.donor_id);

  const donorsResult = await pool.query(
    `SELECT donor_id FROM donors
     WHERE eligibility_status = 'eligible'
       AND blood_type = ANY($1)
       AND donor_id != ALL($2)
     LIMIT $3`,
    [compatibleTypes, excludeIds, MAX_DONORS_PER_INVITE]
  );

  for (const donor of donorsResult.rows) {
    await pool.query(
      `INSERT INTO donor_mobilizations (request_id, donor_id, invite_status) VALUES ($1, $2, 'invited')`,
      [request.request_id, donor.donor_id]
    );
  }

  // Section 7A: critical = parallel (donor search alongside inventory),
  // urgent/routine = sequential fallback (only after inventory came up short).
  const fulfillmentPath = request.urgency_tier === 'critical' ? 'parallel_critical' : 'donor_fallback';

  await pool.query('UPDATE requests SET fulfillment_path = $1 WHERE request_id = $2', [
    fulfillmentPath,
    request.request_id,
  ]);

  return { request_id: request.request_id, invited: donorsResult.rows.length, fulfillment_path: fulfillmentPath };
}

// Escalation: finds requests where every invited donor has declined (none
// still pending, none confirmed) and invites a fresh batch from whoever's
// left in the compatible/eligible pool. This is what prevents a request
// from dead-ending after one round of invites all get declined.
async function escalateStaleMobilizations() {
  const staleResult = await pool.query(`
    SELECT r.request_id, r.blood_type, r.component, r.urgency_tier
    FROM requests r
    JOIN donor_mobilizations dm ON dm.request_id = r.request_id
    WHERE r.fulfillment_path IN ('donor_fallback', 'parallel_critical')
    GROUP BY r.request_id, r.blood_type, r.component, r.urgency_tier
    HAVING COUNT(*) FILTER (WHERE dm.invite_status = 'confirmed') = 0
       AND COUNT(*) FILTER (WHERE dm.invite_status = 'invited') = 0
  `);

  const results = [];
  for (const request of staleResult.rows) {
    const outcome = await triggerDonorFallback(request);
    results.push(outcome);
  }
  return results;
}

module.exports = { triggerDonorFallback, escalateStaleMobilizations };
