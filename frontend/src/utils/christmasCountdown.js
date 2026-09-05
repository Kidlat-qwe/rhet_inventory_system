/** Philippine Time — Christmas Day countdown for the Santa parade flag. */
export const CHRISTMAS_COUNTDOWN_TIMEZONE = 'Asia/Manila'

/**
 * Calendar YYYY-MM-DD in a fixed IANA timezone.
 * @param {Date} [date]
 * @param {string} [timeZone]
 */
export function dateKeyInZone(date = new Date(), timeZone = CHRISTMAS_COUNTDOWN_TIMEZONE) {
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Days until next December 25 in the given zone.
 * Uses an inclusive calendar span (today through Christmas Day), so
 * 2026-09-05 → 2026-12-25 = 112 days in Asia/Manila.
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {{
 *   days: number,
 *   isChristmas: boolean,
 *   year: number,
 *   label: string,
 *   shortLabel: string,
 * }}
 */
export function getChristmasCountdown(now = new Date(), timeZone = CHRISTMAS_COUNTDOWN_TIMEZONE) {
  const todayKey = dateKeyInZone(now, timeZone)
  if (!todayKey) {
    return {
      days: 0,
      isChristmas: false,
      year: now.getFullYear(),
      label: 'Christmas',
      shortLabel: '—',
    }
  }

  const [yearStr, monthStr, dayStr] = todayKey.split('-')
  let year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  // After Dec 25 → count down to next year's Christmas.
  if (month === 12 && day > 25) year += 1

  const christmasKey = `${year}-12-25`
  const todayUtc = Date.UTC(Number(yearStr), month - 1, day)
  const christmasUtc = Date.UTC(year, 11, 25)
  // Inclusive: Sep 5 → Dec 25 is 112 calendar days (not the exclusive 111 gap).
  const days = Math.max(0, Math.round((christmasUtc - todayUtc) / 86_400_000) + 1)
  const isChristmas = todayKey === christmasKey

  if (isChristmas) {
    return {
      days: 0,
      isChristmas: true,
      year,
      label: 'Merry Christmas!',
      shortLabel: 'Today!',
    }
  }

  const dayWord = days === 1 ? 'day' : 'days'
  return {
    days,
    isChristmas: false,
    year,
    label: `${days} ${dayWord} to Christmas`,
    shortLabel: days === 1 ? '1 day' : `${days} days`,
  }
}
