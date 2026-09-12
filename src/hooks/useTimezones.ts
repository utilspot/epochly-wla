import { useEffect, useState } from 'react'
import { fetchTimezones } from '../api/timeClient'
import { TIMEZONES as FALLBACK_TIMEZONES, buildTimezoneOptions, type TimezoneOption } from '../data/timezones'

/**
 * Starts with the browser's own Intl-derived timezone list (TIMEZONES) so
 * the control has something to show immediately, then swaps in the
 * server's own list once it arrives - the authoritative set of ids that
 * backend actually accepts, which isn't guaranteed to match the browser's.
 * Falls back to keeping the browser-derived list if the request fails.
 */
export function useTimezones(): TimezoneOption[] {
  const [timezones, setTimezones] = useState<TimezoneOption[]>(FALLBACK_TIMEZONES)

  useEffect(() => {
    let cancelled = false

    fetchTimezones()
      .then((ids) => {
        if (!cancelled) {
          setTimezones(buildTimezoneOptions(ids))
        }
      })
      .catch(() => {
        // Keep the browser-derived fallback list.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return timezones
}
