import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useSettings } from '../../context/SettingsContext'
import { updateSettings } from '../../services/inventoryApi'
import { formatDate } from '../../utils/format'

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Manila', label: 'Asia/Manila (Philippine Time)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'UTC', label: 'UTC' },
]

function TagListEditor({
  label,
  hint,
  values,
  onChange,
  placeholder = 'Add item',
  emptyLabel = 'No items yet',
}) {
  const [draft, setDraft] = useState('')

  function addTag(e) {
    e?.preventDefault?.()
    const text = draft.trim()
    if (!text) return
    const exists = values.some((entry) => entry.toLowerCase() === text.toLowerCase())
    if (!exists) onChange([...values, text])
    setDraft('')
  }

  function removeTag(index) {
    onChange(values.filter((_, i) => i !== index))
  }

  return (
    <div className="settings-tag-editor">
      <div className="settings-tag-editor-head">
        <div>
          <span className="settings-label">{label}</span>
          {hint ? <p className="settings-hint">{hint}</p> : null}
        </div>
        <span className="settings-count">{values.length}</span>
      </div>

      <div className="settings-tags-box">
        {values.length ? (
          <div className="settings-tags" role="list">
            {values.map((value, index) => (
              <span key={`${value}-${index}`} className="settings-tag" role="listitem">
                <span>{value}</span>
                <button type="button" aria-label={`Remove ${value}`} onClick={() => removeTag(index)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="settings-tags-empty">{emptyLabel}</p>
        )}

        <div className="settings-tag-add">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder={placeholder}
            aria-label={label}
          />
          <button type="button" className="ghost" disabled={!draft.trim()} onClick={addTag}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsCard({ icon, title, description, children, wide = false }) {
  return (
    <section className={`settings-card${wide ? ' wide' : ''}`}>
      <header className="settings-card-head">
        <div className="settings-card-icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </div>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <div className="settings-card-body">{children}</div>
    </section>
  )
}

function cloneForm(settings) {
  return {
    organizationName: settings.organizationName || '',
    timezone: settings.timezone || 'Asia/Manila',
    defaultLowStockThreshold: settings.defaultLowStockThreshold ?? 20,
    courierPresets: [...(settings.courierPresets || [])],
    uniformSizes: [...(settings.uniformSizes || [])],
    shirtSizes: [...(settings.shirtSizes || [])],
    shirtLogos: [...(settings.shirtLogos?.length ? settings.shirtLogos : ['Beeli', 'LCA'])],
    helpAssistantEnabled: settings.helpAssistantEnabled !== false,
    snowfallEnabled: settings.snowfallEnabled === true,
  }
}

function sameList(a = [], b = []) {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

export default function AdminSettings({ settings, onRefresh }) {
  const live = useSettings()
  const source = settings || live
  const baseline = useMemo(() => cloneForm(source), [
    source.updatedAt,
    source.organizationName,
    source.timezone,
    source.defaultLowStockThreshold,
    source.helpAssistantEnabled,
    source.snowfallEnabled,
    source.courierPresets,
    source.uniformSizes,
    source.shirtSizes,
    source.shirtLogos,
  ])
  const [form, setForm] = useState(() => cloneForm(source))
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    setForm(cloneForm(source))
    setFormKey((key) => key + 1)
  }, [
    source.updatedAt,
    source.organizationName,
    source.timezone,
    source.defaultLowStockThreshold,
    source.helpAssistantEnabled,
    source.snowfallEnabled,
    source.courierPresets,
    source.uniformSizes,
    source.shirtSizes,
    source.shirtLogos,
  ])

  const dirty = useMemo(() => (
    form.organizationName.trim() !== baseline.organizationName.trim()
    || form.timezone !== baseline.timezone
    || Number(form.defaultLowStockThreshold) !== Number(baseline.defaultLowStockThreshold)
    || Boolean(form.helpAssistantEnabled) !== Boolean(baseline.helpAssistantEnabled)
    || Boolean(form.snowfallEnabled) !== Boolean(baseline.snowfallEnabled)
    || !sameList(form.courierPresets, baseline.courierPresets)
    || !sameList(form.uniformSizes, baseline.uniformSizes)
    || !sameList(form.shirtSizes, baseline.shirtSizes)
    || !sameList(form.shirtLogos, baseline.shirtLogos)
  ), [form, baseline])

  function resetFromServer() {
    setForm(cloneForm(source))
    setFormKey((key) => key + 1)
    setError('')
    setSavedMessage('')
  }

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setSavedMessage('')
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSavedMessage('')
    try {
      await updateSettings({
        organizationName: form.organizationName.trim(),
        timezone: form.timezone,
        defaultLowStockThreshold: Number(form.defaultLowStockThreshold),
        courierPresets: form.courierPresets,
        uniformSizes: form.uniformSizes,
        shirtSizes: form.shirtSizes,
        shirtLogos: form.shirtLogos,
        helpAssistantEnabled: Boolean(form.helpAssistantEnabled),
        snowfallEnabled: Boolean(form.snowfallEnabled),
      })
      await onRefresh?.()
      setSavedMessage('Settings saved.')
    } catch (err) {
      setError(err.message || 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Organization defaults for inventory, fulfillment, uniforms, and the Help Assistant.</p>
        </div>
        {dirty ? <span className="settings-dirty-chip">Unsaved changes</span> : null}
      </div>

      {error && <div className="page-error">{error}</div>}
      {savedMessage && !dirty && <div className="page-success">{savedMessage}</div>}

      <form key={formKey} className="settings-layout" onSubmit={submit}>
        <div className="settings-cards">
          <SettingsCard
            icon="tag"
            title="Organization"
            description="Shown on the sidebar brand and printable dispatch checklists."
          >
            <div className="settings-form-grid">
              <label className="settings-field">
                <span className="settings-label">Organization name</span>
                <input
                  required
                  maxLength={120}
                  value={form.organizationName}
                  onChange={(e) => setField('organizationName', e.target.value)}
                  placeholder="RHET Inventory System"
                />
              </label>
              <label className="settings-field">
                <span className="settings-label">Timezone</span>
                <select
                  value={form.timezone}
                  onChange={(e) => setField('timezone', e.target.value)}
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="settings-preview" aria-live="polite">
              <img className="settings-preview-logo" src="/rhet-logo.png" alt="" />
              <div>
                <strong>{form.organizationName.trim() || 'Organization name'}</strong>
                <span>Merchandise Management</span>
              </div>
            </div>
          </SettingsCard>

          <div className="settings-stack">
            <SettingsCard
              icon="box"
              title="Inventory defaults"
              description="Applied when creating new items. Existing thresholds stay as-is."
            >
              <label className="settings-field">
                <span className="settings-label">Default low-stock threshold</span>
                <div className="settings-input-suffix">
                  <input
                    required
                    type="number"
                    min="0"
                    max="999999"
                    value={form.defaultLowStockThreshold}
                    onChange={(e) => setField('defaultLowStockThreshold', e.target.value)}
                  />
                  <span>units</span>
                </div>
                <p className="settings-hint">Items at or below this quantity flag as low stock on new creates.</p>
              </label>
            </SettingsCard>

            <SettingsCard
              icon="help"
              title="Features"
              description="Optional helpers available to signed-in staff."
            >
              <label className="settings-switch-row">
                <span>
                  <strong>Help Assistant</strong>
                  <em>Floating FAQ helper in the bottom-right corner.</em>
                </span>
                <span className="settings-switch">
                  <input
                    type="checkbox"
                    checked={form.helpAssistantEnabled}
                    onChange={(e) => setField('helpAssistantEnabled', e.target.checked)}
                  />
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                  <span className="settings-switch-state">
                    {form.helpAssistantEnabled ? 'On' : 'Off'}
                  </span>
                </span>
              </label>
              <label className="settings-switch-row">
                <span>
                  <strong>Snowfall</strong>
                  <em>Falling snowflakes plus a mini Santa and reindeer parade along the bottom.</em>
                </span>
                <span className="settings-switch">
                  <input
                    type="checkbox"
                    checked={form.snowfallEnabled}
                    onChange={(e) => setField('snowfallEnabled', e.target.checked)}
                  />
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                  <span className="settings-switch-state">
                    {form.snowfallEnabled ? 'On' : 'Off'}
                  </span>
                </span>
              </label>
            </SettingsCard>
          </div>

          <SettingsCard
            icon="cart"
            title="Fulfillment"
            description="Courier presets on Manual Orders. Others / custom name remains available."
            wide
          >
            <TagListEditor
              label="Courier presets"
              hint="Dropdown order matches this list."
              values={form.courierPresets}
              onChange={(courierPresets) => setField('courierPresets', courierPresets)}
              placeholder="e.g. LBC Express"
              emptyLabel="Add at least one courier preset"
            />
          </SettingsCard>

          <SettingsCard
            icon="list"
            title="Uniform catalog"
            description="Size and logo options for School / PE uniforms and Shirt categories."
            wide
          >
            <div className="settings-split">
              <TagListEditor
                label="Uniform sizes (School / PE)"
                values={form.uniformSizes}
                onChange={(uniformSizes) => setField('uniformSizes', uniformSizes)}
                placeholder="e.g. XS"
                emptyLabel="Add at least one size"
              />
              <TagListEditor
                label="Shirt sizes"
                values={form.shirtSizes}
                onChange={(shirtSizes) => setField('shirtSizes', shirtSizes)}
                placeholder="e.g. Teen"
                emptyLabel="Add at least one size"
              />
              <TagListEditor
                label="Shirt logos"
                hint="Shown as Logo on Add merchandise. You can also add logos from that form."
                values={form.shirtLogos}
                onChange={(shirtLogos) => setField('shirtLogos', shirtLogos)}
                placeholder="e.g. Beeli"
                emptyLabel="Add at least one logo"
              />
            </div>
          </SettingsCard>
        </div>

        <div className={`settings-footer${dirty ? ' dirty' : ''}`}>
          <p className="settings-meta">
            {source.updatedAt
              ? `Last updated ${formatDate(source.updatedAt)}`
              : 'Using system defaults until you save.'}
          </p>
          <div className="settings-actions">
            <button type="button" className="ghost" disabled={saving || !dirty} onClick={resetFromServer}>
              Discard
            </button>
            <button type="submit" className="primary" disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
