/**
 * Mava chat widget — client-only Nuxt plugin.
 *
 * Loads the Mava web chat script lazily (via requestIdleCallback)
 * so it never blocks the critical rendering path. The token is
 * read from the NUXT_PUBLIC_MAVA_TOKEN runtime config.
 */
declare global {
  interface Window {
    Mava?: {
      initialize: () => void
      identify: (data: { customAttributes: Array<{ label: string, value: string }> }) => void
    }
    MavaWebChatToggle?: () => void
  }
}

export default defineNuxtPlugin(() => {
  const token = 'fa2635bec4735a8f9cd48fbd03a62855b7d8d1001b8d2d8a6bf1176788e55f8e'

  function loadMava() {
    const script = document.createElement('script')
    script.src = 'https://widget.mava.app'
    script.id = 'MavaWebChat'
    script.setAttribute('widget-version', 'v2')
    script.setAttribute('enable-sdk', 'true')
    script.setAttribute('data-token', token)
    script.onload = () => {
      window.Mava?.initialize()
    }
    document.head.appendChild(script)
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadMava)
  }
  else {
    setTimeout(loadMava, 3000)
  }
})
