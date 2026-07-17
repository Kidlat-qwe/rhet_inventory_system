import { useState } from 'react'
import { signInAdmin } from '../services/firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <img className="login-logo" src="/rhet-logo.png" alt="RHET logo" />
          <div>
            <strong>RHET Inventory System</strong>
            <span>Rising Hope Education &amp; Technology</span>
          </div>
        </div>
        <form onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@school.edu" /></label>
          <label>Password<input type="password" autoComplete="current-password" required minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label>
          {error && <div className="login-error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
        <small>Authentication is protected by Firebase. Contact your system owner if you need admin access.</small>
      </section>
    </main>
  )
}
