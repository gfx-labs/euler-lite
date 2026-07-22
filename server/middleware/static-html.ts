import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Serves static HTML files from public/ with automatic injection of:
 *
 *   - Google Analytics (GA_MEASUREMENT_ID)
 *   - og:image / twitter:image (SOCIAL_IMAGE_URL or NUXT_PUBLIC_CONFIG_SOCIAL_IMAGE_URL)
 *   - twitter:card metadata
 *
 * Per-page <title>, <meta description>, og:title, og:description, and
 * canonical URLs are left as-is — each HTML file defines its own page-level
 * metadata. Only site-wide tags that would otherwise be duplicated across
 * every file are injected here.
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

function env(...keys: string[]): string {
  for (const k of keys) {
    if (process.env[k]) return process.env[k]!
  }
  return ''
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Snippet builders (evaluated once at startup) ────────────────────────

const GA_MEASUREMENT_ID = env('GA_MEASUREMENT_ID')

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

const SOCIAL_IMAGE_URL = env('SOCIAL_IMAGE_URL', 'NUXT_PUBLIC_CONFIG_SOCIAL_IMAGE_URL')

// Build the og:image + twitter meta block once. Only injected when the env var
// is set and starts with https:// (same guard as app-config.ts).
const socialMetaSnippet = (() => {
  if (!SOCIAL_IMAGE_URL || !SOCIAL_IMAGE_URL.startsWith('https://')) return ''
  const url = escapeAttr(SOCIAL_IMAGE_URL)
  const parts: string[] = []
  // og:image — only inject if the page doesn't already have one
  parts.push(`<meta property="og:image" content="${url}">`)
  parts.push(`<meta name="twitter:image" content="${url}">`)
  // twitter:card — ensure large image preview
  parts.push(`<meta name="twitter:card" content="summary_large_image">`)
  return parts.join('\n  ')
})()

// ── File resolution ─────────────────────────────────────────────────────

// Paths that map to static HTML files in public/
const STATIC_HTML_PREFIXES = ['/landing/', '/privacy-policy', '/terms-of-service']

const htmlCache = new Map<string, string>()

function resolveHtmlFile(urlPath: string): string | null {
  const candidates: string[] = []

  if (urlPath === '/') {
    candidates.push('landing/index.html')
  }
  else {
    const clean = urlPath.replace(/\/+$/, '')
    candidates.push(`${clean.slice(1)}.html`)
    candidates.push(`${clean.slice(1)}/index.html`)
  }

  const roots = [
    resolve(process.cwd(), '.output/public'),
    resolve(process.cwd(), 'public'),
  ]

  for (const root of roots) {
    for (const candidate of candidates) {
      const fullPath = resolve(root, candidate)
      if (!fullPath.startsWith(root)) continue
      if (existsSync(fullPath)) return fullPath
    }
  }
  return null
}

// ── Injection ───────────────────────────────────────────────────────────

function injectIntoHead(html: string): string {
  let result = html

  // Inject GA snippet after <head>
  if (gaSnippet) {
    result = result.replace(/<head>/, `<head>\n  ${gaSnippet}`)
  }

  // Inject social meta before </head>, but only tags the page doesn't already have
  if (socialMetaSnippet) {
    const injections: string[] = []
    if (!/<meta\s+property="og:image"/.test(result)) {
      injections.push(`<meta property="og:image" content="${escapeAttr(SOCIAL_IMAGE_URL)}">`)
    }
    if (!/<meta\s+name="twitter:image"/.test(result)) {
      injections.push(`<meta name="twitter:image" content="${escapeAttr(SOCIAL_IMAGE_URL)}">`)
    }
    if (!/<meta\s+name="twitter:card"/.test(result)) {
      injections.push(`<meta name="twitter:card" content="summary_large_image">`)
    }
    if (injections.length > 0) {
      result = result.replace(/<\/head>/, `  ${injections.join('\n  ')}\n</head>`)
    }
  }

  return result
}

function readAndInject(filePath: string): string {
  const cached = htmlCache.get(filePath)
  if (cached) return cached

  const html = injectIntoHead(readFileSync(filePath, 'utf-8'))

  if (process.env.NODE_ENV === 'production') {
    htmlCache.set(filePath, html)
  }

  return html
}

// ── Handler ─────────────────────────────────────────────────────────────

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return

  const url = getRequestURL(event)
  const path = url.pathname

  const isStaticHtml = path === '/'
    || STATIC_HTML_PREFIXES.some(prefix => path.startsWith(prefix))
  if (!isStaticHtml) return

  // Don't intercept non-HTML requests (CSS, images, etc.)
  if (path !== '/' && /\.[a-z0-9]+$/i.test(path) && !path.endsWith('.html')) return

  // Only serve to browsers requesting HTML
  const accept = getRequestHeader(event, 'accept') || ''
  if (!accept.includes('text/html')) return

  const filePath = resolveHtmlFile(path)
  if (!filePath) return

  const html = readAndInject(filePath)
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  return html
})
