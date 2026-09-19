/**
 * Send a one-off Brevo transactional test email.
 *
 * Usage (from backend/):
 *   node scripts/test-brevo-email.mjs --to=you@example.com
 *   node scripts/test-brevo-email.mjs --to=you@example.com --with-xlsx
 *
 * Requires BREVO_API_KEY + BREVO_SENDER_EMAIL in .env
 */
import { isMailConfigured, sendMailWithAttachments } from '../src/services/delivered-report/mail.js';
import { env } from '../src/config/env.js';
import { buildBranchDeliveredXlsx } from '../src/services/delivered-report/xlsx.js';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const to = argValue('to') || process.env.BREVO_TEST_TO || '';
const withXlsx = hasFlag('with-xlsx') || hasFlag('with-pdf');

if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: node scripts/test-brevo-email.mjs --to=you@example.com [--with-xlsx]');
  process.exit(1);
}

if (!isMailConfigured()) {
  console.error('Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in backend/.env');
  process.exit(1);
}

const when = new Date().toISOString();
const attachments = [];

if (withXlsx) {
  const content = buildBranchDeliveredXlsx({
    organizationName: 'RHET Inventory System',
    branchName: 'Test Branch',
    periodLabel: `Brevo test ${when}`,
    generatedAtLabel: when,
    rows: [],
  });
  attachments.push({
    filename: 'brevo-test-empty-branch.xlsx',
    content,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

console.log(`Sending Brevo test email…`);
console.log(`  From: ${env.BREVO_SENDER_NAME} <${env.BREVO_SENDER_EMAIL}>`);
console.log(`  To:   ${to}`);
console.log(`  XLSX: ${withXlsx ? 'yes' : 'no'}`);

try {
  const result = await sendMailWithAttachments({
    to: [to],
    subject: `[RHET] Brevo email test — ${when}`,
    text: [
      'This is a RHET Inventory Brevo connectivity test.',
      `Sent at: ${when}`,
      `Sender: ${env.BREVO_SENDER_EMAIL}`,
      withXlsx ? 'A sample empty-branch Excel (.xlsx) file is attached.' : 'No attachment (add --with-xlsx to include one).',
    ].join('\n'),
    html: `
      <p><strong>RHET Inventory — Brevo connectivity test</strong></p>
      <p>Sent at: ${when}<br/>Sender: ${env.BREVO_SENDER_EMAIL}</p>
      <p>${withXlsx ? 'A sample empty-branch Excel (.xlsx) file is attached.' : 'No attachment (re-run with <code>--with-xlsx</code>).'}</p>
    `,
    attachments,
  });

  console.log('OK — Brevo accepted the message.');
  if (result?.messageId) console.log(`  messageId: ${result.messageId}`);
  else console.log('  response:', JSON.stringify(result));
  process.exit(0);
} catch (error) {
  console.error('FAILED —', error?.message || error);
  process.exit(1);
}
