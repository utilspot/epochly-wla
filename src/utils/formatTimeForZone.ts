export interface ZonedTime {
  /** e.g. "Saturday, January 1, 2026, 07:00:00" */
  formatted: string
  /** e.g. "EST" or "GMT+9" - whatever Intl resolves the zone's short name to */
  zoneLabel: string
}

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()
const zoneLabelFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    dateTimeFormatterCache.set(timeZone, formatter)
  }
  return formatter
}

function getZoneLabelFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneLabelFormatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    zoneLabelFormatterCache.set(timeZone, formatter)
  }
  return formatter
}

/** Renders the instant `epochSeconds` as wall-clock time in `timeZone`. */
export function formatTimeForZone(epochSeconds: number, timeZone: string): ZonedTime {
  const date = new Date(epochSeconds * 1000)

  const formatted = getDateTimeFormatter(timeZone).format(date)

  const zoneLabel =
    getZoneLabelFormatter(timeZone)
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? timeZone

  return { formatted, zoneLabel }
}
