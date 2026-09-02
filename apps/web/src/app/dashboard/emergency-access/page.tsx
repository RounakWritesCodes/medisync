'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Siren, Plus, Clock, FileText, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { EmergencyAccess, EmergencyAccessReasonCode } from '@medisync/shared'

const REASON_CODES: { value: EmergencyAccessReasonCode; label: string }[] = [
  { value: 'cardiac_arrest', label: 'Cardiac Arrest' },
  { value: 'stroke', label: 'Stroke' },
  { value: 'trauma', label: 'Trauma' },
  { value: 'unconscious', label: 'Unconscious' },
  { value: 'severe_bleeding', label: 'Severe Bleeding' },
  { value: 'respiratory_failure', label: 'Respiratory Failure' },
  { value: 'sepsis', label: 'Sepsis' },
  { value: 'other', label: 'Other' },
]

function formatReason(code: string) {
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function pick<T = any>(obj: any, camel: string, snake: string): T {
  return (obj?.[camel] ?? obj?.[snake]) as T
}

export default function EmergencyAccessPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [accesses, setAccesses] = useState<EmergencyAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  // New request form
  const [showNew, setShowNew] = useState(false)
  const [doctorEmail, setDoctorEmail] = useState('')
  const [reasonCode, setReasonCode] = useState<EmergencyAccessReasonCode>('cardiac_arrest')
  const [reasonText, setReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Revoke confirmation
  const [revokeTarget, setRevokeTarget] = useState<EmergencyAccess | null>(null)
  const [revoking, setRevoking] = useState(false)

  // Expandable details
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await api.createEmergencyAccess({ doctor_email: doctorEmail, reason_code: reasonCode, reason_text: reasonText })
      setShowNew(false)
      setDoctorEmail('')
      setReasonText('')
      const data = await api.getEmergencyAccess()
      setAccesses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async (ea: EmergencyAccess) => {
    setActionLoading(ea.id); setError('')
    try {
      const updated = await api.updateEmergencyAccess(ea.id, 'active')
      setAccesses(prev => prev.map(a => a.id === ea.id ? { ...a, ...updated } : a))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally { setActionLoading(null) }
  }

  const handleDeny = async (id: string) => {
    setActionLoading(id); setError('')
    try {
      await api.updateEmergencyAccess(id, 'denied')
      setAccesses(prev => prev.map(a => a.id === id ? { ...a, status: 'denied' as const } : a))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny')
    } finally { setActionLoading(null) }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    await api.updateEmergencyAccess(revokeTarget.id, 'revoked')
    setAccesses(prev => prev.map(a => a.id === revokeTarget.id ? { ...a, status: 'revoked' as const } : a))
    setRevokeTarget(null)
    setRevoking(false)
  }

  const handleDelete = async (id: string) => {
    setActionLoading(id); setError('')
    try {
      await api.deleteEmergencyAccess(id)
      setAccesses(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setActionLoading(null) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>

  const uid = user?.id
  const isDoctor = user?.role === 'doctor'

  // Doctor sees: requests where they are the invited doctor
  // Patient sees: requests they created
  const pending = accesses.filter(a =>
    a.status === 'pending' && (isDoctor ? pick(a, 'doctorId', 'doctor_id') === uid : pick(a, 'patientId', 'patient_id') === uid)
  )
  const active = accesses.filter(a =>
    a.status === 'active' && (isDoctor ? pick(a, 'doctorId', 'doctor_id') === uid : pick(a, 'patientId', 'patient_id') === uid)
  )
  const history = accesses.filter(a =>
    !['pending', 'active'].includes(a.status) && (isDoctor ? pick(a, 'doctorId', 'doctor_id') === uid : pick(a, 'patientId', 'patient_id') === uid)
  )

  const toggleDetails = (id: string) => setExpandedId(prev => prev === id ? null : id)

  const renderDetails = (ea: EmergencyAccess) => {
    const row = (label: string, value: React.ReactNode) => (
      <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
        <span style={{ color: 'var(--color-on-surface-variant)', minWidth: '150px', flexShrink: 0 }}>{label}</span>
        <span>{value}</span>
      </div>
    )
    return (
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-outline-variant)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {row('Reason', formatReason(pick(ea, 'reasonCode', 'reason_code') || ''))}
        {row('Description', pick(ea, 'reasonText', 'reason_text') || <em>Not provided</em>)}
        {ea.status === 'active' && pick(ea, 'expiresAt', 'expires_at') && row(
          'Expires',
          new Date(pick(ea, 'expiresAt', 'expires_at')).toLocaleString()
        )}
        {ea.status === 'pending' && (
          row('Requested', pick(ea, 'createdAt', 'created_at') ? new Date(pick(ea, 'createdAt', 'created_at')).toLocaleString() : '—')
        )}
        {isDoctor && ea.status === 'active' && (
          row(
            'Patient chart',
            <span style={{ display: 'inline-flex', gap: '12px' }}>
              <Link href={`/dashboard/records?patient=${pick(ea, 'patientId', 'patient_id')}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Medical records →</Link>
              <Link href={`/dashboard/history?patient=${pick(ea, 'patientId', 'patient_id')}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Diagnosis history →</Link>
            </span>
          )
        )}
      </div>
    )
  }

  const renderPendingCard = (ea: EmergencyAccess) => {
    const expanded = expandedId === ea.id
    const isOwner = pick(ea, 'doctorId', 'doctor_id') !== uid

    return (
      <div key={ea.id} className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #b71c1c' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: '15px' }}>
              {isDoctor
                ? (pick(ea, 'patientName', 'patient_name') || pick(ea, 'patientEmail', 'patient_email') || 'Unknown patient')
                : (pick(ea, 'doctorName', 'doctor_name') || pick(ea, 'doctorEmail', 'doctor_email') || 'Unknown doctor')
              }
            </p>
            <p style={{ fontSize: '13px', color: '#b71c1c', fontWeight: 600, marginTop: '4px' }}>
              {formatReason(pick(ea, 'reasonCode', 'reason_code') || '')}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <FileText size={14} style={{ flexShrink: 0, marginTop: '2px' }} /> {pick(ea, 'reasonText', 'reason_text')}
            </p>
          </div>

          {/* Doctor: approve/deny buttons */}
          {isDoctor && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => handleApprove(ea)} disabled={actionLoading === ea.id} className="btn-success" style={{ padding: '8px 16px', fontSize: '13px' }}>
                Approve
              </button>
              <button onClick={() => handleDeny(ea.id)} disabled={actionLoading === ea.id} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px' }}>
                Deny
              </button>
            </div>
          )}

          {/* Patient: revoke button */}
          {!isDoctor && (
            <button onClick={() => setRevokeTarget(ea)} disabled={actionLoading === ea.id} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'center' }}>
              Revoke
            </button>
          )}
        </div>

        <div className="flex justify-end" style={{ marginTop: '8px' }}>
          <button onClick={() => toggleDetails(ea.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide details' : 'View details'}
          </button>
        </div>

        {expanded && renderDetails(ea)}
      </div>
    )
  }

  const renderActiveCard = (ea: EmergencyAccess) => {
    const expanded = expandedId === ea.id
    const expiresAt = pick(ea, 'expiresAt', 'expires_at')
    const isExpired = expiresAt && new Date(expiresAt).getTime() < Date.now()

    return (
      <div key={ea.id} className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--color-tertiary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: '15px' }}>
              {isDoctor
                ? (pick(ea, 'patientName', 'patient_name') || pick(ea, 'patientEmail', 'patient_email') || 'Unknown patient')
                : (pick(ea, 'doctorName', 'doctor_name') || pick(ea, 'doctorEmail', 'doctor_email') || 'Unknown doctor')
              }
            </p>
            <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
              {formatReason(pick(ea, 'reasonCode', 'reason_code') || '')}
            </p>
            {expiresAt && (
              <p style={{ fontSize: '12px', color: isExpired ? '#b71c1c' : 'var(--color-on-surface-variant)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} />
                {isExpired ? `Expired ${new Date(expiresAt).toLocaleDateString()}` : `Expires ${new Date(expiresAt).toLocaleString()}`}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {isDoctor && !isExpired && (
              <>
                <Link href={`/dashboard/records?patient=${pick(ea, 'patientId', 'patient_id')}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>Records →</Link>
                <Link href={`/dashboard/history?patient=${pick(ea, 'patientId', 'patient_id')}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>History →</Link>
              </>
            )}
            <button onClick={() => setRevokeTarget(ea)} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer' }}>
              Revoke
            </button>
          </div>
        </div>

        <div className="flex justify-end" style={{ marginTop: '8px' }}>
          <button onClick={() => toggleDetails(ea.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide details' : 'View details'}
          </button>
        </div>

        {expanded && renderDetails(ea)}
      </div>
    )
  }

  const renderHistoryRow = (ea: EmergencyAccess) => {
    const expanded = expandedId === ea.id

    return (
      <div key={ea.id} className="glass-card" style={{ padding: '16px 20px' }}>
        <div className="flex justify-between items-center">
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '14px' }}>
              {isDoctor
                ? (pick(ea, 'patientName', 'patient_name') || pick(ea, 'patientEmail', 'patient_email') || 'Unknown patient')
                : (pick(ea, 'doctorName', 'doctor_name') || pick(ea, 'doctorEmail', 'doctor_email') || 'Unknown doctor')
              }
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
              {formatReason(pick(ea, 'reasonCode', 'reason_code') || '')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`badge badge-${ea.status}`}>{ea.status}</span>
            <button onClick={() => handleDelete(ea.id)} disabled={actionLoading === ea.id} title="Remove from history"
              style={{ display: 'flex', alignItems: 'center', padding: '4px', color: 'var(--color-on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#b71c1c')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-on-surface-variant)')}>
              <Trash2 size={14} />
            </button>
            <button onClick={() => toggleDetails(ea.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Details
            </button>
          </div>
        </div>

        {expanded && renderDetails(ea)}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="flex justify-between items-center animate-fade-in" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            <Siren size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: '#b71c1c' }} />
            {isDoctor ? 'Patient Emergency Requests' : 'Emergency Access'}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>
            {isDoctor
              ? `${pending.length} pending · ${active.length} active · ${history.length} resolved`
              : `${accesses.length} total requests`}
          </p>
        </div>
        {!isDoctor && (
          <button onClick={() => setShowNew(!showNew)} className="btn-danger" style={{ padding: '12px 24px', fontSize: '14px' }}>
            <Plus size={18} /> Request Emergency Access
          </button>
        )}
      </div>

      {error && <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}

      {showNew && (
        <div className="glass-card animate-fade-in" style={{ padding: '32px', marginBottom: '32px', borderLeft: '4px solid #b71c1c' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', color: '#b71c1c' }}>Request Emergency Access</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="label">Doctor Email <span style={{ color: '#b71c1c' }}>*</span></label>
              <input type="email" required placeholder="doctor@hospital.com" value={doctorEmail} onChange={(e) => setDoctorEmail(e.target.value)} className="input-field" />
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
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-danger disabled:opacity-50" style={{ padding: '14px', fontSize: '15px' }}>
                {submitting ? 'Requesting...' : 'Request Emergency Access'}
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="btn-ghost" style={{ padding: '14px', fontSize: '15px' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {accesses.length === 0 ? (
        <EmptyState icon="emergency" title="No emergency access" description={isDoctor ? "No patients have requested emergency access yet." : "You haven't requested any emergency access yet."} />
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>{isDoctor ? 'Pending Requests' : 'Sent Requests'}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pending.map(renderPendingCard)}
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--color-tertiary)' }}>Active Access</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {active.map(renderActiveCard)}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>History</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {history.map(renderHistoryRow)}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke Emergency Access"
        message={`Are you sure you want to revoke this emergency access? The doctor will immediately lose access to the patient's records.`}
        confirmLabel={revoking ? 'Revoking...' : 'Revoke'}
        onConfirm={handleRevoke}
        onCancel={() => { if (!revoking) setRevokeTarget(null) }}
      />
    </div>
  )
}
