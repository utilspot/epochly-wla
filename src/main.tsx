import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'
import App from './App'
import './styles/app.css'

// Windows' emoji font has no country flags, so Chromium browsers there render
// flag emoji as two letters ("GB"). This loads a flags-only web font - bundled
// into dist/ rather than fetched from a CDN - only on browsers that need it.
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl)

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
