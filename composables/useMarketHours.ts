/**
 * Detects whether the US equity market is currently open.
 *
 * Coverage is 24/5: Sunday 20:00 ET through Friday 20:00 ET.
 * The weekend gap (Fri 20:00 ET → Sun 20:00 ET) is the only
 * closed period. US holidays are not modeled.
 *
 * When the market is closed and an oracle price is unavailable,
 * the UI should show "Market closed" instead of "Unknown".
 */

const ET_TIMEZONE = 'America/New_York'

function getETDate(): { day: number, hour: number } {
  const now = new Date()
  const etString = now.toLocaleString('en-US', { timeZone: ET_TIMEZONE })
  const etDate = new Date(etString)
  return { day: etDate.getDay(), hour: etDate.getHours() }
}

/**
 * Returns true if the US equity market is currently open (24/5).
 * Open: Sunday 20:00 ET → Friday 20:00 ET
 * Closed: Friday 20:00 ET → Sunday 20:00 ET
 */
export function isMarketOpen(): boolean {
  const { day, hour } = getETDate()

  // Saturday: always closed
  if (day === 6) return false

  // Sunday: closed until 20:00 ET
  if (day === 0) return hour >= 20

  // Friday: closed after 20:00 ET
  if (day === 5) return hour < 20

  // Mon-Thu: always open
  return true
}

/**
 * Reactive composable that ticks every minute to update market status.
 */
export const useMarketHours = () => {
  const open = ref(isMarketOpen())

  let timer: ReturnType<typeof setInterval> | null = null

  if (import.meta.client) {
    timer = setInterval(() => {
      open.value = isMarketOpen()
    }, 60_000)

    onUnmounted(() => {
      if (timer) clearInterval(timer)
    })
  }

  return { isMarketOpen: readonly(open) }
}
