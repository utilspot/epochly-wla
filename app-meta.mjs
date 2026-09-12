// Single source of truth for the app's display name, shared by:
//  - vite.config.ts (injects it into src/index.html's <title>, via the
//    %APP_TITLE% placeholder)
//  - scripts/vite-run.mjs (writes it into dist/manifest.json's entries[0].title)
export const APP_TITLE = 'Epochly Current Time'
