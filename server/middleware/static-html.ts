import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Serves static HTML files from public/ with optional Google Analytics injection.
 *
 * Replaces the per-file GA snippet duplication — set GA_MEASUREMENT_ID in the
 * environment and every static HTML page gets the gtag.js snippet injected
 * before </head> at serve time.
 *
 * Handles:
 *   /                          → public/landing/index.html
 *   /landing/docs/faq          → public/landing/docs/faq.html
 *   /landing/integrate/        → public/landing/integrate/index.html
 *   /privacy-policy            → public/privacy-policy/index.html
 *   /terms-of-service          → public/terms-of-service/index.html
 *
 * Non-HTML requests (assets, API calls) fall through to Nitro's default handlers.
 */

const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID?.trim() || ''

const gaSnippet = GA_MEASUREMENT_ID
  ? `<!-- Google tag (gtag.js) -->\n`
    + `  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>\n`
    + `  <script>\n`
    + `    window.dataLayer = window.dataLayer || [];\n`
    + `    function gtag(){dataLayer.push(arguments);}\n`
    + `    gtag('js', new Date());\n`
    + `    gtag('config', '${GA_MEASUREMENT_ID}');\n`
    + `  </script>\n  `
  : ''

// Paths that map to static HTML files in public/
// Landing root is handled specially (/ → public/landing/index.html)
const STATIC_HTML_PREFIXES = ['/landing/', '/privacy-policy', '/terms-of-service']

const htmlCache = new Map<string, string>()

function resolveHtmlFile(urlPath: string): string | null {
  // Candidate file paths relative to the public dir
  const candidates: string[] = []

  if (urlPath === '/') {
    candidates.push('landing/index.html')
  }
  else {
    // /landing/docs/faq → landing/docs/faq.html or landing/docs/faq/index.html
    const clean = urlPath.replace(/\/+$/, '')
    candidates.push(`${clean.slice(1)}.html`)
    candidates.push(`${clean.slice(1)}/index.html`)
  }

  // Try .output/public/ first (production), then public/ (dev)
  const roots = [
    resolve(process.cwd(), '.output/public'),
    resolve(process.cwd(), 'public'),
  ]

  for (const root of roots) {
    for (const candidate of candidates) {
      const fullPath = resolve(root, candidate)
      // Guard against path traversal
      if (!fullPath.startsWith(root)) continue
      if (existsSync(fullPath)) return fullPath
    }
  }
  return null
}

function readAndInject(filePath: string): string {
  const cached = htmlCache.get(filePath)
  if (cached) return cached

  let html = readFileSync(filePath, 'utf-8')

  if (gaSnippet) {
    html = html.replace(/<head>/, `<head>\n  ${gaSnippet}`)
  }

  // Cache in production, not in dev (allows live editing)
  if (process.env.NODE_ENV === 'production') {
    htmlCache.set(filePath, html)
  }

  return html
}

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return

  const url = getRequestURL(event)
  const path = url.pathname

  // Only handle root or known static HTML prefixes
  const isStaticHtml = path === '/'
    || STATIC_HTML_PREFIXES.some(prefix => path.startsWith(prefix))
  if (!isStaticHtml) return

  // Don't intercept non-HTML requests (assets, etc.)
  if (path !== '/' && /\.[a-z0-9]+$/i.test(path) && !path.endsWith('.html')) return

  // Only serve to browsers requesting HTML
  const accept = getRequestHeader(event, 'accept') || ''
  if (!accept.includes('text/html')) return

  const filePath = resolveHtmlFile(path)
  if (!filePath) return // fall through to Nitro

  const html = readAndInject(filePath)
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  return html
})
