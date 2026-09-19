import { pool } from '../../database/pool.js';
import { AppError, camelize } from '../../utils/api.js';
import { getSettings, updateSettingsInternal } from '../settings.service.js';
import { buildBranchDeliveredXlsx } from './xlsx.js';
import { isSmtpConfigured, sendMailWithAttachments } from './mail.js';

const REPORT_TZ = 'Asia/Manila';

export function dateKeyInZone(date = new Date(), timeZone = REPORT_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function monthKeyInZone(date = new Date(), timeZone = REPORT_TZ) {
  return dateKeyInZone(date, timeZone).slice(0, 7);
}

function formatManilaDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeBranchKey(branchName) {
  const text = String(branchName || '').trim().toLowerCase();
  return text || '__no_branch__';
}

function branchLabel(branchName) {
  const text = String(branchName || '').trim();
  return text || 'No branch';
}

function slugifyFilename(value) {
  return String(value || 'branch')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'branch';
}

function itemLabel(row) {
  return row.item_name || row.matched_item_name || row.category_name || 'Item';
}

function skuLabel(row) {
  return row.matched_sku || row.sku || '';
}

/**
 * Inclusive Manila calendar range → UTC bounds for delivered_at filter.
 */
export function manilaRangeToUtcBounds(startYmd, endYmd) {
  const start = new Date(`${startYmd}T00:00:00+08:00`);
  const endExclusive = new Date(`${endYmd}T00:00:00+08:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { start, endExclusive };
}

export function isLastDayOfMonthManila(now = new Date()) {
  const today = dateKeyInZone(now);
  const [y, m, d] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay;
}

/** Last calendar day YYYY-MM-DD for a Manila month key (YYYY-MM). */
export function lastDayYmdOfMonth(monthYm) {
  const [y, m] = String(monthYm).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthYm}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Human period labels, e.g. "September 19, 2026" or "September 1–30, 2026".
 * @param {string} startYmd
 * @param {string} endYmd
 */
export function formatInclusivePeriodLabel(startYmd, endYmd) {
  const startParts = String(startYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const endParts = String(endYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!startParts || !endParts) return `${startYmd} – ${endYmd}`;

  const startDate = new Date(Date.UTC(Number(startParts[1]), Number(startParts[2]) - 1, Number(startParts[3])));
  const endDate = new Date(Date.UTC(Number(endParts[1]), Number(endParts[2]) - 1, Number(endParts[3])));
  const monthName = (date) => date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = (date) => date.getUTCFullYear();
  const day = (date) => date.getUTCDate();

  if (startYmd === endYmd) {
    return `${monthName(startDate)} ${day(startDate)}, ${year(startDate)}`;
  }

  if (
    startDate.getUTCFullYear() === endDate.getUTCFullYear()
    && startDate.getUTCMonth() === endDate.getUTCMonth()
  ) {
    return `${monthName(startDate)} ${day(startDate)}–${day(endDate)}, ${year(startDate)}`;
  }

  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${monthName(startDate)} ${day(startDate)} – ${monthName(endDate)} ${day(endDate)}, ${year(startDate)}`;
  }

  return `${monthName(startDate)} ${day(startDate)}, ${year(startDate)} – ${monthName(endDate)} ${day(endDate)}, ${year(endDate)}`;
}

async function listKnownBranches(db = pool) {
  const result = await db.query(
    `SELECT DISTINCT NULLIF(btrim(branch_name), '') AS branch_name
     FROM stock_requests
     WHERE request_kind IS DISTINCT FROM 'RETURN'
     ORDER BY 1 NULLS LAST`,
  );
  const branches = result.rows.map((row) => branchLabel(row.branch_name));
  if (!branches.length) return ['No branch'];
  return branches;
}

async function listDeliveredRows({ start, endExclusive }, db = pool) {
  const result = await db.query(
    `SELECT
       sr.request_id,
       sr.batch_reference,
       sr.external_reference,
       sr.branch_name,
       sr.requested_by,
       sr.source_system,
       sr.category_name,
       sr.quantity,
       sr.request_date,
       sr.created_at,
       sr.delivered_at,
       sr.delivery_confirmed_by,
       sr.reason,
       sr.matched_sku,
       i.item_name,
       i.variation,
       i.price,
       i.internal_selling_price,
       i.sku AS inventory_sku
     FROM stock_requests sr
     LEFT JOIN inventory i ON i.inventory_id = sr.inventory_id
     WHERE sr.status = 'DELIVERED'
       AND sr.delivered_at IS NOT NULL
       AND sr.delivered_at >= $1
       AND sr.delivered_at < $2
       AND (sr.request_kind IS NULL OR sr.request_kind = 'REQUEST')
     ORDER BY sr.branch_name NULLS LAST, sr.delivered_at ASC`,
    [start, endExclusive],
  );
  return result.rows.map((row) => {
    const camel = camelize(row);
    return {
      ...camel,
      itemLabel: itemLabel(row),
      sku: skuLabel(row) || row.inventory_sku || '',
      variation: row.variation || '',
      sellingPrice: row.price,
      internalSellingPrice: row.internal_selling_price,
      requestedAtLabel: formatManilaDateTime(row.request_date || row.created_at),
      deliveredAtLabel: formatManilaDateTime(row.delivered_at),
    };
  });
}

function groupRowsByBranch(rows, knownBranches) {
  const map = new Map();
  for (const name of knownBranches) {
    map.set(normalizeBranchKey(name === 'No branch' ? '' : name), {
      branchName: name,
      rows: [],
    });
  }
  for (const row of rows) {
    const key = normalizeBranchKey(row.branchName);
    if (!map.has(key)) {
      map.set(key, { branchName: branchLabel(row.branchName), rows: [] });
    }
    map.get(key).rows.push(row);
  }
  return [...map.values()].sort((a, b) => a.branchName.localeCompare(b.branchName, undefined, { sensitivity: 'base' }));
}

async function buildAttachments({ groups, organizationName, periodLabel, generatedAtLabel, filePrefix }) {
  const attachments = [];
  for (const group of groups) {
    const content = buildBranchDeliveredXlsx({
      organizationName,
      branchName: group.branchName,
      periodLabel,
      generatedAtLabel,
      rows: group.rows,
    });
    attachments.push({
      filename: `${filePrefix}_${slugifyFilename(group.branchName)}.xlsx`,
      content,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
  return attachments;
}

/**
 * @param {'daily'|'monthly'} kind
 * @param {{
 *   force?: boolean,
 *   now?: Date,
 *   recipients?: string[],
 *   skipStamp?: boolean,
 *   subjectPrefix?: string,
 * }} [options]
 */
export async function runDeliveredReport(kind, options = {}) {
  const now = options.now || new Date();
  const force = Boolean(options.force);
  const skipStamp = Boolean(options.skipStamp);
  const settings = await getSettings();

  if (kind === 'daily' && !force && !settings.deliveredReportDailyEnabled) {
    return { skipped: true, reason: 'Daily delivered report is disabled in Settings.' };
  }
  if (kind === 'monthly' && !force && !settings.deliveredReportMonthlyEnabled) {
    return { skipped: true, reason: 'Monthly delivered report is disabled in Settings.' };
  }

  const recipients = Array.isArray(options.recipients) && options.recipients.length
    ? options.recipients
    : (settings.deliveredReportEmails || []);
  if (!recipients.length) {
    return { skipped: true, reason: 'No delivered-report recipients configured.' };
  }
  if (!isSmtpConfigured()) {
    return { skipped: true, reason: 'Brevo email is not configured on the server (BREVO_API_KEY / BREVO_SENDER_EMAIL).' };
  }

  const todayYmd = dateKeyInZone(now);
  const monthYm = monthKeyInZone(now);

  if (kind === 'daily' && !force && settings.deliveredReportLastDailyYmd === todayYmd) {
    return { skipped: true, reason: `Daily report already sent for ${todayYmd}.` };
  }
  if (kind === 'monthly' && !force && settings.deliveredReportLastMonthlyYm === monthYm) {
    return { skipped: true, reason: `Monthly report already sent for ${monthYm}.` };
  }

  let startYmd;
  let endYmd;
  let periodLabel;
  let subjectKind;
  let filePrefix;

  if (kind === 'daily') {
    startYmd = todayYmd;
    endYmd = todayYmd;
    const dayLabel = formatInclusivePeriodLabel(startYmd, endYmd);
    periodLabel = `Everyday report — ${dayLabel} (Asia/Manila)`;
    subjectKind = `Everyday delivered report — ${dayLabel}`;
    filePrefix = `delivered_daily_${todayYmd}`;
  } else {
    startYmd = `${monthYm}-01`;
    endYmd = lastDayYmdOfMonth(monthYm);
    const rangeLabel = formatInclusivePeriodLabel(startYmd, endYmd);
    periodLabel = `Whole month — ${rangeLabel} (Asia/Manila)`;
    subjectKind = `Monthly delivered report — ${rangeLabel}`;
    filePrefix = `delivered_monthly_${monthYm}`;
  }

  const { start, endExclusive } = manilaRangeToUtcBounds(startYmd, endYmd);
  const [rows, knownBranches] = await Promise.all([
    listDeliveredRows({ start, endExclusive }),
    listKnownBranches(),
  ]);
  const groups = groupRowsByBranch(rows, knownBranches);
  const generatedAtLabel = formatManilaDateTime(now);
  const attachments = await buildAttachments({
    groups,
    organizationName: settings.organizationName,
    periodLabel,
    generatedAtLabel,
    filePrefix,
  });

  const totalLines = rows.length;
  const branchSummary = groups
    .map((group) => `• ${group.branchName}: ${group.rows.length} line(s)`)
    .join('\n');

  const subjectPrefix = options.subjectPrefix ? `${options.subjectPrefix} ` : '';
  const text = [
    `${settings.organizationName}`,
    subjectKind,
    `Timezone: Asia/Manila (UTC+8)`,
    `Period: ${periodLabel}`,
    `Total delivered lines: ${totalLines}`,
    '',
    'Per branch:',
    branchSummary || '• (no branches)',
    '',
    'Each branch has its own Excel (.xlsx) attachment.',
    totalLines === 0
      ? 'There were no Delivered stock requests in this period; empty workbooks are still attached.'
      : 'Only Delivered status lines are included.',
  ].join('\n');

  const html = `
    <p><strong>${escapeHtml(settings.organizationName)}</strong></p>
    <p>${escapeHtml(subjectKind)}<br/>
    Timezone: Asia/Manila (UTC+8)<br/>
    Period: ${escapeHtml(periodLabel)}<br/>
    Total delivered lines: <strong>${totalLines}</strong></p>
    <p>Per branch:</p>
    <ul>${groups.map((g) => `<li>${escapeHtml(g.branchName)}: ${g.rows.length} line(s)</li>`).join('')}</ul>
    <p>Each branch has its own Excel (.xlsx) attachment.${totalLines === 0 ? ' There were no Delivered lines; empty workbooks are still attached.' : ''}</p>
  `;

  await sendMailWithAttachments({
    to: recipients,
    subject: `[RHET] ${subjectPrefix}${subjectKind}`,
    text,
    html,
    attachments,
  });

  if (!skipStamp) {
    if (kind === 'daily') {
      await updateSettingsInternal({ deliveredReportLastDailyYmd: todayYmd });
    } else {
      await updateSettingsInternal({ deliveredReportLastMonthlyYm: monthYm });
    }
  }

  return {
    sent: true,
    kind,
    periodLabel,
    recipientCount: recipients.length,
    recipients,
    branchCount: groups.length,
    lineCount: totalLines,
    attachmentCount: attachments.length,
    stamped: !skipStamp,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function runDeliveredReportOrThrow(kind, options = {}) {
  const result = await runDeliveredReport(kind, options);
  if (result.skipped && options.force) {
    throw new AppError(422, 'REPORT_SKIPPED', result.reason);
  }
  return result;
}
