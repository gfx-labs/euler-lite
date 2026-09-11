/**
 * Serves the static HTML pages from server/assets/html with automatic
 * injection of:
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
 * The HTML lives in server/assets/html rather than public/ on purpose:
 * Nitro registers its public-asset handler ahead of every server middleware,
 * so anything under public/ (including `dir/index.html` for a directory
 * URL) is served directly and never reaches this file. Keeping the pages out
 * of public/ is what makes this middleware the one that serves them. Their
 * CSS and images stay in public/ and are still served as plain assets.
 *
 * Handles:
 *   /                          → landing/index.html
 *   /landing/docs/             → landing/docs/index.html
 *   /landing/docs/faq.html     → landing/docs/faq.html
 *   /landing/docs/faq          → landing/docs/faq.html
 *   /landing/integrate/        → landing/integrate/index.html
 *   /privacy-policy            → privacy-policy/index.html
 *   /terms-of-service          → terms-of-service/index.html
 *
 * Anything that does not resolve to one of these files falls through to
 * Nitro's default handlers.
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

// ── Snippet builders ────────────────────────────────────────────────────

export function buildGaSnippet(measurementId: string): string {
  if (!measurementId) return ''
  return `<!-- Google tag (gtag.js) -->\n`
    + `  <script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>\n`
    + `  <script>\n`
    + `    window.dataLayer = window.dataLayer || [];\n`
    + `    function gtag(){dataLayer.push(arguments);}\n`
    + `    gtag('js', new Date());\n`
    + `    gtag('config', '${measurementId}');\n`
    + `  </script>\n  `
}

// ── Path resolution ─────────────────────────────────────────────────────

const STATIC_HTML_PREFIXES = ['/landing/', '/privacy-policy', '/terms-of-service']

/**
 * Map a request path to the candidate keys under server/assets/html, in
 * lookup order. Returns an empty list for paths this middleware does not own.
 */
export function resolveHtmlAssetKeys(urlPath: string): string[] {
  if (urlPath === '/') return ['landing/index.html']

  const isStaticHtml = STATIC_HTML_PREFIXES.some(prefix => urlPath.startsWith(prefix))
  if (!isStaticHtml) return []

  // Non-HTML assets (CSS, images) under the same prefixes stay in public/.
  if (/\.[a-z0-9]+$/i.test(urlPath) && !urlPath.endsWith('.html')) return []

  const clean = urlPath.replace(/\/+$/, '').slice(1)
  if (clean.endsWith('.html')) return [clean]
  return [`${clean}.html`, `${clean}/index.html`]
}

// ── Injection ───────────────────────────────────────────────────────────

export function injectIntoHead(html: string, gaSnippet: string, socialImageUrl: string): string {
  let result = html

  // Inject GA snippet after <head>
  if (gaSnippet) {
    result = result.replace(/<head>/, `<head>\n  ${gaSnippet}`)
  }

  // Inject social meta before </head>, but only tags the page doesn't already have.
  // Same https:// guard as app-config.ts.
  if (socialImageUrl && socialImageUrl.startsWith('https://')) {
    const url = escapeAttr(socialImageUrl)
    const injections: string[] = []
    if (!/<meta\s+property="og:image"/.test(result)) {
      injections.push(`<meta property="og:image" content="${url}">`)
    }
    if (!/<meta\s+name="twitter:image"/.test(result)) {
      injections.push(`<meta name="twitter:image" content="${url}">`)
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

// ── Handler ─────────────────────────────────────────────────────────────

// Evaluated once at startup.
const GA_SNIPPET = buildGaSnippet(env('GA_MEASUREMENT_ID'))
const SOCIAL_IMAGE_URL = env('SOCIAL_IMAGE_URL', 'NUXT_PUBLIC_CONFIG_SOCIAL_IMAGE_URL')

const htmlCache = new Map<string, string>()

async function readAndInject(key: string): Promise<string> {
  const cached = htmlCache.get(key)
  if (cached) return cached

  const raw = await useStorage('assets:server').getItem(`html/${key}`)
  const html = injectIntoHead(
    typeof raw === 'string' ? raw : Buffer.from(raw as Uint8Array).toString('utf-8'),
    GA_SNIPPET,
    SOCIAL_IMAGE_URL,
  )

  if (process.env.NODE_ENV === 'production') {
    htmlCache.set(key, html)
  }

  return html
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return

  const path = getRequestURL(event).pathname
  const candidates = resolveHtmlAssetKeys(path)
  if (candidates.length === 0) return

  const storage = useStorage('assets:server')
  let key: string | undefined
  for (const candidate of candidates) {
    if (await storage.hasItem(`html/${candidate}`)) {
      key = candidate
      break
    }
  }
  if (!key) return

  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  if (event.method === 'HEAD') return ''
  return await readAndInject(key)
})
