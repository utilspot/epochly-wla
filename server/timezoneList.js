// Serialized once at module load (not per-request) - mirrors module.c's
// buildTimezonesJson, which caches libical's builtin timezone table the
// same way. Node's Intl.supportedValuesOf('timeZone') is cheap enough that
// this isn't really necessary for cost reasons, but doing it once keeps the
// two backends' POST /time {"method":"timezones"} behavior - and the shape
// of what they serve - consistent.

const FALLBACK_TIMEZONE_IDS = ['UTC', 'America/New_York', 'Europe/London', 'Europe/Kyiv', 'Asia/Tokyo']

function listTimezoneIds() {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      // fall through to the fallback list below
    }
  }
  return FALLBACK_TIMEZONE_IDS
}

export const TIMEZONES_JSON = JSON.stringify({ timezones: listTimezoneIds() })
