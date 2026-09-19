import cron from 'node-cron';
import { dateKeyInZone, isLastDayOfMonthManila, runDeliveredReport } from './report.service.js';

let started = false;

async function safeRun(kind, label) {
  try {
    const result = await runDeliveredReport(kind);
    if (result.skipped) {
      console.log(`[delivered-report] ${label}: skipped — ${result.reason}`);
      return;
    }
    console.log(
      `[delivered-report] ${label}: sent to ${result.recipientCount} recipient(s), `
      + `${result.attachmentCount} XLSX file(s), ${result.lineCount} line(s)`,
    );
  } catch (error) {
    console.error(`[delivered-report] ${label}: failed —`, error?.message || error);
  }
}

/**
 * Start Asia/Manila schedules:
 * - Daily 17:00 — day's Delivered lines
 * - Same tick on last day of month — also monthly report
 */
export function startDeliveredReportScheduler() {
  if (started) return;
  started = true;

  // 17:00 every day, Asia/Manila
  cron.schedule(
    '0 17 * * *',
    async () => {
      const stamp = dateKeyInZone(new Date());
      console.log(`[delivered-report] 17:00 Asia/Manila tick (${stamp})`);
      await safeRun('daily', 'daily');
      if (isLastDayOfMonthManila()) {
        await safeRun('monthly', 'monthly');
      }
    },
    { timezone: 'Asia/Manila' },
  );

  console.log('[delivered-report] Scheduler started (daily 17:00 Asia/Manila; monthly on last day)');
}
