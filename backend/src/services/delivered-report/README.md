# Delivered stock-request email reports

Scheduled email digests of **Delivered** stock-request lines, one **Excel (.xlsx)** attachment per branch. **Amount** = quantity × inventory **selling price** (`price`).

## Schedule (Asia/Manila)

| Job | When | Content |
|-----|------|---------|
| Daily | Every day at **17:00** | Delivered lines for that calendar day |
| Monthly | Last calendar day of the month at **17:00** | All Delivered lines for that month |

Both jobs still send when there are **zero** lines (each branch workbook notes “No delivered items”).

Period labels use a readable range, e.g. **September 19, 2026** (everyday) or **September 1–30, 2026** (whole month).

## Settings (UI)

Stored in `system_settings.settings` JSON:

- `deliveredReportDailyEnabled` — daily email on/off  
- `deliveredReportMonthlyEnabled` — month-end email on/off  
- `deliveredReportEmails` — recipient list (shared; one email with all branch XLSX files)  
- `deliveredReportLastDailyYmd` / `deliveredReportLastMonthlyYm` — idempotency stamps (internal)

## Email provider (Brevo)

Uses [Brevo transactional email API](https://developers.brevo.com/docs/send-a-transactional-email) (`POST https://api.brevo.com/v3/smtp/email`).

```
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=no-reply@little-champion.com
BREVO_SENDER_NAME=RHET Inventory
```

XLSX attachments are sent as base64 `attachment[]` on the same API call. If Brevo is incomplete, jobs log a warning and skip sending.

## Files

| File | Role |
|------|------|
| `xlsx.js` | Build an Excel buffer for one branch |
| `mail.js` | Brevo send with attachments |
| `report.service.js` | Query Delivered rows, group by branch, send |
| `scheduler.js` | `node-cron` Asia/Manila triggers |
| `../delivered-report.service.js` | Re-export entry for `server.js` |

## Manual test

`POST /api/v1/settings/delivered-report/run` (admin) with body `{ "kind": "daily" | "monthly" }` forces a send for “today” / current month (still respects recipient list; ignores enable toggles for testing).

Connectivity script (from `backend/`):

```bash
node scripts/test-brevo-email.mjs --to=you@example.com --with-xlsx
```
