'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Siren } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import type { EmergencyAccess, EmergencyAccessReasonCode } from '@medisync/shared'

const REASON_CODES: { value: EmergencyAccessReasonCode; label: string; icon: string }[] = [
  { value: 'cardiac_arrest', label: 'Cardiac Arrest', icon: 'monitor_heart' },
  { value: 'stroke', label: 'Stroke', icon: 'psychology' },
  { value: 'trauma', label: 'Trauma', icon: 'emergency' },
  { value: 'unconscious', label: 'Unconscious', icon: 'bed' },
  { value: 'severe_bleeding', label: 'Severe Bleeding', icon: 'water_drop' },
  { value: 'respiratory_failure', label: 'Respiratory Failure', icon: 'air' },
  { value: 'sepsis', label: 'Sepsis', icon: 'coronavirus' },
  { value: 'other', label: 'Other', icon: 'help_circle' },
]

function formatReason(code: string) {
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function EmergencyAccessPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [accesses, setAccesses] = useState<EmergencyAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [patientEmail, setPatientEmail] = useState('')
  const [reasonCode, setReasonCode] = useState<EmergencyAccessReasonCode>('cardiac_arrest')
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { user: authUser } = await api.getMe()
        setUser(authUser)
        const data = await api.getEmergencyAccess()
        setAccesses(data)
      } catch { router.push('/login') }
      setLoading(false)
    }
    fetchData()
  }, [router])

  const handleInvoke = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await api.createEmergencyAccess({ patient_email: patientEmail, reason_code: reasonCode, reason_text: reasonText })
      setShowNew(false)
      setPatientEmail('')
      setReasonText('')
      const data = await api.getEmergencyAccess()
      setAccesses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this emergency access?')) return
    await api.updateEmergencyAccess(id, 'revoked')
    setAccesses(prev => prev.map(a => a.id === id ? { ...a, status: 'revoked' as const } : a))
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>

  const isDoctor = user?.role === 'doctor'
  const active = accesses.filter(a => a.status === 'active')
  const history = accesses.filter(a => a.status !== 'active')

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="flex justify-between items-center animate-fade-in" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            <Siren size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: '#b71c1c' }} />
            Emergency Access
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>Break-glass access for critical situations (48-hour window)</p>
        </div>
        {isDoctor && (
          <button onClick={() => setShowNew(!showNew)} className="btn-danger" style={{ padding: '12px 24px', fontSize: '14px' }}>
            <Siren size={18} /> Invoke Emergency
          </button>
        )}
      </div>

      {showNew && (
        <div className="glass-card animate-fade-in" style={{ padding: '32px', marginBottom: '32px', borderLeft: '4px solid #b71c1c' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', color: '#b71c1c' }}>Invoke Emergency Access</h2>
          <form onSubmit={handleInvoke} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="label">Patient Email <span style={{ color: '#b71c1c' }}>*</span></label>
              <input type="email" required placeholder="patient@example.com" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Reason Code <span style={{ color: '#b71c1c' }}>*</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {REASON_CODES.map(rc => (
                  <button key={rc.value} type="button" onClick={() => setReasonCode(rc.value)}
                    style={{ padding: '12px 8px', borderRadius: '12px', border: `2px solid ${reasonCode === rc.value ? '#b71c1c' : 'var(--color-outline-variant)'}`, background: reasonCode === rc.value ? 'var(--color-error-container)' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>
                    {rc.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Reason Description <span style={{ color: '#b71c1c' }}>*</span></label>
              <textarea rows={3} required value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Describe the emergency..." className="input-field" style={{ resize: 'vertical' }} />
            </div>
            {error && <div style={{ padding: '12px 16px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-danger disabled:opacity-50" style={{ padding: '14px', fontSize: '15px' }}>
                {submitting ? 'Invoking...' : 'Invoke Emergency Access'}
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="btn-ghost" style={{ padding: '14px', fontSize: '15px' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {accesses.length === 0 ? (
        <EmptyState icon="emergency" title="No emergency access" description="Emergency access records will appear here when invoked by doctors." />
      ) : (
        <>
          {active.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#b71c1c' }}>Active Emergency Access</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {active.map(a => (
                  <div key={a.id} className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #b71c1c' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p style={{ fontWeight: 600 }}>{formatReason((a as any).reasonCode || a.reason_code || '')}</p>
                        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>{(a as any).reasonText || a.reason_text}</p>
                        <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>Expires: {new Date((a as any).expiresAt || a.expires_at).toLocaleString()}</p>
                      </div>
                      <button onClick={() => handleRevoke(a.id)} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px' }}>Revoke</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {history.length > 0 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>History</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {history.map(a => (
                  <div key={a.id} className="glass-card" style={{ padding: '16px 20px' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p style={{ fontSize: '14px' }}>{formatReason((a as any).reasonCode || a.reason_code || '')}</p>
                        <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>{new Date((a as any).createdAt || a.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`badge badge-${a.status}`}>{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
