import { readFileSync } from 'fs'
import { resolve } from 'path'

// Serve the static landing page at GET /
// Must run before Nuxt's SPA catch-all which would otherwise serve the app shell
let landingHtml: string | null = null

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname

  // Only intercept exact root path with GET method
  if (path !== '/' || event.method !== 'GET') return

  // Don't intercept API requests or asset requests
  const accept = getRequestHeader(event, 'accept') || ''
  if (!accept.includes('text/html')) return

  if (!landingHtml) {
    try {
      // In production (Nitro build), public assets are in .output/public/
      // In dev, they're in public/
      const paths = [
        resolve(process.cwd(), '.output/public/landing/index.html'),
        resolve(process.cwd(), 'public/landing/index.html'),
      ]
      for (const p of paths) {
        try {
          landingHtml = readFileSync(p, 'utf-8')
          break
        }
        catch { /* try next */ }
      }
    }
    catch { /* fallback below */ }
  }

  if (!landingHtml) return // fall through to Nuxt SPA

  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  return landingHtml
})
