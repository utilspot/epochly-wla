// Vanilla JS admin UI - no build step, served as-is by server.js.

const statusEl = document.getElementById('status')
const listEl = document.getElementById('preset-list')
const previewEl = document.getElementById('preview')

function setStatus(message, kind) {
  statusEl.textContent = message
  statusEl.className = 'status' + (kind ? ` status--${kind}` : '')
}

async function fetchJson(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`)
  }
  return body
}

function renderPresets(activePresetId, presets) {
  listEl.innerHTML = ''

  for (const preset of presets) {
    const item = document.createElement('li')
    item.className = 'preset-item' + (preset.id === activePresetId ? ' preset-item--active' : '')

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'preset'
    radio.value = preset.id
    radio.checked = preset.id === activePresetId
    radio.id = `preset-${preset.id}`

    const labelWrap = document.createElement('div')
    const label = document.createElement('div')
    label.className = 'preset-item__label'
    label.textContent = preset.label

    const description = document.createElement('div')
    description.className = 'preset-item__description'
    description.textContent = preset.description

    labelWrap.append(label, description)
    item.append(radio, labelWrap)

    item.addEventListener('click', () => {
      if (radio.checked) return
      radio.checked = true
      applyPreset(preset.id)
    })

    listEl.append(item)
  }
}

async function applyPreset(presetId) {
  try {
    setStatus('Applying preset…')
    const result = await fetchJson('/api/admin/preset', {
      method: 'POST',
      body: JSON.stringify({ presetId }),
    })
    setStatus(`Active preset: ${result.current.label}`, 'success')
    previewEl.textContent = JSON.stringify(result.current, null, 2)
    await loadPresets()
  } catch (err) {
    setStatus(err.message, 'error')
  }
}

async function loadPresets() {
  const { activePresetId, presets } = await fetchJson('/api/presets')
  renderPresets(activePresetId, presets)

  const current = await fetchJson('/time', { method: 'POST', body: JSON.stringify({}) })
  previewEl.textContent = JSON.stringify(current, null, 2)
}

loadPresets()
  .then(() => setStatus('Ready.'))
  .catch((err) => setStatus(err.message, 'error'))
