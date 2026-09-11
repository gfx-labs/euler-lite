import { describe, expect, it } from 'vitest'
import { buildGaSnippet, injectIntoHead, resolveHtmlAssetKeys } from '~/server/middleware/static-html'

describe('resolveHtmlAssetKeys', () => {
  it('maps the root to the landing page', () => {
    expect(resolveHtmlAssetKeys('/')).toEqual(['landing/index.html'])
  })

  it('maps directory URLs to their index.html', () => {
    expect(resolveHtmlAssetKeys('/landing/docs/')).toEqual(['landing/docs.html', 'landing/docs/index.html'])
    expect(resolveHtmlAssetKeys('/landing/integrate')).toEqual(['landing/integrate.html', 'landing/integrate/index.html'])
    expect(resolveHtmlAssetKeys('/terms-of-service')).toEqual(['terms-of-service.html', 'terms-of-service/index.html'])
    expect(resolveHtmlAssetKeys('/privacy-policy/')).toEqual(['privacy-policy.html', 'privacy-policy/index.html'])
  })

  it('accepts explicit .html paths as linked from the sitemap and nav', () => {
    expect(resolveHtmlAssetKeys('/landing/docs/faq.html')).toEqual(['landing/docs/faq.html'])
  })

  it('accepts extensionless doc paths', () => {
    expect(resolveHtmlAssetKeys('/landing/docs/faq')).toEqual(['landing/docs/faq.html', 'landing/docs/faq/index.html'])
  })

  it('leaves non-HTML assets under the same prefixes to the public handler', () => {
    expect(resolveHtmlAssetKeys('/landing/home.css')).toEqual([])
    expect(resolveHtmlAssetKeys('/landing/docs/docs.css')).toEqual([])
    expect(resolveHtmlAssetKeys('/landing/poppielogo-dark.png')).toEqual([])
  })

  it('ignores paths outside the static prefixes', () => {
    expect(resolveHtmlAssetKeys('/portfolio')).toEqual([])
    expect(resolveHtmlAssetKeys('/api/internal/vaults')).toEqual([])
    expect(resolveHtmlAssetKeys('/lend/0xabc')).toEqual([])
  })
})

describe('injectIntoHead', () => {
  const page = '<html><head>\n  <title>Docs</title>\n</head><body></body></html>'
  const ga = buildGaSnippet('G-TEST')

  it('adds the GA snippet right after <head>', () => {
    const out = injectIntoHead(page, ga, '')
    expect(out).toContain('googletagmanager.com/gtag/js?id=G-TEST')
    expect(out.indexOf('googletagmanager')).toBeLessThan(out.indexOf('<title>'))
  })

  it('adds og:image, twitter:image and twitter:card when the page lacks them', () => {
    const out = injectIntoHead(page, '', 'https://example.com/og.png')
    expect(out).toContain('<meta property="og:image" content="https://example.com/og.png">')
    expect(out).toContain('<meta name="twitter:image" content="https://example.com/og.png">')
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image">')
  })

  it('does not duplicate tags the page already defines', () => {
    const withOg = page.replace('<title>', '<meta property="og:image" content="https://poppie.io/og-image.png">\n  <title>')
    const out = injectIntoHead(withOg, '', 'https://example.com/og.png')
    expect(out.match(/og:image/g)).toHaveLength(1)
    expect(out).toContain('https://poppie.io/og-image.png')
    expect(out).not.toContain('og:image" content="https://example.com')
  })

  it('skips social tags for non-https image URLs', () => {
    const out = injectIntoHead(page, '', 'http://example.com/og.png')
    expect(out).not.toContain('og:image')
  })

  it('leaves the page untouched when nothing is configured', () => {
    expect(injectIntoHead(page, '', '')).toBe(page)
  })
})
