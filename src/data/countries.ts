export interface Country {
  /** ISO 3166-1 alpha-2 code, or "UTC" for the timezone-less fallback entry */
  code: string
  name: string
  /** IANA timezone id. Countries spanning multiple zones use one representative
   *  zone (their capital/most populous city) rather than enumerating every zone. */
  timezone: string
}

// A representative timezone per country, not an exhaustive IANA tzdata mapping -
// enough to let users compare "what time is it there" without pulling in a full
// tz/country dataset as a dependency.
export const COUNTRIES: Country[] = [
  { code: 'UTC', name: 'UTC (Coordinated Universal Time)', timezone: 'UTC' },
  { code: 'US', name: 'United States (New York)', timezone: 'America/New_York' },
  { code: 'CA', name: 'Canada (Toronto)', timezone: 'America/Toronto' },
  { code: 'MX', name: 'Mexico', timezone: 'America/Mexico_City' },
  { code: 'BR', name: 'Brazil', timezone: 'America/Sao_Paulo' },
  { code: 'AR', name: 'Argentina', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'GB', name: 'United Kingdom', timezone: 'Europe/London' },
  { code: 'IE', name: 'Ireland', timezone: 'Europe/Dublin' },
  { code: 'IS', name: 'Iceland', timezone: 'Atlantic/Reykjavik' },
  { code: 'PT', name: 'Portugal', timezone: 'Europe/Lisbon' },
  { code: 'ES', name: 'Spain', timezone: 'Europe/Madrid' },
  { code: 'FR', name: 'France', timezone: 'Europe/Paris' },
  { code: 'BE', name: 'Belgium', timezone: 'Europe/Brussels' },
  { code: 'NL', name: 'Netherlands', timezone: 'Europe/Amsterdam' },
  { code: 'DE', name: 'Germany', timezone: 'Europe/Berlin' },
  { code: 'CH', name: 'Switzerland', timezone: 'Europe/Zurich' },
  { code: 'AT', name: 'Austria', timezone: 'Europe/Vienna' },
  { code: 'IT', name: 'Italy', timezone: 'Europe/Rome' },
  { code: 'SE', name: 'Sweden', timezone: 'Europe/Stockholm' },
  { code: 'NO', name: 'Norway', timezone: 'Europe/Oslo' },
  { code: 'DK', name: 'Denmark', timezone: 'Europe/Copenhagen' },
  { code: 'FI', name: 'Finland', timezone: 'Europe/Helsinki' },
  { code: 'PL', name: 'Poland', timezone: 'Europe/Warsaw' },
  { code: 'CZ', name: 'Czechia', timezone: 'Europe/Prague' },
  { code: 'HU', name: 'Hungary', timezone: 'Europe/Budapest' },
  { code: 'RO', name: 'Romania', timezone: 'Europe/Bucharest' },
  { code: 'GR', name: 'Greece', timezone: 'Europe/Athens' },
  { code: 'TR', name: 'Turkey', timezone: 'Europe/Istanbul' },
  { code: 'UA', name: 'Ukraine', timezone: 'Europe/Kyiv' },
  { code: 'RU', name: 'Russia (Moscow)', timezone: 'Europe/Moscow' },
  { code: 'IL', name: 'Israel', timezone: 'Asia/Jerusalem' },
  { code: 'AE', name: 'United Arab Emirates', timezone: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { code: 'EG', name: 'Egypt', timezone: 'Africa/Cairo' },
  { code: 'ZA', name: 'South Africa', timezone: 'Africa/Johannesburg' },
  { code: 'NG', name: 'Nigeria', timezone: 'Africa/Lagos' },
  { code: 'KE', name: 'Kenya', timezone: 'Africa/Nairobi' },
  { code: 'IN', name: 'India', timezone: 'Asia/Kolkata' },
  { code: 'PK', name: 'Pakistan', timezone: 'Asia/Karachi' },
  { code: 'BD', name: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { code: 'TH', name: 'Thailand', timezone: 'Asia/Bangkok' },
  { code: 'VN', name: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  { code: 'ID', name: 'Indonesia (Jakarta)', timezone: 'Asia/Jakarta' },
  { code: 'SG', name: 'Singapore', timezone: 'Asia/Singapore' },
  { code: 'MY', name: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'PH', name: 'Philippines', timezone: 'Asia/Manila' },
  { code: 'CN', name: 'China', timezone: 'Asia/Shanghai' },
  { code: 'HK', name: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
  { code: 'TW', name: 'Taiwan', timezone: 'Asia/Taipei' },
  { code: 'KR', name: 'South Korea', timezone: 'Asia/Seoul' },
  { code: 'JP', name: 'Japan', timezone: 'Asia/Tokyo' },
  { code: 'AU', name: 'Australia (Sydney)', timezone: 'Australia/Sydney' },
  { code: 'NZ', name: 'New Zealand', timezone: 'Pacific/Auckland' },
  { code: 'FJ', name: 'Fiji', timezone: 'Pacific/Fiji' },
]

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((country) => country.code === code)
}

function countryCodeToFlagEmoji(code: string): string {
  if (code.length !== 2) return '🌐'
  const codePoints = [...code.toUpperCase()].map((char) => 0x1f1e6 + (char.charCodeAt(0) - 65))
  return String.fromCodePoint(...codePoints)
}

export function flagFor(country: Country): string {
  return country.code === 'UTC' ? '🌐' : countryCodeToFlagEmoji(country.code)
}

/**
 * Picks a sensible default country using only information the browser already
 * exposes (no geolocation permission prompt): first the IANA timezone the
 * browser resolves itself to, then falling back to the region encoded in the
 * user's language setting, then UTC.
 */
export function detectDefaultCountryCode(countries: Country[] = COUNTRIES): string {
  try {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const byTimeZone = countries.find((country) => country.timezone === browserTimeZone)
    if (byTimeZone) return byTimeZone.code
  } catch {
    // Intl unavailable - fall through to the next signal.
  }

  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    const byRegion = region && countries.find((country) => country.code === region)
    if (byRegion) return byRegion.code
  } catch {
    // Intl.Locale unsupported in this browser - fall through.
  }

  return 'UTC'
}
