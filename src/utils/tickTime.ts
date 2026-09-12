import type { CurrentTimeResponse } from '../types/time'

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/**
 * Advances `response` to `epochSeconds`, recomputing only the parts that
 * change second-to-second (date/time components, icalString, isoString) via
 * Intl - not the UTC offset/DST/zone flags, which the next server poll
 * refreshes anyway (they essentially never change within a single ~5s poll
 * window). This is what lets the clock keep visibly ticking between polls
 * without hitting the network every second.
 */
export function tickTime(response: CurrentTimeResponse, epochSeconds: number): CurrentTimeResponse {
  if (epochSeconds === response.epochSeconds) return response

  const { components } = response
  const date = new Date(epochSeconds * 1000)
  // "floating" has no real IANA zone - Intl's own default (the viewer's
  // local zone) is the closest reasonable interpretation.
  const timeZone = components.timezone === 'floating' ? undefined : components.timezone

  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date)
  } catch {
    // An id Intl can't resolve (e.g. a non-IANA timezone string from a
    // misbehaving backend) shouldn't crash the whole app - just skip this
    // tick and keep showing the last good value; the next real poll will
    // either fix or replace it.
    return response
  }
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)

  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const second = get('second')

  const icalBody = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}`
  // Mirror whatever style the last real response actually used, rather than
  // assuming one convention: the real (libical-backed) service emits a bare
  // RFC 5545 value with no "TZID=" prefix, while the JS emulation server's
  // presets prefix zoned values with "TZID=<id>:" - matching the response's
  // own style keeps a locally-ticked value identical in format to whichever
  // backend is actually answering, instead of drifting from it every tick.
  const hadTzidPrefix = response.icalString.startsWith('TZID=')
  const icalString = components.isUtc ? `${icalBody}Z` : hadTzidPrefix && timeZone ? `TZID=${timeZone}:${icalBody}` : icalBody

  const hadMilliseconds = /\.\d{3}Z$/.test(response.isoString)
  const isoString = hadMilliseconds ? date.toISOString() : date.toISOString().replace(/\.\d{3}Z$/, 'Z')

  return {
    ...response,
    epochSeconds,
    isoString,
    icalString,
    components: {
      ...components,
      year,
      month,
      day,
      hour,
      minute,
      second,
    },
  }
}
