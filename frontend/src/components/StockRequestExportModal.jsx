import { useMemo, useState } from 'react'
import {
  buildExportBranchOptions,
  defaultStockRequestExportForm,
  exportDeliveredStockRequests,
  filterDeliveredStockRequests,
  resolveExportBranches,
  resolveExportDateRange,
} from '../utils/stockRequestExport'

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today', hint: 'Delivered today (app timezone).' },
  { value: 'date', label: 'Specific date', hint: 'One calendar day.' },
  { value: 'week', label: 'Per week', hint: 'Monday–Sunday of the selected week.' },
  { value: 'month', label: 'Per month', hint: 'All delivered lines in the selected month.' },
]

export function StockRequestExportModal({ requests, onClose }) {
  const branchOptions = useMemo(() => buildExportBranchOptions(requests), [requests])
  const [step, setStep] = useState('branches') // branches | period
  const [form, setForm] = useState(() => defaultStockRequestExportForm(new Date(), branchOptions))
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const branchResolution = useMemo(
    () => resolveExportBranches(form, branchOptions),
    [form, branchOptions],
  )

  const preview = useMemo(() => {
    if (branchResolution.error) {
      return { count: 0, range: null, error: branchResolution.error, branches: null }
    }
    const range = resolveExportDateRange(form)
    if (range.error) return { count: 0, range: null, error: range.error, branches: branchResolution }
    const rows = filterDeliveredStockRequests(requests, range.startYmd, range.endYmd, {
      branchKeys: branchResolution.keys,
    })
    return {
      count: rows.length,
      range,
      branches: branchResolution,
      error: null,
    }
  }, [form, requests, branchResolution])

  const selectedCount = form.branchMode === 'all'
    ? branchOptions.length
    : form.branchKeys.length

  function update(field, value) {
    setResult(null)
    setError('')
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function selectAllBranches() {
    setResult(null)
    setError('')
    setForm((prev) => ({
      ...prev,
      branchMode: 'all',
      branchKeys: branchOptions.map((option) => option.key),
    }))
  }

  function selectSpecificBranches() {
    setResult(null)
    setError('')
    setForm((prev) => ({
      ...prev,
      branchMode: 'selected',
      branchKeys: prev.branchKeys.length
        ? prev.branchKeys
        : branchOptions.map((option) => option.key),
    }))
  }

  function toggleBranch(key) {
    setResult(null)
    setError('')
    setForm((prev) => {
      const exists = prev.branchKeys.includes(key)
      const branchKeys = exists
        ? prev.branchKeys.filter((entry) => entry !== key)
        : [...prev.branchKeys, key]
      return {
        ...prev,
        branchMode: 'selected',
        branchKeys,
      }
    })
  }

  function goToPeriod() {
    setError('')
    setResult(null)
    if (branchResolution.error) {
      setError(branchResolution.error)
      return
    }
    setStep('period')
  }

  function handleExport(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    try {
      const exported = exportDeliveredStockRequests(requests, form, branchOptions)
      if (exported.count === 0) {
        setError('No delivered stock requests found for these branches and period.')
        return
      }
      setResult(exported)
    } catch (err) {
      setError(err.message || 'Unable to export.')
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal modal-sm stock-request-export-modal"
        onSubmit={step === 'period' ? handleExport : (event) => { event.preventDefault(); goToPeriod() }}
      >
        <div className="modal-head">
          <div>
            <h2>Export stock requests</h2>
            <p>
              Only <strong>Delivered</strong> lines are included.
              {step === 'branches'
                ? ' First choose all branches or select specific ones.'
                : ' Then choose today, a date, week, or month.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="export-step-indicator" aria-label="Export steps">
            <span className={step === 'branches' ? 'is-active' : 'is-done'}>1. Branches</span>
            <span aria-hidden="true">→</span>
            <span className={step === 'period' ? 'is-active' : ''}>2. Period</span>
          </div>

          {step === 'branches' && (
            <>
              <fieldset className="export-period-fieldset">
                <legend>Branches</legend>
                <div className="export-period-options">
                  <label className={`export-period-option${form.branchMode === 'all' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-branches"
                      checked={form.branchMode === 'all'}
                      onChange={selectAllBranches}
                    />
                    <span>
                      <strong>All branches</strong>
                      <small>Include every branch in this export.</small>
                    </span>
                  </label>
                  <label className={`export-period-option${form.branchMode === 'selected' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-branches"
                      checked={form.branchMode === 'selected'}
                      onChange={selectSpecificBranches}
                    />
                    <span>
                      <strong>Select branches</strong>
                      <small>Choose one or more branches.</small>
                    </span>
                  </label>
                </div>
              </fieldset>

              {form.branchMode === 'selected' && (
                <div className="export-branch-list">
                  <div className="export-branch-list-head">
                    <strong>Branches</strong>
                    <div className="export-branch-list-actions">
                      <button
                        type="button"
                        className="notification-link"
                        onClick={() => update('branchKeys', branchOptions.map((option) => option.key))}
                        disabled={!branchOptions.length}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="notification-link"
                        onClick={() => update('branchKeys', [])}
                        disabled={!form.branchKeys.length}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {branchOptions.length ? (
                    <div className="export-branch-checks" role="group" aria-label="Branch checklist">
                      {branchOptions.map((option) => (
                        <label key={option.key} className="export-branch-check">
                          <input
                            type="checkbox"
                            checked={form.branchKeys.includes(option.key)}
                            onChange={() => toggleBranch(option.key)}
                          />
                          <span title={option.label}>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No branches found in stock requests.</p>
                  )}
                </div>
              )}

              <div className="export-preview-note">
                {branchResolution.error ? (
                  <span className="muted">{branchResolution.error}</span>
                ) : (
                  <span>
                    {form.branchMode === 'all'
                      ? `All branches selected (${selectedCount})`
                      : `${selectedCount} branch${selectedCount === 1 ? '' : 'es'} selected`}
                  </span>
                )}
              </div>
            </>
          )}

          {step === 'period' && (
            <>
              <div className="export-preview-note">
                <span>
                  Branches:{' '}
                  {form.branchMode === 'all'
                    ? `All (${branchOptions.length})`
                    : `${form.branchKeys.length} selected`}
                </span>
              </div>

              <fieldset className="export-period-fieldset">
                <legend>Period</legend>
                <div className="export-period-options">
                  {PERIOD_OPTIONS.map((option) => (
                    <label key={option.value} className={`export-period-option${form.period === option.value ? ' is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="export-period"
                        value={option.value}
                        checked={form.period === option.value}
                        onChange={() => update('period', option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {form.period === 'date' && (
                <label>
                  Date
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => update('date', e.target.value)}
                    required
                  />
                </label>
              )}

              {form.period === 'week' && (
                <label>
                  Week
                  <input
                    type="week"
                    value={form.week}
                    onChange={(e) => update('week', e.target.value)}
                    required
                  />
                </label>
              )}

              {form.period === 'month' && (
                <label>
                  Month
                  <input
                    type="month"
                    value={form.month}
                    onChange={(e) => update('month', e.target.value)}
                    required
                  />
                </label>
              )}

              <div className="export-preview-note">
                {preview.error ? (
                  <span className="muted">{preview.error}</span>
                ) : (
                  <span>
                    {preview.count} delivered line{preview.count === 1 ? '' : 's'}
                    {preview.range ? ` · ${preview.range.startYmd}${preview.range.endYmd !== preview.range.startYmd ? ` to ${preview.range.endYmd}` : ''}` : ''}
                  </span>
                )}
              </div>
            </>
          )}

          {error && <div className="page-error">{error}</div>}
          {result && (
            <div className="integration-note">
              Exported {result.count} line{result.count === 1 ? '' : 's'} to <strong>{result.filename}</strong>.
            </div>
          )}
        </div>

        <div className="modal-actions">
          {step === 'period' ? (
            <>
              <button type="button" className="secondary" onClick={() => { setError(''); setResult(null); setStep('branches') }}>
                Back
              </button>
              <button type="submit" className="primary" disabled={Boolean(preview.error) || preview.count === 0}>
                Export Excel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={Boolean(branchResolution.error)}>
                Next: Period
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
