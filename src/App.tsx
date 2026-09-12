import { useMemo, useState } from 'react'
import { useCurrentTime } from './hooks/useCurrentTime'
import { useTimezones } from './hooks/useTimezones'
import TimeCard from './components/TimeCard'
import TimezoneSelect from './components/TimezoneSelect'
import CountrySelect from './components/CountrySelect'
import { detectBrowserTimezone } from './data/timezones'
import { COUNTRIES, detectDefaultCountryCode, findCountry } from './data/countries'

type PickerMode = 'country' | 'timezone'

export default function App() {
  const [timezone, setTimezone] = useState(() => {
    // Prefer a curated country's timezone so the country picker starts in
    // sync; only fall back to the raw browser zone if none matched.
    const country = findCountry(detectDefaultCountryCode())
    return country?.timezone ?? detectBrowserTimezone()
  })
  const [pickerMode, setPickerMode] = useState<PickerMode>('country')
  const { data, error, isLoading, refresh } = useCurrentTime(timezone)
  const timezones = useTimezones()

  // Derived, not separate state, so the two pickers can never drift apart -
  // whichever one last changed `timezone` wins, the other just reflects it.
  const selectedCountryCode = useMemo(
    () => COUNTRIES.find((country) => country.timezone === timezone)?.code ?? '',
    [timezone],
  )

  return (
    <div className="app">
      <header className="app__header">
        {import.meta.env.BASE_URL !== '/' && (
          <a className="app__home-link" href="/">
            Home
          </a>
        )}
        <h1>Current Time</h1>
      </header>

      <main className="app__main">
        <TimeCard
          picker={
            <div className="location-picker">
              {pickerMode === 'country' ? (
                <CountrySelect
                  countries={COUNTRIES}
                  value={selectedCountryCode}
                  onChange={(code) => {
                    const country = findCountry(code)
                    if (country) setTimezone(country.timezone)
                  }}
                />
              ) : (
                <TimezoneSelect timezones={timezones} value={timezone} onChange={setTimezone} />
              )}
            </div>
          }
          pickerModeToggle={
            <label className="location-picker__checkbox">
              <input
                type="checkbox"
                checked={pickerMode === 'timezone'}
                onChange={(event) => setPickerMode(event.target.checked ? 'timezone' : 'country')}
              />
              Timezone
            </label>
          }
          data={data}
          isLoading={isLoading}
          onRefresh={refresh}
          isRefreshing={isLoading}
          isOffline={error !== null}
        />
      </main>

      <footer className="app__footer">
        Copyright © 2026 · MIT ·{' '}
        <a href="https://github.com/utilspot/epochly-wla" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  )
}
