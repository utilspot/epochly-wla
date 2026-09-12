#!/usr/bin/env node
// Thin wrapper around Vite's JS API so `npm run dev`/`npm run build`/`npm run preview`
// accept a `--base-url=<base-url>` argument.
//
// Vite's own CLI rejects unrecognized flags before it ever loads vite.config.ts, so
// `vite build --base-url=/x/` fails outright. Going through the programmatic API lets
// us translate --base-url into Vite's `base` option ourselves and merge it on top of
// vite.config.ts.
//
// npm's behavior differs depending on how the flag is passed:
//   npm run build --base-url=/x/      -> npm treats it as an unknown npm config and
//                                         exposes it as process.env.npm_config_base_url
//                                         (nothing is appended to argv)
//   npm run build -- --base-url=/x/   -> forwarded verbatim as a CLI argument
// so both sources are checked below.
//
// After a build, this also writes dist/manifest.json - the file module.c loads
// (via NQWebManifestListenersInit) to know what to serve. It lists every file in
// dist/ alongside the app metadata the native module needs.

import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_TITLE } from '../app-meta.mjs'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const outDir = path.join(rootDir, 'dist')

const [, , command = 'dev', ...rest] = process.argv

function findFlagValue(args, flag) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === flag) return args[i + 1]
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1)
  }
  return undefined
}

// Only ensures a leading slash and strips any trailing one (root "/" is
// left alone - stripping it would leave an invalid empty string). Vite
// itself joins `base` with each asset path correctly whether or not `base`
// ends in a slash, so there's no reason to force one here - keeping the
// bare form (e.g. "/123") is what should show up consistently in both
// index.html's generated asset URLs and dist/manifest.json.
function normalizeBaseUrl(url) {
  if (!url) return undefined
  const leading = url.startsWith('/') ? url : `/${url}`
  return leading.length > 1 && leading.endsWith('/') ? leading.slice(0, -1) : leading
}

const rawBaseUrl = findFlagValue(rest, '--base-url') ?? process.env.npm_config_base_url
const baseUrl = normalizeBaseUrl(rawBaseUrl)

const resolvedBase = baseUrl ?? '/'
const inlineConfig = baseUrl ? { base: baseUrl } : {}

if (baseUrl) {
  console.log(`Using base URL: ${baseUrl}`)
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function mimeTypeFor(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

async function listFilesRecursive(dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, baseDir)))
    } else {
      files.push(path.relative(baseDir, fullPath).split(path.sep).join('/'))
    }
  }
  return files
}

// Joins a (possibly bare, e.g. "/123") base with a filename, without
// doubling the slash for the root case ("/" + "favicon.svg" -> "/favicon.svg",
// not "//favicon.svg").
function assetUrl(base, file) {
  return base === '/' ? `/${file}` : `${base}/${file}`
}

// Lists every file vite build actually emitted into dist/ (bundled JS/CSS plus
// whatever was copied from src/public, e.g. favicon.svg) and points module.c's
// manifest at each of them under the resolved base URL.
async function writeManifest(base) {
  const pkg = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
  const files = (await listFilesRecursive(outDir)).filter((file) => file !== 'manifest.json')

  const manifest = {
    name: pkg.name,
    base,
    entries: [
      {
        title: APP_TITLE,
        version: pkg.version,
        description: pkg.description,
        main: base,
        icons: [
          { url: assetUrl(base, 'favicon.svg'), colorScheme: 'light' },
          { url: assetUrl(base, 'favicon.svg'), colorScheme: 'dark' },
        ],
        screenshots: [
          { url: assetUrl(base, 'logo_wla.svg'), colorScheme: 'light' },
          { url: assetUrl(base, 'logo_wla.svg'), colorScheme: 'dark' },
        ],
      },
    ],
    files: files.map((file) => ({
      url: file === 'index.html' ? base : assetUrl(base, file),
      file,
      type: mimeTypeFor(file),
    })),
  }

  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log('Wrote dist/manifest.json')
}

const vite = await import('vite')

switch (command) {
  case 'build': {
    await vite.build(inlineConfig)
    await writeManifest(resolvedBase)
    break
  }
  case 'preview': {
    const server = await vite.preview(inlineConfig)
    server.printUrls()
    break
  }
  case 'dev': {
    const server = await vite.createServer(inlineConfig)
    await server.listen()
    server.printUrls()
    break
  }
  default: {
    console.error(`Unknown command: ${command} (expected dev, build, or preview)`)
    process.exit(1)
  }
}
