'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Brain, CheckCircle2, Lock, Mail } from 'lucide-react'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [requestSent, setRequestSent] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      await api.confirmPasswordReset(token!, password)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Password reset failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.requestPasswordReset(email)
      setRequestSent(true)
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="w-full" style={{ maxWidth: '400px' }}>
          <div className="text-center" style={{ marginBottom: '32px' }}>
            <Link href="/" className="inline-flex items-center gap-2">
              <Brain style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
              <span className="font-bold" style={{ fontSize: '22px' }}>MediSync Health</span>
            </Link>
          </div>

          <div className="glass-card" style={{ padding: '32px' }}>
            {success ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <CheckCircle2 style={{ color: 'var(--color-tertiary)', fontSize: '32px', width: '32px', height: '32px' }} />
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Password Reset!</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>
                  Your password has been updated successfully.
                </p>
                <Link href="/login" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>Go to Login</Link>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Lock style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
                  </div>
                  <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Set New Password</h1>
                  <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>Enter your new password below.</p>
                </div>

                {error && (
                  <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleReset}>
                  <div style={{ marginBottom: '16px' }}>
                    <label className="label">New Password</label>
                    <input type="password" placeholder="Enter new password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input-field" />
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label className="label">Confirm Password</label>
                    <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="input-field" />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full" style={{ padding: '14px', fontSize: '15px' }}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full" style={{ maxWidth: '400px' }}>
        <div className="text-center" style={{ marginBottom: '32px' }}>
          <Link href="/" className="inline-flex items-center gap-2">
            <Brain style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
            <span className="font-bold" style={{ fontSize: '22px' }}>MediSync Health</span>
          </Link>
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          {requestSent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Mail style={{ color: 'var(--color-tertiary)', fontSize: '32px', width: '32px', height: '32px' }} />
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Check Your Email</h1>
              <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>
                If an account exists with that email, you&apos;ll receive a password reset link shortly.
              </p>
              <Link href="/login" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>Back to Login</Link>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Lock style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Forgot Password?</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              {error && (
                <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleRequestReset}>
                <div style={{ marginBottom: '24px' }}>
                  <label className="label">Email</label>
                  <input type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full" style={{ padding: '14px', fontSize: '15px' }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="text-center" style={{ marginTop: '20px' }}>
                <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: '14px' }}>
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Loading...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
