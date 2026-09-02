'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Shield, Plus, Clock, FileText, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import type { AccessRequestWithUser } from '@medisync/shared'

const DURATION_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
  { value: 730, label: '2 years (max)' },
]

function scopeLabel(scope: any): string {
  if (!scope) return 'Full history'
  const parts: string[] = []
  if (Array.isArray(scope.categories) && scope.categories.length > 0) parts.push(scope.categories.join(', '))
  if (scope.dateFrom) parts.push(`from ${scope.dateFrom}`)
  if (scope.dateTo) parts.push(`to ${scope.dateTo}`)
  return parts.length ? parts.join(' · ') : 'Full history'
}

function pick<T = any>(obj: any, camel: string, snake: string): T {
  return (obj?.[camel] ?? obj?.[snake]) as T
}

export default function AccessRequestsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [requests, setRequests] = useState<AccessRequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { user: authUser } = await api.getMe()
        setUser(authUser)
        const data = await api.getAccessRequests()
        setRequests(data)
      } catch { router.push('/login') }
      setLoading(false)
    }
    fetchData()
  }, [router])

  const handleApprove = async (req: AccessRequestWithUser) => {
    setActionLoading(req.id); setError('')
    try {
      const duration = durations[req.id] ?? 30
      const updated = await api.updateAccessRequest(req.id, 'approved', { duration_days: duration })
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...updated } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally { setActionLoading(null) }
  }

  const handleDeny = async (id: string) => {
    setActionLoading(id); setError('')
    try {
      await api.updateAccessRequest(id, 'denied')
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'denied' as const } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny')
    } finally { setActionLoading(null) }
  }

  const handleRevoke = async (id: string) => {
    setActionLoading(id); setError('')
    try {
      await api.updateAccessRequest(id, 'revoked')
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'revoked' as const } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke')
    } finally { setActionLoading(null) }
  }

  const handleDelete = async (id: string) => {
    setActionLoading(id); setError('')
    try {
      await api.deleteAccessRequest(id)
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setActionLoading(null) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>

  const uid = user?.id
  const isDoctor = user?.role === 'doctor'

  // Doctor sees: requests where they are the invited doctor
  // Patient sees: requests they created
  const pending = requests.filter(r => r.status === 'pending' && (isDoctor ? pick(r, 'doctorId', 'doctor_id') === uid : pick(r, 'patientId', 'patient_id') === uid))
  const others = requests.filter(r => r.status !== 'pending' && (isDoctor ? pick(r, 'doctorId', 'doctor_id') === uid : pick(r, 'patientId', 'patient_id') === uid))

  const renderDetails = (req: AccessRequestWithUser) => {
    const doctorId = pick(req, 'doctorId', 'doctor_id')
    const pid = pick(req, 'patientId', 'patient_id')
    const respondedByLabel =
      !req.responded_by ? null
      : req.responded_by === doctorId ? 'the doctor'
      : 'the patient'
    const row = (label: string, value: React.ReactNode) => (
      <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
        <span style={{ color: 'var(--color-on-surface-variant)', minWidth: '150px', flexShrink: 0 }}>{label}</span>
        <span>{value}</span>
      </div>
    )
    return (
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-outline-variant)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {row('Reason', req.reason || <em>Not provided</em>)}
        {row('Requested scope', scopeLabel(pick(req, 'scope', 'scope')))}
        {(pick(req, 'grantedScope', 'granted_scope')) && Object.keys(pick(req, 'grantedScope', 'granted_scope') || {}).length > 0
          ? row('Granted scope', <span style={{ color: 'var(--color-primary)' }}>{scopeLabel(pick(req, 'grantedScope', 'granted_scope'))}</span>)
          : null}
        {respondedByLabel && row('Decided by', `${respondedByLabel} · ${new Date(pick(req, 'respondedAt', 'responded_at')).toLocaleString()}`)}
        {req.expires_at && row(
          'Access expires',
          req.effectively_expired
            ? <span style={{ color: '#b71c1c' }}>Expired {new Date(req.expires_at).toLocaleString()}</span>
            : new Date(req.expires_at).toLocaleString()
        )}
        {row('Created', pick(req, 'createdAt', 'created_at') ? new Date(pick(req, 'createdAt', 'created_at')).toLocaleString() : '—')}
        {isDoctor && req.status === 'approved' && !req.effectively_expired && (
          row(
            'Patient chart',
            <span style={{ display: 'inline-flex', gap: '12px' }}>
              <Link href={`/dashboard/records?patient=${pid}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Medical records →</Link>
              <Link href={`/dashboard/history?patient=${pid}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Diagnosis history →</Link>
            </span>
          )
        )}
      </div>
    )
  }

  const toggleDetails = (id: string) => setExpandedId(prev => prev === id ? null : id)

  const renderRequestCard = (req: AccessRequestWithUser) => {
    const counterpart = isDoctor
      ? (req.patient_name || req.patientName || req.patient_email || req.patientEmail || 'Unknown patient')
      : (req.doctor_name || req.doctorName || req.doctor_email || req.doctorEmail || 'Unknown doctor')
    const expanded = expandedId === req.id
    const canRevoke = !isDoctor && ['pending', 'approved'].includes(req.status)

    return (
      <div key={req.id} className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: '15px' }}>{counterpart}</p>
            {req.reason && (
              <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <FileText size={14} style={{ flexShrink: 0, marginTop: '2px' }} /> {req.reason}
              </p>
            )}
            <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
              Requested scope: {scopeLabel(req.scope)}
            </p>
          </div>

          {/* Doctor: approve/deny buttons for pending requests */}
          {isDoctor && req.status === 'pending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <label style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={13} /> Grant for
                  <select
                    value={durations[req.id] ?? 30}
                    onChange={(e) => setDurations(prev => ({ ...prev, [req.id]: Number(e.target.value) }))}
                    className="input-field"
                    style={{ padding: '6px 8px', fontSize: '12px', width: 'auto' }}
                  >
                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <button onClick={() => handleApprove(req)} disabled={actionLoading === req.id} className="btn-success" style={{ padding: '8px 16px', fontSize: '13px' }}>
                  Approve
                </button>
                <button onClick={() => handleDeny(req.id)} disabled={actionLoading === req.id} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px' }}>Deny</button>
              </div>
            </div>
          )}

          {/* Doctor: quick links for approved requests */}
          {isDoctor && req.status === 'approved' && !req.effectively_expired && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Link href={`/dashboard/records?patient=${pick(req, 'patientId', 'patient_id')}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>Records →</Link>
              <Link href={`/dashboard/history?patient=${pick(req, 'patientId', 'patient_id')}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>History →</Link>
            </div>
          )}

          {/* Patient: revoke button */}
          {canRevoke && (
            <button onClick={() => handleRevoke(req.id)} disabled={actionLoading === req.id} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'center' }}>
              Revoke
            </button>
          )}
        </div>

        <div className="flex justify-end" style={{ marginTop: '8px' }}>
          <button onClick={() => toggleDetails(req.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide details' : 'View details'}
          </button>
        </div>

        {expanded && renderDetails(req)}
      </div>
    )
  }

  const renderHistoryRow = (req: AccessRequestWithUser) => {
    const counterpart = isDoctor
      ? (req.patient_name || req.patientName || req.patient_email || req.patientEmail || 'Unknown patient')
      : (req.doctor_name || req.doctorName || req.doctor_email || req.doctorEmail || 'Unknown doctor')
    const expanded = expandedId === req.id

    return (
      <div key={req.id} className="glass-card" style={{ padding: '16px 20px' }}>
        <div className="flex justify-between items-center">
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '14px' }}>{counterpart}</p>
            {req.expires_at && (
              <p style={{ fontSize: '12px', color: req.effectively_expired ? '#b71c1c' : 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} />
                {req.effectively_expired
                  ? `Expired ${new Date(req.expires_at).toLocaleDateString()}`
                  : `Access expires ${new Date(req.expires_at).toLocaleString()}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isDoctor && req.status === 'approved' && !req.effectively_expired && (
              <>
                <Link href={`/dashboard/records?patient=${pick(req, 'patientId', 'patient_id')}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>Records</Link>
                <Link href={`/dashboard/history?patient=${pick(req, 'patientId', 'patient_id')}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>History</Link>
              </>
            )}
            <span className={`badge badge-${req.status}`}>{req.effectively_expired ? 'expired' : req.status}</span>
            <button onClick={() => handleDelete(req.id)} disabled={actionLoading === req.id} title="Remove from history"
              style={{ display: 'flex', alignItems: 'center', padding: '4px', color: 'var(--color-on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#b71c1c')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-on-surface-variant)')}>
              <Trash2 size={14} />
            </button>
            <button onClick={() => toggleDetails(req.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Details
            </button>
          </div>
        </div>

        {expanded && renderDetails(req)}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="flex justify-between items-center animate-fade-in" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            <Shield size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
            {isDoctor ? 'Patient Requests' : 'Access Requests'}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>
            {isDoctor
              ? `${pending.length} pending · ${others.length} resolved`
              : `${requests.length} total requests`}
          </p>
        </div>
        {!isDoctor && (
          <Link href="/dashboard/access-requests/new" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
            <Plus size={18} /> Request Access
          </Link>
        )}
      </div>

      {error && <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}

      {requests.length === 0 ? (
        <EmptyState icon="shield" title="No access requests" description={isDoctor ? "No patients have invited you yet." : "You haven't invited any doctors yet."} />
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>{isDoctor ? 'Pending Requests' : 'Sent Requests'}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pending.map(renderRequestCard)}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>History</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {others.map(renderHistoryRow)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
