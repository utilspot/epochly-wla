// Hardcoded response presets for the emulation server.
//
// Each preset mimics the payload the real service will eventually produce
// from libical's `icaltimetype` (year/month/day/hour/minute/second/is_date/
// is_utc, plus the observed timezone). Values here are fixed on purpose -
// this server never computes "now"; it only ever plays back one of these
// canned snapshots, selected via the admin page.

function utcSnapshot({ id, label, description, year, month, day, hour, minute, second }) {
  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second)
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return {
    presetId: id,
    label,
    description,
    icalString: `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}Z`,
    components: {
      year,
      month,
      day,
      hour,
      minute,
      second,
      isDate: false,
      isUtc: true,
      isDaylight: false,
      timezone: 'UTC',
      utcOffsetSeconds: 0,
    },
    epochSeconds: Math.floor(epochMs / 1000),
    isoString: new Date(epochMs).toISOString(),
  }
}

function zonedSnapshot({
  id,
  label,
  description,
  year,
  month,
  day,
  hour,
  minute,
  second,
  timezone,
  utcOffsetSeconds,
  isDaylight,
}) {
  // Local wall-clock time in `timezone`, expressed as its equivalent UTC instant.
  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second) - utcOffsetSeconds * 1000
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return {
    presetId: id,
    label,
    description,
    icalString: `TZID=${timezone}:${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}`,
    components: {
      year,
      month,
      day,
      hour,
      minute,
      second,
      isDate: false,
      isUtc: false,
      isDaylight,
      timezone,
      utcOffsetSeconds,
    },
    epochSeconds: Math.floor(epochMs / 1000),
    isoString: new Date(epochMs).toISOString(),
  }
}

export const PRESETS = [
  utcSnapshot({
    id: 'utc-now-fixed',
    label: 'UTC — Fixed Snapshot',
    description: 'A plain UTC timestamp, the simplest icaltimetype (is_utc=true).',
    year: 2026,
    month: 1,
    day: 1,
    hour: 12,
    minute: 0,
    second: 0,
  }),
  zonedSnapshot({
    id: 'new-york-edt',
    label: 'America/New_York — EDT (UTC-04:00)',
    description: 'Local time in a zone currently observing daylight saving time.',
    year: 2026,
    month: 7,
    day: 14,
    hour: 9,
    minute: 30,
    second: 0,
    timezone: 'America/New_York',
    utcOffsetSeconds: -4 * 3600,
    isDaylight: true,
  }),
  zonedSnapshot({
    id: 'tokyo-jst',
    label: 'Asia/Tokyo — JST (UTC+09:00)',
    description: 'Local time in a zone with a fixed positive UTC offset and no DST.',
    year: 2026,
    month: 7,
    day: 14,
    hour: 22,
    minute: 15,
    second: 0,
    timezone: 'Asia/Tokyo',
    utcOffsetSeconds: 9 * 3600,
    isDaylight: false,
  }),
  {
    presetId: 'all-day-date',
    label: 'All-Day DATE Value',
    description: 'VALUE=DATE icaltimetype: is_date=true, no time-of-day component.',
    icalString: '20260704',
    components: {
      year: 2026,
      month: 7,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
      isDate: true,
      isUtc: false,
      isDaylight: false,
      timezone: 'floating',
      utcOffsetSeconds: null,
    },
    epochSeconds: Math.floor(Date.UTC(2026, 6, 4, 0, 0, 0) / 1000),
    isoString: new Date(Date.UTC(2026, 6, 4, 0, 0, 0)).toISOString(),
  },
  utcSnapshot({
    id: 'leap-day-2028',
    label: 'Leap Day — Feb 29, 2028',
    description: 'Exercises leap-year handling (Feb 29 only exists on leap years).',
    year: 2028,
    month: 2,
    day: 29,
    hour: 0,
    minute: 0,
    second: 0,
  }),
  utcSnapshot({
    id: 'unix-epoch',
    label: 'Unix Epoch',
    description: 'epochSeconds = 0, the reference point for POSIX time.',
    year: 1970,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  }),
  utcSnapshot({
    id: 'y2038-edge',
    label: 'Y2038 Edge Case',
    description: 'The last second representable by a signed 32-bit Unix timestamp.',
    year: 2038,
    month: 1,
    day: 19,
    hour: 3,
    minute: 14,
    second: 7,
  }),
  {
    presetId: 'floating-time',
    label: 'Floating Time — No Timezone',
    description: 'is_utc=false with no zone: "floating" time, interpreted in the viewer\'s local zone.',
    icalString: '20260305T083000',
    components: {
      year: 2026,
      month: 3,
      day: 5,
      hour: 8,
      minute: 30,
      second: 0,
      isDate: false,
      isUtc: false,
      isDaylight: false,
      timezone: 'floating',
      utcOffsetSeconds: null,
    },
    epochSeconds: Math.floor(Date.UTC(2026, 2, 5, 8, 30, 0) / 1000),
    isoString: new Date(Date.UTC(2026, 2, 5, 8, 30, 0)).toISOString(),
  },
]

export const DEFAULT_PRESET_ID = PRESETS[0].presetId

export function findPreset(presetId) {
  return PRESETS.find((preset) => preset.presetId === presetId)
}

export function listPresetSummaries() {
  return PRESETS.map(({ presetId, label, description }) => ({ id: presetId, label, description }))
}
