// Implements Section 7A's fallback stage: when the optimization engine
// can't fully cover a request from inventory, find compatible eligible
// donors and invite a small, targeted batch -- not a blanket alert.

const pool = require('../db');
const { logRequestEvent } = require('./requestEvents');
const { ELIGIBILITY_COOLDOWN_DAYS } = require('./eligibility');

const MAX_DONORS_PER_INVITE = 5;

// Same donor->recipient logic as compatibility.py, but REVERSED: for a
// given recipient blood type, which donor blood types can give to them.
// Kept in sync manually with the Python version -- if the ABO/Rh chart
// ever changes, both files need updating together.
const COMPATIBLE_DONORS_FOR_WHOLE_BLOOD = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
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

  const orgResult = await pool.query(
    'SELECT district, thana_id FROM organizations WHERE org_id = $1',
    [request.org_id]
  );
  const org = orgResult.rows[0] || {};

  const cooldownDays = ELIGIBILITY_COOLDOWN_DAYS[request.component] || ELIGIBILITY_COOLDOWN_DAYS.whole_blood;
  const eligibleCutoff = new Date();
  eligibleCutoff.setDate(eligibleCutoff.getDate() - cooldownDays);

  const donorsResult = await pool.query(
    `SELECT donor_id,
       CASE
         WHEN current_thana_id IS NOT NULL AND current_thana_id = $5 THEN 0
         WHEN current_district IS NOT NULL AND current_district = $6 THEN 1
         ELSE 2
       END AS location_rank
     FROM donors
     WHERE (last_donation_date IS NULL OR last_donation_date <= $4)
       AND blood_type = ANY($1)
       AND donor_id != ALL($2)
     ORDER BY location_rank ASC
     LIMIT $3`,
    [compatibleTypes, excludeIds, MAX_DONORS_PER_INVITE, eligibleCutoff, org.thana_id || null, org.district || null]
  );

  for (const donor of donorsResult.rows) {
    await pool.query(
      `INSERT INTO donor_mobilizations (request_id, donor_id, invite_status) VALUES ($1, $2, 'invited')`,
      [request.request_id, donor.donor_id]
    );
  }

  const fulfillmentPath = request.urgency_tier === 'critical' ? 'parallel_critical' : 'donor_fallback';

  await pool.query('UPDATE requests SET fulfillment_path = $1 WHERE request_id = $2', [
    fulfillmentPath,
    request.request_id,
  ]);

  const searchMessage =
    request.urgency_tier === 'critical'
      ? 'Critical priority — searching for compatible donors in parallel with inventory'
      : 'Inventory insufficient — searching for compatible donors';
  await logRequestEvent(request.request_id, 'donor_search_triggered', searchMessage);

  const sameThana = donorsResult.rows.filter((d) => d.location_rank === 0).length;
  const sameDistrict = donorsResult.rows.filter((d) => d.location_rank === 1).length;
  const other = donorsResult.rows.filter((d) => d.location_rank === 2).length;

  let invitedMessage = 'No compatible eligible donors currently available';
  if (donorsResult.rows.length > 0) {
    const parts = [];
    if (sameThana > 0) parts.push(`${sameThana} nearby (same thana)`);
    if (sameDistrict > 0) parts.push(`${sameDistrict} same district`);
    if (other > 0) parts.push(`${other} elsewhere`);
    invitedMessage = `Invited ${donorsResult.rows.length} compatible eligible donor(s) — ${parts.join(', ')}`;
  }

  await logRequestEvent(request.request_id, 'donors_invited', invitedMessage, {
    invited_count: donorsResult.rows.length,
    same_thana: sameThana,
    same_district: sameDistrict,
    other,
  });

  return { request_id: request.request_id, invited: donorsResult.rows.length, fulfillment_path: fulfillmentPath };
}

async function escalateStaleMobilizations() {
  const staleResult = await pool.query(`
    SELECT r.request_id, r.org_id, r.blood_type, r.component, r.urgency_tier
    FROM requests r
    JOIN donor_mobilizations dm ON dm.request_id = r.request_id
    WHERE r.fulfillment_path IN ('donor_fallback', 'parallel_critical')
    GROUP BY r.request_id, r.org_id, r.blood_type, r.component, r.urgency_tier
    HAVING COUNT(*) FILTER (WHERE dm.invite_status = 'confirmed') = 0
       AND COUNT(*) FILTER (WHERE dm.invite_status = 'invited') = 0
  `);

  const results = [];
  for (const request of staleResult.rows) {
    await logRequestEvent(
      request.request_id,
      'escalation_triggered',
      'All previously invited donors declined — inviting a new batch'
    );
    const outcome = await triggerDonorFallback(request);
    results.push(outcome);
  }
  return results;
}

module.exports = { triggerDonorFallback, escalateStaleMobilizations };