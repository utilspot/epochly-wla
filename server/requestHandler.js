// Shared HTTP handler for the emulation API + admin page.
//
// Used two ways:
//  - as the callback for a plain http.createServer() (server.js, standalone)
//  - as Connect middleware mounted on Vite's dev/preview server (vite.config.ts),
//    which is what lets `npm run dev`/`preview` serve the client, the API, and
//    the admin page all from the same port with no separate process.
//
// A plain http.createServer callback only ever receives (req, res); Connect
// middlewares receive (req, res, next). `next` being undefined is how this
// tells the two callers apart where behavior needs to differ (see the "/"
// route below).

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PRESET_ID, findPreset, listPresetSummaries } from './presets.js'
import { isValidTimeZone, reinterpretForTimezone } from './reinterpretForTimezone.js'
import { TIMEZONES_JSON } from './timezoneList.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? '*'

// Mutable in-memory state: which preset the API currently serves.
// Emulation-only - the real service will have no equivalent of this.
let activePresetId = DEFAULT_PRESET_ID

const STATIC_FILES = {
  '/admin.html': { file: 'admin.html', contentType: 'text/html; charset=utf-8' },
  '/admin.js': { file: 'admin.js', contentType: 'application/javascript; charset=utf-8' },
  '/admin.css': { file: 'admin.css', contentType: 'text/css; charset=utf-8' },
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON body')
  }
}

async function serveStaticFile(res, entry) {
  const filePath = path.join(__dirname, entry.file)
  try {
    const contents = await fs.readFile(filePath)
    res.writeHead(200, {
      'Content-Type': entry.contentType,
      'Content-Length': contents.length,
    })
    res.end(contents)
  } catch {
    sendJson(res, 404, { error: 'Not found' })
  }
}

export async function handleRequest(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'GET' && STATIC_FILES[url.pathname]) {
    await serveStaticFile(res, STATIC_FILES[url.pathname])
    return
  }

  if (req.method === 'GET' && url.pathname === '/') {
    // Standalone (no `next`): nothing else lives at "/", so send visitors to
    // the admin page. Mounted in Vite (`next` present): "/" belongs to the
    // React app, so let Vite's own handler serve it.
    if (next) return next()
    res.writeHead(302, { Location: '/admin.html' })
    res.end()
    return
  }

  if (req.method === 'POST' && url.pathname === '/time') {
    let body
    try {
      body = await readJsonBody(req)
    } catch (err) {
      sendJson(res, 400, { error: err.message })
      return
    }

    // "method" selects the response shape; absent defaults to "timet" so a
    // bare POST (or {"timezone": ...}/{"timet": ...} with no "method") keeps
    // working exactly as before this was added.
    const method = body.method ?? 'timet'

    if (method === 'timezones') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(TIMEZONES_JSON),
      })
      res.end(TIMEZONES_JSON)
      return
    }

    if (method !== 'timet') {
      sendJson(res, 400, { error: `Unrecognized "method" - expected "timet" or "timezones"` })
      return
    }

    const preset = findPreset(activePresetId)

    let timetOverride
    if (body.timet !== undefined) {
      if (typeof body.timet !== 'number' || !Number.isFinite(body.timet)) {
        sendJson(res, 400, { error: '"timet" must be a number (Unix seconds)' })
        return
      }
      timetOverride = Math.trunc(body.timet)
    }

    if (body.timezone === undefined) {
      // No zone requested: hand back the preset as-is, only substituting the
      // instant if "timet" overrode it (via UTC, matching the real server's
      // default zone when none is given).
      sendJson(res, 200, timetOverride === undefined ? preset : reinterpretForTimezone(preset, 'UTC', timetOverride))
      return
    }

    if (!isValidTimeZone(body.timezone)) {
      sendJson(res, 400, {
        error: `Unrecognized "timezone" - expected an IANA timezone id, e.g. "Europe/London"`,
      })
      return
    }

    sendJson(res, 200, reinterpretForTimezone(preset, body.timezone, timetOverride))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/presets') {
    sendJson(res, 200, {
      activePresetId,
      presets: listPresetSummaries(),
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/preset') {
    let body
    try {
      body = await readJsonBody(req)
    } catch (err) {
      sendJson(res, 400, { error: err.message })
      return
    }

    const preset = findPreset(body.presetId)
    if (!preset) {
      sendJson(res, 400, { error: `Unknown presetId: ${body.presetId}` })
      return
    }

    activePresetId = preset.presetId
    sendJson(res, 200, {
      activePresetId,
      current: preset,
    })
    return
  }

  if (next) return next()
  sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` })
}
