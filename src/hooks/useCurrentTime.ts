import { useEffect, useRef, useState } from 'react'
import { fetchCurrentTime } from '../api/timeClient'
import type { CurrentTimeResponse } from '../types/time'
import { tickTime } from '../utils/tickTime'

const POLL_INTERVAL_MS = 5000
const TICK_INTERVAL_MS = 1000

interface UseCurrentTimeResult {
  data: CurrentTimeResponse | null
  error: string | null
  isLoading: boolean
  refresh: () => void
}

interface Anchor {
  epochSeconds: number
  fetchedAtMs: number
}

export function useCurrentTime(timezone: string): UseCurrentTimeResult {
  const [data, setData] = useState<CurrentTimeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const isMounted = useRef(true)
  // The last server response's instant plus when it was received - the
  // reference point the 1s ticker advances from between polls.
  const anchorRef = useRef<Anchor | null>(null)
  // epochSeconds *and* the requested timezone from the last poll (distinct
  // from the anchor, which only moves when this actually changes - see
  // load() below). Both matter: switching timezone can leave epochSeconds
  // unchanged (same instant, different display) while still requiring an
  // immediate resync.
  const lastRawKeyRef = useRef<string | null>(null)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetchCurrentTime(timezone)
        if (!cancelled && isMounted.current) {
          // The emulation server replays a fixed preset instant rather than
          // computing "now", so back-to-back polls often return the exact
          // same epochSeconds. Re-anchoring on every poll would snap the
          // locally-ticked clock backward to that stale value every
          // POLL_INTERVAL_MS. Only resync when the instant actually moved -
          // a real clock (the libical-backed server) advancing, or the
          // active preset/timezone changing - and otherwise leave the
          // already-ticking display alone.
          const rawKey = `${response.epochSeconds}|${timezone}`
          const changed = rawKey !== lastRawKeyRef.current
          lastRawKeyRef.current = rawKey

          if (changed || !anchorRef.current) {
            setData(response)
            anchorRef.current = { epochSeconds: response.epochSeconds, fetchedAtMs: Date.now() }
          }
          setError(null)
        }
      } catch (err) {
        if (!cancelled && isMounted.current) {
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      } finally {
        if (!cancelled && isMounted.current) {
          setIsLoading(false)
        }
      }
    }

    load()
    const intervalId = setInterval(load, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [tick, timezone])

  // Advances the displayed clock every second from the last real anchor, so
  // it keeps ticking instead of sitting frozen between POST /time calls.
  // Runs once for the component's lifetime - the polling effect above is
  // what keeps anchorRef in sync when the server's instant genuinely moves.
  useEffect(() => {
    const tickIntervalId = setInterval(() => {
      const anchor = anchorRef.current
      if (!anchor) return

      const elapsedSeconds = Math.round((Date.now() - anchor.fetchedAtMs) / 1000)
      const tickedEpochSeconds = anchor.epochSeconds + elapsedSeconds

      setData((current) => (current ? tickTime(current, tickedEpochSeconds) : current))
    }, TICK_INTERVAL_MS)

    return () => clearInterval(tickIntervalId)
  }, [])

  return {
    data,
    error,
    isLoading,
    refresh: () => setTick((value) => value + 1),
  }
}
