# Epochly — Current Time Service (UI)

A React + TypeScript UI for a "current time" service, paired with a hardcoded-JSON
emulation server that stands in for the real service (which will be backed by
[libical](https://github.com/libical/libical)).

## Layout

```
src/            React/TypeScript client source (built by Vite into dist/)
dist/           Build output — hashed HTML/CSS/JS, favicon, and manifest.json
                 (the file module.c loads to know what to serve - see below)
scripts/        vite-run.mjs - dev/build/preview wrapper that understands
                 --base-url and writes dist/manifest.json after a build
server/         Emulation server (plain Node.js, zero npm dependencies)
  requestHandler.js   The actual GET/POST route logic, shared by both entry points below
  server.js       Standalone entry point: `node server/server.js` runs just the
                   API + admin page, no Vite/React involved, on its own port
  presets.js      Hardcoded response presets
  admin.html/.js/.css   Admin page for choosing the active preset
```

`server/requestHandler.js` is written as Connect-style middleware (`(req,
res, next)`), so `vite.config.ts` mounts it directly into Vite's own
dev/preview server via a small plugin. That means `npm run dev`/`preview`
serve the React app, the `/time` JSON endpoint, and the admin page all
from one process on one port — there's no second server to run or proxy to.
`server/server.js` still runs that same handler standalone (its own port,
no Vite) for cases where you want just the API, mirroring how the real
libical-backed service will eventually run on its own.

## Requirements note

All npm packages are listed under `devDependencies` only. The client is
bundled by Vite into static files in `dist/`, so React etc. are only needed
at build time. The emulation server uses nothing but Node's built-in `http`,
`fs`, and `url` modules, so it needs no runtime packages either.

## Getting started

```bash
npm install
npm run start   # (same as `npm run dev`)
```

That's one process on one port: open http://localhost:5173 for the UI, and
http://localhost:5173/admin.html to change which preset the API returns.

If you specifically want the emulation API/admin page without any
Vite/React tooling — e.g. to poke at it directly, or to mirror how the real
service runs standalone — run `node server/server.js` instead; it listens
on its own port (`:3001` by default, override with `PORT=`).

Copy `.env.example` to `.env` if you need to point the client at a
different API base URL — by default it calls same-origin (`/time`),
which is what both the merged dev server and the real deployment expect.

## Building for deployment

```bash
npm run build
```

Produces `dist/index.html`, hashed CSS/JS bundles, `favicon.svg`, and
`manifest.json` — static client files only. Serve `dist/` with any static
file host; point it at a running instance of the (real or emulation) server
via `VITE_API_BASE_URL` at build time.

### Serving under a URL sub-path

Pass `--base-url` to `npm run dev` / `npm run build` / `npm run preview` if
the app is served from somewhere other than the domain root (e.g. behind a
reverse proxy at `/epochly`). Every generated URL — script/style tags, the
favicon link, asset imports, and the client's own `/time` API call — is
prefixed accordingly:

```bash
npm run build --base-url=/epochly
npm run dev --base-url=/epochly
```

A trailing slash is optional and gets normalized away (`/epochly/` and
`/epochly` both resolve to the same bare `/epochly`) — see
`normalizeBaseUrl` in `scripts/vite-run.mjs`. That same bare value is what
ends up in `dist/manifest.json`'s `base`/`entries[0].main` fields and in
`index.html`'s generated asset URLs, so the two can't drift apart; asset
URLs insert their own `/` separator rather than relying on the base
already having a trailing one.

This is what `CMakeLists.txt` passes via `EPOCHLY_BASE_URL` when building
through CMake (which always ensures a trailing slash on its own copy, used
to build `EPOCHLY_SERVICE_URL` — the exact route `module.c` registers for
`POST <base>/time`). Vite's own CLI doesn't understand `--base-url`, so
`npm run dev`/`build`/`preview` go through `scripts/vite-run.mjs`, a thin
wrapper that reads the flag, forwards it to Vite's `base` option, and
(on `build`) writes `dist/manifest.json` afterwards — the file `module.c`
loads via `NQWebManifestListenersInit` to know what to serve and where.

## The real (libical-backed) server

`CMakeLists.txt` builds the native counterpart to the emulation server:
`module.c` into `epochly_wla` (a `libnetq` web module) and `server.c` into
`epochly_server` (a standalone host for it) — see `module.c`'s
`requestIcalHandler`, which computes live time via libical instead of
replaying a preset. It reports UTC by default; see the API contract below
for how a request overrides that per-call.

## API contract

Everything goes through a single `POST /time` (or `POST <base-url>/time`
when served under a sub-path — see above; `src/api/timeClient.ts` builds
that URL from Vite's own resolved base, so it always matches). The body is
a JSON object whose `method` field picks the response shape; `method` can
be omitted, in which case it defaults to `"timet"` (so a bare `POST /time`,
or one with just `timezone`/`timet` and no `method`, works exactly as if
you'd sent `{"method": "timet", ...}`).

### `{"method": "timet", ...}` (or `method` omitted)

Returns a payload shaped after libical's `icaltimetype`
(year/month/day/hour/minute/second/is_date/is_utc/zone). Two more optional
fields:

- `timezone` — any IANA id (e.g. `"Europe/London"`). Omit it to get the
  server's default (UTC on the real server, or the emulation server's
  active preset's own zone). An unrecognized id gets a `400` with an
  `error` message rather than silently falling back.
- `timet` — a Unix timestamp (seconds) to use instead of "now". On the
  emulation server this overrides the active preset's instant rather than
  the actual current time (it still never calls the system clock). A
  non-number `timet` is ignored rather than rejected.

```bash
curl -X POST /time -H 'Content-Type: application/json' -d '{"timezone": "Europe/London", "timet": 0}'
```

```json
{
  "presetId": "utc-now-fixed",
  "label": "UTC — Fixed Snapshot",
  "description": "A plain UTC timestamp, the simplest icaltimetype (is_utc=true).",
  "icalString": "20260101T120000Z",
  "components": {
    "year": 2026,
    "month": 1,
    "day": 1,
    "hour": 12,
    "minute": 0,
    "second": 0,
    "isDate": false,
    "isUtc": true,
    "isDaylight": false,
    "timezone": "UTC",
    "utcOffsetSeconds": 0
  },
  "epochSeconds": 1767268800,
  "isoString": "2026-01-01T12:00:00.000Z"
}
```

On the emulation server, a `timezone` override re-expresses the active
preset's instant (`epochSeconds`) in that zone via `Intl.DateTimeFormat`
(see `server/reinterpretForTimezone.js`) — it still never computes "now"
itself, it just reformats whichever preset's fixed instant is active.

The emulation server never computes "now" — it always plays back one of the
fixed presets in `server/presets.js` (UTC, a DST zone, a fixed-offset zone,
an all-day DATE value, a leap day, the Unix epoch, the Y2038 boundary, and a
floating/timezone-less time), selected via the admin page.

### `{"method": "timezones"}`

```bash
curl -X POST /time -H 'Content-Type: application/json' -d '{"method": "timezones"}'
```

Returns `{"timezones": ["Africa/Abidjan", ...]}` — every IANA id the server
accepts as a `timezone` value for the `timet` method. Both backends build
this list once at startup (`buildTimezonesJson` in `module.c`,
`server/timezoneList.js` for the emulation server) and serve the same
cached response on every request rather than recomputing it - the real
server's is `icaltimezone_get_builtin_timezones()`; the emulation server's
is `Intl.supportedValuesOf('timeZone')`. The two lists aren't guaranteed to
be identical (different data sources), so a name valid on one may not
resolve on the other.

An unrecognized `method` (anything other than `"timet"`/absent or
`"timezones"`) gets a `400` with an `error` message.
