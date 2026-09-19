import { env } from '../../config/env.js';

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

export function isMailConfigured() {
  return Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

/** @deprecated use isMailConfigured — kept for call sites */
export function isSmtpConfigured() {
  return isMailConfigured();
}

function parseSender() {
  const email = String(env.BREVO_SENDER_EMAIL || '').trim();
  const name = String(env.BREVO_SENDER_NAME || 'RHET Inventory').trim() || 'RHET Inventory';
  if (!email) {
    throw new Error('BREVO_SENDER_EMAIL is not configured.');
  }
  return { name, email };
}

/**
 * Send via Brevo Transactional Email API (https://api.brevo.com/v3/smtp/email).
 * @param {{
 *   to: string[],
 *   subject: string,
 *   text: string,
 *   html?: string,
 *   attachments?: { filename: string, content: Buffer, contentType?: string }[],
 * }} options
 */
export async function sendMailWithAttachments(options) {
  if (!isMailConfigured()) {
    throw new Error('Brevo email is not configured (set BREVO_API_KEY and BREVO_SENDER_EMAIL).');
  }

  const to = (options.to || [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  if (!to.length) {
    throw new Error('No email recipients configured.');
  }

  const attachment = (options.attachments || []).map((file) => ({
    name: file.filename,
    content: Buffer.isBuffer(file.content)
      ? file.content.toString('base64')
      : Buffer.from(file.content || '').toString('base64'),
  }));

  const body = {
    sender: parseSender(),
    to,
    subject: options.subject,
    textContent: options.text || undefined,
    htmlContent: options.html || undefined,
    ...(attachment.length ? { attachment } : {}),
  };

  if (!body.htmlContent && !body.textContent) {
    body.textContent = options.subject || 'RHET Inventory notification';
  }

  const response = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message
      || payload?.error
      || (Array.isArray(payload?.code) ? payload.code.join(', ') : null)
      || `Brevo API error (${response.status})`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(payload));
  }

  return payload;
}
