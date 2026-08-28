// Email delivery -- switched from Resend to Brevo.
// Reason: Resend's free tier without a verified domain can only deliver to
// the email that owns the Resend account -- a real risk during a live demo
// if someone registers with their own email. Brevo's free tier (300/day)
// allows sending to ANY recipient once a single sender email is verified
// (no domain purchase needed), which directly closes that gap.
//
// Uses Brevo's REST API directly via fetch rather than their official SDK
// -- Brevo's own README flags compatibility issues with modern Node/
// TypeScript setups, and the API itself is simple enough that a raw
// fetch call is more reliable than adding an extra dependency.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM_EMAIL = process.env.FROM_EMAIL; // must be a Brevo-verified single sender
const FROM_NAME = process.env.FROM_NAME || 'RoktoNet';

function frontendUrl(path) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}${path}`;
}

function emailShell(bodyHtml) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h1 style="color: #1C4A3D; font-size: 22px; margin-bottom: 4px;">RoktoNet</h1>
      <p style="color: #6B7280; font-size: 13px; margin-top: 0; margin-bottom: 28px;">
        Centralized blood inventory &amp; allocation optimization
      </p>
      ${bodyHtml}
    </div>
  `;
}

async function sendBrevoEmail(toEmail, subject, html) {
  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: toEmail }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

