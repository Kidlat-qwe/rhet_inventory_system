import apiKeyManagementHtml from './api-key-management.html?raw'
import partnerOnboardingHtml from './partner-onboarding.html?raw'
import docsIndexHtml from './index.html?raw'

/**
 * Bundled integration docs. Opened via about:blank + document.write so they work
 * on deployed SPA hosts that rewrite /docs/*.html to the React app.
 * Localhost Vite can still serve public/docs directly; this path is reliable everywhere.
 */
const DOCS = {
  'api-key-management.html': apiKeyManagementHtml,
  'partner-onboarding.html': partnerOnboardingHtml,
  'index.html': docsIndexHtml,
}

function absoluteAssetBase() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  return `${window.location.origin}${base}`
}

/** Rewrite app asset paths like /rhet-logo.png; leave /docs/* for click handlers. */
function rewriteAssetPaths(html) {
  const root = absoluteAssetBase()
  return String(html || '').replace(
    /(src|href)="\/(?!\/)(?!docs\/)([^"]*)"/g,
    (_, attr, path) => `${attr}="${root}/${path}"`,
  )
}

function wireDocNavigation(html) {
  const withHandlers = String(html || '').replace(
    /href="\/docs\/([^"]+)"/g,
    (_match, name) => (
      `href="#${name}" onclick="if(window.opener&&typeof window.opener.__rhetOpenIntegrationDoc==='function'){window.opener.__rhetOpenIntegrationDoc('${name}');}return false;"`
    ),
  )

  const bridge = `<script>
    window.__rhetDocBridge=true;
  </script>`

  if (withHandlers.includes('</body>')) {
    return withHandlers.replace('</body>', `${bridge}</body>`)
  }
  return `${withHandlers}${bridge}`
}

/**
 * Open a bundled HTML guide in a new tab.
 * @param {'api-key-management.html'|'partner-onboarding.html'|'index.html'} filename
 */
export function openIntegrationDoc(filename) {
  if (!DOCS[filename]) {
    throw new Error(`Unknown documentation file: ${filename}`)
  }

  // Expose opener callback so in-doc links can open sibling guides.
  window.__rhetOpenIntegrationDoc = openIntegrationDoc

  const html = wireDocNavigation(rewriteAssetPaths(DOCS[filename]))
  const popup = window.open('about:blank', '_blank')
  if (!popup) {
    throw new Error('Pop-up blocked. Allow pop-ups for this site to open documentation.')
  }

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  try {
    popup.focus()
  } catch {
    // Ignore focus errors from some browsers.
  }
}

export const INTEGRATION_DOC_LINKS = [
  {
    id: 'api-key-management',
    file: 'api-key-management.html',
    title: 'How API Keys work',
    description: 'Generate, regenerate, revoke, and what to share with partners',
  },
  {
    id: 'partner-onboarding',
    file: 'partner-onboarding.html',
    title: 'Partner onboarding overview',
    description: 'High-level flow for connecting an external system to RHET',
  },
  {
    id: 'index',
    file: 'index.html',
    title: 'All integration docs',
    description: 'Index of in-app guides for admins and partner handoff',
  },
]
