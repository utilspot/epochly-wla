/**
 * Shape of the "current time" payload.
 *
 * Mirrors the fields of libical's `icaltimetype` struct (year/month/day/
 * hour/minute/second/is_date/is_utc, plus zone) so the emulation server's
 * responses - and this UI - match what the real libical-backed service
 * will eventually return.
 */
export interface IcalTimeComponents {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** true => VALUE=DATE (no time-of-day component) */
  isDate: boolean
  /** true => time is expressed in UTC ("Z" suffix) */
  isUtc: boolean
  /** true => the zone is currently observing daylight saving time */
  isDaylight: boolean
  /** IANA timezone id, "UTC", or "floating" for a timezone-less local time */
  timezone: string
  /** UTC offset in seconds, or null for floating time */
  utcOffsetSeconds: number | null
}

export interface CurrentTimeResponse {
  /** Only the emulation server's presets send these; the real (libical-backed)
   *  service always computes live time and omits them - the UI falls back to
   *  its own hardcoded copy when absent (see TimeCard). */
  presetId?: string
  label?: string
  description?: string
  /** iCalendar-formatted date-time string, e.g. "20260101T120000Z" */
  icalString: string
  components: IcalTimeComponents
  epochSeconds: number
  isoString: string
}

export interface TimePreset {
  id: string
  label: string
  description: string
}

export interface PresetsResponse {
  activePresetId: string
  presets: TimePreset[]
}
