import { useState } from 'react'
import { firebaseConfigured, sendPasswordResetByEmail, signInAdmin } from '../services/firebase'

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ─── Sign-in form ───────────────────────────────────────────────────────────
function SignInForm({ onForgotPassword }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signInAdmin(email, password)
    } catch {
      setError('Unable to sign in. Check your email, password, and administrator access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Email address
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@school.edu"
        />
      </label>

      <label>
        Password
        <div className="login-pw-wrap">
          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            required
            minLength="6"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="login-pw-toggle"
            onClick={() => setShowPw((v) => !v)}
            tabIndex={-1}
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            <EyeIcon visible={showPw} />
          </button>
        </div>
      </label>

      <div className="login-forgot-row">
        <button type="button" className="login-forgot-link" onClick={onForgotPassword}>
          Forgot password?
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button className="primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in securely'}
      </button>
    </form>
  )
}

// ─── Forgot-password form ───────────────────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (!firebaseConfigured) throw new Error('Firebase is not configured in this environment.')
      await sendPasswordResetByEmail(email)
      setSent(true)
    } catch (err) {
      setError(err.message || 'Unable to send reset email. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="login-reset-sent">
        <div className="login-reset-sent-icon" aria-hidden="true">✉</div>
        <strong>Check your inbox</strong>
        <p>
          A password reset link was sent to <strong>{email}</strong>. Check your email
          (and spam folder) and follow the link to set a new password.
        </p>
        <button type="button" className="primary" onClick={onBack}>
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className="login-reset-intro">
        Enter your account email address and we will send you a link to reset your password.
      </p>
      <label>
        Email address
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@school.edu"
          autoFocus
        />
      </label>

      {error && <div className="login-error">{error}</div>}

      <button className="primary" disabled={busy || !email}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <button type="button" className="login-back-link" onClick={onBack} disabled={busy}>
        ← Back to sign in
      </button>
    </form>
  )
}

// ─── Root ───────────────────────────────────────────────────────────────────
export default function Login() {
  const [view, setView] = useState('signin')

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <img className="login-logo" src="/rhet-logo.png" alt="RHET logo" />
          <div>
            <strong>RHET Inventory System</strong>
            <span>Rising Hope Education &amp; Technology</span>
          </div>
        </div>

        {view === 'signin' ? (
          <>
            <SignInForm onForgotPassword={() => setView('forgot')} />
            <small>Authentication is protected by Firebase. Contact your system owner if you need admin access.</small>
          </>
        ) : (
          <>
            <h2 className="login-section-title">Reset your password</h2>
            <ForgotPasswordForm onBack={() => setView('signin')} />
          </>
        )}
      </section>
    </main>
  )
}
