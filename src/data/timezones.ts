export interface TimezoneOption {
  id: string
  label: string
}

// Used only if the runtime doesn't support Intl.supportedValuesOf (older
// engines) - a small set of major zones so the control still works.
const FALLBACK_TIMEZONE_IDS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Kyiv',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
]

function listTimezoneIds(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      // fall through to the fallback list below
    }
  }
  return FALLBACK_TIMEZONE_IDS
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

function offsetLabel(timezone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')
    return part?.value ?? ''
  } catch {
    return ''
  }
}

/**
 * Labels each id with its current UTC offset, e.g. "Asia/Tokyo (GMT+9)".
 * Silently drops anything Intl can't resolve - a backend (the emulation
 * server's Intl.supportedValuesOf list should always be clean, but the
 * real libical-backed one enumerates its own builtin table, which can
 * include non-IANA legacy ids) shouldn't be trusted to only ever send
 * usable timezone strings.
 */
export function buildTimezoneOptions(ids: string[]): TimezoneOption[] {
  return ids.filter(isValidTimeZone).map((id) => {
    const offset = offsetLabel(id)
    return { id, label: offset ? `${id} (${offset})` : id }
  })
}

// Computed once at module load from the browser's own Intl data. Used as
// the initial/fallback list before the server's own list (the source of
// truth for which ids it actually accepts) arrives - see useTimezones.
export const TIMEZONES: TimezoneOption[] = buildTimezoneOptions(listTimezoneIds())

/** The browser's own IANA timezone, with no permission prompt required. */
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}
