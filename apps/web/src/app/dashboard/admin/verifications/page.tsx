'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { BadgeCheck, XCircle, Stethoscope } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import type { DoctorVerification } from '@medisync/shared'

/**
 * Admin console (D1): review doctor credential submissions against the NMC
 * Indian Medical Register / State Medical Council public registers.
 */
export default function AdminVerificationsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [items, setItems] = useState<DoctorVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectionFor, setRejectionFor] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { user: authUser } = await api.getMe()
        setUser(authUser)
        if (authUser?.role !== 'admin') { router.push('/dashboard'); return }
        const data = await api.getVerifications()
        setItems(data)
      } catch { router.push('/login') }
      setLoading(false)
    }
    fetchData()
  }, [router])

  const handleDecision = async (id: string, decision: 'verified' | 'rejected') => {
    setActionLoading(id); setError('')
    try {
      await api.reviewVerification(id, decision, decision === 'rejected' ? rejectionReason : undefined)
      setRejectionFor(null); setRejectionReason('')
      const data = await api.getVerifications()
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally { setActionLoading(null) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>

  const pending = items.filter(v => v.status === 'pending_verification')
  const reviewed = items.filter(v => v.status !== 'pending_verification')

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          <Stethoscope size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
          Doctor Verification Review
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>
          Verify registration numbers against the NMC Indian Medical Register / council registers before approving.
        </p>
      </div>

      {error && <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}

      {pending.length === 0 && reviewed.length === 0 ? (
        <EmptyState icon="shield" title="No submissions" description="Doctor credential submissions will appear here." />
      ) : (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Pending ({pending.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            {pending.length === 0 && <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>Nothing awaiting review.</p>}
            {pending.map(v => (
              <div key={v.id} className="glass-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '15px' }}>{v.full_name || '(no name captured)'}</p>
                    <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>{v.email}</p>
                    <p style={{ fontSize: '13px', marginTop: '6px' }}>
                      Reg. No.: <strong>{v.registration_number}</strong>
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                      Council: {(v.council || '').replace(/_/g, ' ')}
                      {v.year_of_registration ? ` · since ${v.year_of_registration}` : ''}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>Qualification: {v.qualification}</p>
                  </div>
                  {rejectionFor === v.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '260px' }}>
                      <input
                        className="input-field"
                        placeholder="Reason for rejection"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                      />
                      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button onClick={() => handleDecision(v.id, 'rejected')} disabled={actionLoading === v.id || !rejectionReason.trim()} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px' }}>Confirm Reject</button>
                        <button onClick={() => { setRejectionFor(null); setRejectionReason('') }} className="btn-ghost" style={{ padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button onClick={() => handleDecision(v.id, 'verified')} disabled={actionLoading === v.id} className="btn-success" style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <BadgeCheck size={15} /> Verify
                      </button>
                      <button onClick={() => setRejectionFor(v.id)} disabled={actionLoading === v.id} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <XCircle size={15} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {reviewed.length > 0 && (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Reviewed</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reviewed.map(v => (
                  <div key={v.id} className="glass-card" style={{ padding: '14px 20px' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p style={{ fontSize: '14px' }}>{v.full_name} — {v.registration_number}</p>
                        {v.rejection_reason && (
                          <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>Rejected: {v.rejection_reason}</p>
                        )}
                      </div>
                      <span className={`badge badge-${v.status === 'verified' ? 'approved' : 'revoked'}`}>{v.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
