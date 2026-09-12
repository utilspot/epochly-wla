import type { TimezoneOption } from '../data/timezones'

interface TimezoneSelectProps {
  timezones: TimezoneOption[]
  value: string
  onChange: (timezone: string) => void
}

export default function TimezoneSelect({ timezones, value, onChange }: TimezoneSelectProps) {
  return (
    <label className="timezone-select">
      <span className="timezone-select__label">Show time in</span>
      <select
        className="timezone-select__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {timezones.map((timezone) => (
          <option key={timezone.id} value={timezone.id}>
            {timezone.label}
          </option>
        ))}
      </select>
    </label>
  )
}
