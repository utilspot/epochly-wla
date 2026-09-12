// Re-expresses a preset's instant (its epochSeconds) as wall-clock time in a
// different IANA timezone, using only Node's built-in Intl - no tz database
// dependency needed. This is what lets a POST body's "timezone" field
// override a preset's own zone without the emulation server ever computing
// "now" itself (it still only ever plays back a preset's fixed instant).

function pad(value, width = 2) {
  return String(value).padStart(width, '0')
}

function getOffsetSeconds(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const get = (type) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))

  return Math.round((asUtc - date.getTime()) / 1000)
}

function isDaylightSavingActive(date, timeZone) {
  const offset = getOffsetSeconds(date, timeZone)
  const january = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const july = new Date(Date.UTC(date.getUTCFullYear(), 6, 1))
  const januaryOffset = getOffsetSeconds(january, timeZone)
  const julyOffset = getOffsetSeconds(july, timeZone)
  const daylightOffset = Math.max(januaryOffset, julyOffset)
  const standardOffset = Math.min(januaryOffset, julyOffset)
  return offset === daylightOffset && daylightOffset !== standardOffset
}

/** Throws if `timeZone` isn't a timezone Node's Intl implementation recognizes. */
export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

/**
 * Returns a new preset-shaped object with `components`/`icalString`
 * recomputed for `timeZone`. Uses `preset.epochSeconds` as the instant
 * unless `epochSecondsOverride` is given (a POST body's "timet"), in which
 * case `epochSeconds`/`isoString` are updated to match it too.
 */
export function reinterpretForTimezone(preset, timeZone, epochSecondsOverride) {
  const epochSeconds = epochSecondsOverride ?? preset.epochSeconds
  const date = new Date(epochSeconds * 1000)
  const canonicalZone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: canonicalZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((part) => part.type === type)?.value)

  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const second = get('second')

  const isUtc = canonicalZone === 'UTC'
  const utcOffsetSeconds = getOffsetSeconds(date, canonicalZone)
  const isDaylight = !isUtc && isDaylightSavingActive(date, canonicalZone)

  const icalBody = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}`
  const icalString = isUtc ? `${icalBody}Z` : `TZID=${canonicalZone}:${icalBody}`

  return {
    ...preset,
    icalString,
    components: {
      year,
      month,
      day,
      hour,
      minute,
      second,
      isDate: false,
      isUtc,
      isDaylight,
      timezone: canonicalZone,
      utcOffsetSeconds,
    },
    epochSeconds,
    isoString: date.toISOString(),
  }
}
