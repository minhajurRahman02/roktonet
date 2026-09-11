// Uploads avatar images to Supabase Storage via its plain REST API,
// rather than adding the full @supabase/supabase-js SDK as a dependency
// -- this project already talks to Supabase purely via `pg` for
// Postgres, so a lightweight fetch call keeps that same pattern instead
// of introducing a second way of talking to the same provider.
//
// Needs two new environment variables (separate from the existing
// Postgres connection string): SUPABASE_URL (the project's base URL,
// e.g. https://xxxx.supabase.co) and SUPABASE_SERVICE_ROLE_KEY (from
// Supabase's dashboard, under Project Settings > API -- the service role
// key, not the anon key, since this is a trusted server-side upload that
// should bypass row-level security, not a client-side one).
//
// Also needs a real, one-time manual step: create a PUBLIC storage
// bucket named "avatars" in the Supabase dashboard before this works --
// nothing in code can create that bucket for you.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AVATAR_BUCKET = 'avatars';

/**
 * @param {string} userId
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {string} fileExtension
 * @returns {Promise<string>} the resulting public URL
 */
async function uploadAvatar(userId, fileBuffer, mimeType, fileExtension) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for avatar uploads to work');
  }

  // Timestamped filename, not just the user_id -- x-upsert is still set
  // true as a safety net, but a unique path per upload also means a
  // stale browser cache never serves someone's old photo after they
  // change it.
  const filePath = `${userId}-${Date.now()}.${fileExtension}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${AVATAR_BUCKET}/${filePath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase Storage upload failed: ${errorText}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${filePath}`;
}

module.exports = { uploadAvatar };
