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
  const token = 'b1b9784e81c423a48ac0688b5239a32381f201259d0fa1d39c089c036a0ec5ff'

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
