/**
 * Force-send a delivered report using real DB data + XLSX attachments.
 *
 * Two report types:
 *   everyday  — today's Delivered lines (Asia/Manila)
 *   monthly   — whole calendar month (e.g. September 1–30, 2026)
 *
 * Usage (from backend/):
 *   node scripts/test-delivered-report-email.mjs --db=production --to=you@example.com --type=everyday --yes
 *   node scripts/test-delivered-report-email.mjs --db=production --to=you@example.com --type=monthly --yes
 *
 * Aliases:
 *   --type=everyday | daily
 *   --type=monthly  | month | whole-month
 *   --kind=… is accepted as an alias of --type=
 *
 * Safety:
 *   - --to= is required (does not use Settings recipient list)
 *   - --yes is required when --db=production
 *   - skipStamp=true so scheduled 5pm jobs are not blocked
 */
const dbTarget = (() => {
  const hit = process.argv.find((entry) => entry.startsWith('--db='));
  return hit ? hit.slice('--db='.length).trim().toLowerCase() : 'development';
})();

if (dbTarget === 'production' || dbTarget === 'prod') {
  process.env.NODE_ENV = 'production';
} else if (dbTarget === 'development' || dbTarget === 'dev') {
  process.env.NODE_ENV = 'development';
} else {
  console.error('Invalid --db=. Use production or development.');
  process.exit(1);
}

const { pool } = await import('../src/database/pool.js');
const { env } = await import('../src/config/env.js');
const {
  runDeliveredReport,
  dateKeyInZone,
  monthKeyInZone,
  lastDayYmdOfMonth,
  formatInclusivePeriodLabel,
} = await import('../src/services/delivered-report/report.service.js');

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function resolveReportType(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (['everyday', 'daily', 'day'].includes(value)) {
    return { kind: 'daily', typeLabel: 'Everyday (today)' };
  }
  if (['monthly', 'month', 'whole-month', 'whole_month'].includes(value)) {
    return { kind: 'monthly', typeLabel: 'Whole month' };
  }
  return null;
}

function printUsage() {
  console.error(`Usage:
  Everyday (today):
    node scripts/test-delivered-report-email.mjs --db=production --to=you@example.com --type=everyday --yes

  Whole month (e.g. September 1–30, 2026):
    node scripts/test-delivered-report-email.mjs --db=production --to=you@example.com --type=monthly --yes

Options:
  --type=everyday|monthly   Report window (required)
  --to=email@example.com    Recipient (required; only this address)
  --db=production|development
  --yes                     Required for production DB
`);
}

const to = argValue('to') || process.env.BREVO_TEST_TO || '';
const typeRaw = argValue('type') || argValue('kind') || '';
const resolved = resolveReportType(typeRaw);
const yes = hasFlag('yes');

if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !resolved) {
  printUsage();
  process.exit(1);
}

if ((dbTarget === 'production' || dbTarget === 'prod') && !yes) {
  console.error('Refusing to query production without --yes');
  process.exit(1);
}

const now = new Date();
const todayYmd = dateKeyInZone(now);
const monthYm = monthKeyInZone(now);
const periodPreview = resolved.kind === 'daily'
  ? formatInclusivePeriodLabel(todayYmd, todayYmd)
  : formatInclusivePeriodLabel(`${monthYm}-01`, lastDayYmdOfMonth(monthYm));

console.log('Delivered-report attachment test');
console.log(`  NODE_ENV: ${env.NODE_ENV}`);
console.log(`  DB name:  ${env.database?.database || '(from DATABASE_URL)'}`);
console.log(`  Type:     ${resolved.typeLabel}`);
console.log(`  Period:   ${periodPreview}`);
console.log(`  To:       ${to}`);
console.log(`  Stamp:    skipped (scheduled jobs unaffected)`);

try {
  const result = await runDeliveredReport(resolved.kind, {
    force: true,
    skipStamp: true,
    recipients: [to],
    subjectPrefix: '[TEST]',
  });

  if (result.skipped) {
    console.error('SKIPPED —', result.reason);
    process.exit(1);
  }

  console.log('OK — email accepted by Brevo');
  console.log(`  Type:        ${resolved.typeLabel}`);
  console.log(`  Period:      ${result.periodLabel}`);
  console.log(`  Branches:    ${result.branchCount}`);
  console.log(`  Lines:       ${result.lineCount}`);
  console.log(`  Attachments: ${result.attachmentCount} XLSX`);
  console.log(`  Recipients:  ${(result.recipients || []).join(', ')}`);
  process.exitCode = 0;
} catch (error) {
  console.error('FAILED —', error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
