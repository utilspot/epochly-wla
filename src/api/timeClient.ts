import type { CurrentTimeResponse } from '../types/time'

// Same-origin by default: the dev/preview server proxies /api to the
// emulation server (see vite.config.ts), and the real libical-backed
// service serves the API from the same origin as the built client. Set
// VITE_API_BASE_URL only to point at a different host.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// The real service (module.c, via CMakeLists.txt's EPOCHLY_BASE_URL) mounts
// "time" under the same path prefix the client itself is served from, not
// at the origin root - e.g. built with --base-url=/epochly-wla, the
// endpoint is /epochly-wla/time. import.meta.env.BASE_URL is Vite's
// resolved base, bare with no trailing slash except at the root ("/"), so
// the join below adds the separator itself rather than assuming one is
// already there - mirrors scripts/vite-run.mjs's assetUrl() helper.
const BASE_URL = import.meta.env.BASE_URL
const TIME_URL = `${API_BASE_URL}${BASE_URL === '/' ? '/time' : `${BASE_URL}/time`}`

interface TimezonesResponse {
  timezones: string[]
}

async function postTime<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(TIME_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new Error(errorBody?.error ?? `Request to ${TIME_URL} failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

/**
 * Fetches the current time via {"method": "timet"} (the default when
 * `method` is omitted). Both the emulation server and the real
 * libical-backed service expose this as a POST so an IANA `timezone` (e.g.
 * "Europe/London") can be passed in the body to override the server's
 * default; omit it to get that default.
 */
export function fetchCurrentTime(timezone?: string): Promise<CurrentTimeResponse> {
  return postTime<CurrentTimeResponse>(timezone ? { timezone } : {})
}

/**
 * Fetches every IANA timezone id the server accepts as a `fetchCurrentTime`
 * `timezone` value, via {"method": "timezones"} - the authoritative list
 * for whichever backend is actually answering, rather than the browser's
 * own (possibly slightly different) Intl data.
 */
export async function fetchTimezones(): Promise<string[]> {
  const { timezones } = await postTime<TimezonesResponse>({ method: 'timezones' })
  return timezones
}
