'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Brain, CheckCircle2, XCircle, Mail } from 'lucide-react'

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-token'>('loading')
  const [message, setMessage] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('no-token')
      return
    }

    api.confirmVerification(token)
      .then(() => {
        setStatus('success')
        setMessage('Your email has been verified successfully!')
      })
      .catch((err: any) => {
        setStatus('error')
        setMessage(err.message || 'Verification failed')
      })
  }, [token])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    setResendLoading(true)
    try {
      await api.sendVerification()
      setResendSuccess(true)
    } catch (err: any) {
      setMessage(err.message || 'Failed to resend verification email')
    } finally {
      setResendLoading(false)
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

          <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
            {status === 'loading' && (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Mail style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Verifying your email...</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>Please wait while we verify your email address.</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <CheckCircle2 style={{ color: 'var(--color-tertiary)', fontSize: '32px', width: '32px', height: '32px' }} />
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Email Verified!</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>{message}</p>
                <Link href="/login" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>Go to Login</Link>
              </>
            )}

            {status === 'error' && (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-error-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <XCircle style={{ color: 'var(--color-error)', fontSize: '32px', width: '32px', height: '32px' }} />
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Verification Failed</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>{message}</p>
                <Link href="/login" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>Go to Login</Link>
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

        <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Mail style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Verify Your Email</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>
            Check your inbox for a verification link, or resend it below.
          </p>

          {resendSuccess ? (
            <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-tertiary-container)', borderRadius: '12px', fontSize: '13px', color: 'var(--color-tertiary)' }}>
              Verification email sent! Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleResend}>
              <button type="submit" disabled={resendLoading} className="btn-primary w-full" style={{ padding: '14px', fontSize: '15px' }}>
                {resendLoading ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </form>
          )}

          <div className="text-center" style={{ marginTop: '20px' }}>
            <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: '14px' }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Loading...</p>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}
