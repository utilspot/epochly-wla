import { flagFor, type Country } from '../data/countries'

interface CountrySelectProps {
  countries: Country[]
  value: string
  onChange: (code: string) => void
}

export default function CountrySelect({ countries, value, onChange }: CountrySelectProps) {
  // `value` can be '' when the current timezone (picked via the advanced
  // timezone list) doesn't match any curated country - show a placeholder
  // instead of silently falling back to whatever option is first.
  const hasMatch = countries.some((country) => country.code === value)

  return (
    <label className="country-select">
      <span className="country-select__label">Show time in</span>
      <select
        className="country-select__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!hasMatch && (
          <option value="" disabled>
            Custom timezone
          </option>
        )}
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {flagFor(country)} {country.name}
          </option>
        ))}
      </select>
    </label>
  )
}
