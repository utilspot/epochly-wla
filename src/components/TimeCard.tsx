import type { ReactNode } from 'react'
import type { CurrentTimeResponse } from '../types/time'
import CopyButton from './CopyButton'

interface TimeCardProps {
  /** The timezone/country picker, rendered above the time display so
   *  selecting a location and reading the result live in the same form. */
  picker: ReactNode
  /** The country/timezone mode checkbox, rendered at the bottom of the
   *  form (after the time display) rather than next to the picker itself. */
  pickerModeToggle: ReactNode
  data: CurrentTimeResponse | null
  isLoading: boolean
  onRefresh: () => void
  isRefreshing: boolean
  /** True while the most recent poll has failed - the displayed value is
   *  just a local extrapolation until the next poll succeeds again. */
  isOffline: boolean
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatUtcOffset(components: CurrentTimeResponse['components']): string {
  return components.utcOffsetSeconds === null
    ? 'floating (none)'
    : `${components.utcOffsetSeconds >= 0 ? '+' : ''}${components.utcOffsetSeconds / 3600}h`
}

function formatFlags(components: CurrentTimeResponse['components']): string {
  return [components.isUtc ? 'UTC' : 'local', components.isDate ? 'DATE-only' : null, components.isDaylight ? 'DST' : null]
    .filter(Boolean)
    .join(', ')
}

export default function TimeCard({
  picker,
  pickerModeToggle,
  data,
  isLoading,
  onRefresh,
  isRefreshing,
  isOffline,
}: TimeCardProps) {
  return (
    <div className="time-card">
      {picker}

      {!data ? (
        isLoading && <p className="status status--loading">Loading current time…</p>
      ) : (
        <>
          <div className="time-card__header">
            {/* The real (libical-backed) service always computes live time and
             * doesn't send a label - only the emulation server's presets do. */}
            <span className={`time-card__preset-badge${isOffline ? ' time-card__preset-badge--offline' : ''}`}>
              {isOffline ? 'Offline' : (data.label ?? 'Live Time')}
            </span>
            <button
              type="button"
              className="time-card__refresh-button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh now"
              title="Refresh now"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
          </div>

          <div className="time-card__big-time">
            {data.components.isDate
              ? `${data.components.year}-${pad(data.components.month)}-${pad(data.components.day)}`
              : `${pad(data.components.hour)}:${pad(data.components.minute)}:${pad(data.components.second)}`}
          </div>

          <dl className="time-card__grid">
            <div>
              <dt>iCal string</dt>
              <dd>
                <code>{data.icalString}</code>
                <CopyButton value={data.icalString} label="iCal string" />
              </dd>
            </div>
            <div>
              <dt>ISO 8601</dt>
              <dd>
                <code>{data.isoString}</code>
                <CopyButton value={data.isoString} label="ISO 8601" />
              </dd>
            </div>
            <div>
              <dt>Epoch seconds</dt>
              <dd>
                <code>{data.epochSeconds}</code>
                <CopyButton value={String(data.epochSeconds)} label="epoch seconds" />
              </dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>
                <span>{data.components.timezone}</span>
                <CopyButton value={data.components.timezone} label="timezone" />
              </dd>
            </div>
            <div>
              <dt>UTC offset</dt>
              <dd>
                <span>{formatUtcOffset(data.components)}</span>
                <CopyButton value={formatUtcOffset(data.components)} label="UTC offset" />
              </dd>
            </div>
            <div>
              <dt>Flags</dt>
              <dd>
                <span>{formatFlags(data.components)}</span>
                <CopyButton value={formatFlags(data.components)} label="flags" />
              </dd>
            </div>
          </dl>
        </>
      )}

      {pickerModeToggle}
    </div>
  )
}
