/**
 * OFAC sanctions list — cached in-memory Set of lowercased addresses.
 *
 * Fetched from OFAC_LIST_URL (defaults to Oku CDN). Refreshes every
 * 30 minutes. Fail-open: if the fetch fails, the set is empty and
 * no addresses are blocked.
 */
import { logger } from './logger'

const REFRESH_INTERVAL_MS = 30 * 60_000 // 30 minutes
const FETCH_TIMEOUT_MS = 10_000

let ofacSet = new Set<string>()
let refreshTimer: ReturnType<typeof setInterval> | null = null

function getOfacUrl(): string {
  return (process.env.OFAC_LIST_URL || '').trim()
}

async function refresh(): Promise<void> {
  const url = getOfacUrl()
  if (!url) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) {
      logger.warn({ ctx: 'ofac', status: resp.status }, 'OFAC list fetch non-ok — keeping previous list')
      return
    }
    const data: unknown = await resp.json()
    if (!Array.isArray(data)) {
      logger.warn({ ctx: 'ofac' }, 'OFAC list is not an array — keeping previous list')
      return
    }
    ofacSet = new Set(
      data
        .filter((a): a is string => typeof a === 'string' && a.length > 0)
        .map(a => a.toLowerCase()),
    )
    logger.info({ ctx: 'ofac', count: ofacSet.size }, 'OFAC list refreshed')
  }
  catch (err) {
    logger.warn({ ctx: 'ofac', err }, 'OFAC list fetch failed — keeping previous list')
  }
  finally {
    clearTimeout(timeout)
  }
}

/** Start the background refresh cycle. Called once at server startup. */
export function startOfacRefresh(): void {
  const url = getOfacUrl()
  if (!url) return

  // Initial fetch
  refresh()

  // Periodic refresh
  if (!refreshTimer) {
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS)
  }
}

/** Check if an address is on the OFAC sanctions list. */
export function isOfacSanctioned(address: string): boolean {
  return ofacSet.has(address.toLowerCase())
}
