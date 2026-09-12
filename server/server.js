// Standalone emulation server for the current-time service.
//
// Stands in for the real service, which will be backed by libical
// (https://github.com/libical/libical). It never computes "now" - it only
// ever returns one of the hardcoded presets defined in presets.js, and the
// admin page (served from here too) lets you pick which one is active.
//
// `npm run dev`/`preview` mount the same request handler directly into Vite
// instead of talking to this process - this file exists so the API + admin
// page can also be run on their own, with no Vite/React involved at all.
//
// Zero npm dependencies: only Node's built-in http module (plus fs/url,
// pulled in by requestHandler.js).

import http from 'node:http'
import { handleRequest } from './requestHandler.js'

const PORT = Number(process.env.PORT ?? 3001)

const server = http.createServer(handleRequest)

server.listen(PORT, () => {
  console.log(`Epochly emulation server listening on http://localhost:${PORT}`)
  console.log(`Admin UI:          http://localhost:${PORT}/admin.html`)
  console.log(`Current time API:  http://localhost:${PORT}/time`)
})
