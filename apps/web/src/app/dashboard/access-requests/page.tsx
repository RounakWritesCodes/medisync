'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Shield, Plus, Clock, FileText, Users, ChevronDown, ChevronUp } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import type { AccessRequestWithUser, GuardianLinkWithUser } from '@medisync/shared'

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

/**
 * The API serializes drizzle columns as camelCase while shared types declare
 * snake_case. Read both so neither naming breaks the UI.
 */
function pick<T = any>(obj: any, camel: string, snake: string): T {
  return (obj?.[camel] ?? obj?.[snake]) as T
}

export default function AccessRequestsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [requests, setRequests] = useState<AccessRequestWithUser[]>([])
  const [guardianLinks, setGuardianLinks] = useState<GuardianLinkWithUser[]>([])
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
        try {
          const links = await api.getGuardianLinks()
          setGuardianLinks(links)
        } catch {}
      } catch { router.push('/login') }
      setLoading(false)
    }
    fetchData()
  }, [router])

  // Am I an active guardian of someone? Do I act for a dependent?
  const activeGuardianships = guardianLinks.filter(l => l.status === 'active_shared_control')
  const isGuardingSomeone = activeGuardianships.length > 0
  // For requests on my dependents (minor / incapacity): I decide; patient cannot.
  const guardianOnlyFor = new Set(
    activeGuardianships
      .filter(l => pick(l, 'triggerType', 'trigger_type') === 'minor' || pick(l, 'triggerType', 'trigger_type') === 'emergency_incapacity')
      .map(l => String(pick(l, 'patientId', 'patient_id')))
  )

  const handleApprove = async (req: AccessRequestWithUser) => {
    setActionLoading(req.id); setError('')
    try {
      const duration = durations[req.id] ?? 30
      const updated = await api.updateAccessRequest(req.id, 'approved', { duration_days: duration })
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...updated, effectively_expired: false } : r))
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>

  const uid = user?.id
  const isDoctor = user?.role === 'doctor'
  // API serializes camelCase; shared types declare snake_case — read both.
  const doctorVerified = pick(user, 'verificationStatus', 'verification_status') === 'verified'

  /**
   * Can the current user act on this request? Mirrors server-side rules:
   *  - no guardian            -> patient decides
   *  - minor / incapacity     -> guardian only (patient locked out)
   *  - advance_directive      -> patient OR guardian (second consent completes dual approval)
   */
  const canDecide = (req: AccessRequestWithUser): boolean => {
    if (!['pending', 'partially_approved'].includes(req.status)) return false
    const iAmThePatient = pick(req, 'patientId', 'patient_id') === uid
    const guardingThisPatient = activeGuardianships.some(l => String(pick(l, 'patientId', 'patient_id')) === String(pick(req, 'patientId', 'patient_id')) && String(pick(l, 'guardianId', 'guardian_id')) === uid)
    if (guardianOnlyFor.has(String(pick(req, 'patientId', 'patient_id')))) return guardingThisPatient
    if (iAmThePatient) return true
    return guardingThisPatient // dual: guardian co-signs or initiates
  }

  const pending = requests.filter(r => ['pending', 'partially_approved'].includes(r.status))
  const others = requests.filter(r => !['pending', 'partially_approved'].includes(r.status))

  /**
   * Full request detail — who asked, why, what was requested vs actually
   * granted, who decided, and until when. Readable by every party to the
   * request (doctor, patient, guardian).
   */
  const renderDetails = (req: AccessRequestWithUser) => {
    const doctorId = pick(req, 'doctorId', 'doctor_id')
    const pid = pick(req, 'patientId', 'patient_id')
    const respondedByLabel =
      !req.responded_by ? null
      : req.responded_by === doctorId ? 'the requesting doctor'
      : req.responded_by === pid ? 'the patient'
      : 'a guardian'
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
        {req.consent_model && row('Consent model', req.consent_model === 'guardian' ? 'Guardian decides (minor / incapacity)' : req.consent_model === 'dual' ? 'Patient + guardian both required' : 'Patient decides')}
        {req.patient_approved_at && row('Patient approval', new Date(pick(req, 'patientApprovedAt', 'patient_approved_at')).toLocaleString())}
        {req.guardian_approved_at && row('Guardian approval', new Date(pick(req, 'guardianApprovedAt', 'guardian_approved_at')).toLocaleString())}
        {respondedByLabel && row('Last decision by', `${respondedByLabel} · ${new Date(pick(req, 'respondedAt', 'responded_at')).toLocaleString()}`)}
        {req.expires_at && row(
          'Access expires',
          req.effectively_expired
            ? <span style={{ color: '#b71c1c' }}>Expired {new Date(req.expires_at).toLocaleString()} — access revoked automatically</span>
            : new Date(req.expires_at).toLocaleString()
        )}
        {row('Created', pick(req, 'createdAt', 'created_at') ? new Date(pick(req, 'createdAt', 'created_at')).toLocaleString() : '—')}
        {isDoctor &&
          pick(req, 'doctorId', 'doctor_id') === uid &&
          req.status === 'approved' &&
          !req.effectively_expired && (
            row(
              'Patient chart',
              <span style={{ display: 'inline-flex', gap: '12px' }}>
                <Link href={`/dashboard/records?patient=${pid}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Open medical records →</Link>
                <Link href={`/dashboard/history?patient=${pid}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Open diagnosis history →</Link>
              </span>
            )
          )}
      </div>
    )
  }

  const toggleDetails = (id: string) => setExpandedId(prev => prev === id ? null : id)

  const renderRequestCard = (req: AccessRequestWithUser) => {
    const counterpart = isDoctor
      ? (req.patient_name || req.patient_email || 'Unknown patient')
      : `${req.doctor_name || req.doctor_email || 'Unknown doctor'}`
    const iAmGuardianApprover = !isDoctor && !guardianOnlyFor.has(String(pick(req, 'patientId', 'patient_id'))) &&
      activeGuardianships.some(l => String(pick(l, 'patientId', 'patient_id')) === String(pick(req, 'patientId', 'patient_id')))
    const expanded = expandedId === req.id

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
            {req.status === 'partially_approved' && (
              <p style={{ fontSize: '13px', marginTop: '4px', color: '#b45309', fontWeight: 500 }}>
                Dual consent: waiting for {(pick(req, 'patientApprovedAt', 'patient_approved_at') && !pick(req, 'guardianApprovedAt', 'guardian_approved_at')) ? 'guardian' : 'patient'} to also approve.
              </p>
            )}
          </div>

          {canDecide(req) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              {!guardianOnlyFor.has(String(pick(req, 'patientId', 'patient_id'))) && pick(req, 'patientId', 'patient_id') === uid && !iAmGuardianApprover && null}
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
                  {req.status === 'partially_approved' ? 'Final Approve' : 'Approve'}
                </button>
                <button onClick={() => handleDeny(req.id)} disabled={actionLoading === req.id} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px' }}>Deny</button>
              </div>
              {guardianOnlyFor.has(String(pick(req, 'patientId', 'patient_id'))) && (
                <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <Users size={12} /> You approve as guardian of this dependent
                </span>
              )}
            </div>
          )}

          {/* Patient sees "awaiting guardian" when they cannot self-consent */}
          {!canDecide(req) && ['pending'].includes(req.status) && pick(req, 'patientId', 'patient_id') === uid && guardianOnlyFor.has(String(pick(req, 'patientId', 'patient_id'))) && (
            <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', alignSelf: 'center' }}>Awaiting your guardian's decision</span>
          )}
          {/* Doctor sees partial state */}
          {isDoctor && req.status === 'partially_approved' && (
            <span style={{ fontSize: '12px', color: '#b45309', alignSelf: 'center', fontWeight: 500 }}>Awaiting second consent</span>
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
      ? (req.patient_name || req.patient_email || 'Unknown patient')
      : `${req.doctor_name || req.doctor_email || 'Unknown doctor'}`
    const canRevoke =
      (['approved', 'pending', 'partially_approved'].includes(req.status)) &&
      (pick(req, 'doctorId', 'doctor_id') === uid || pick(req, 'patientId', 'patient_id') === uid ||
        activeGuardianships.some(l => String(pick(l, 'patientId', 'patient_id')) === String(pick(req, 'patientId', 'patient_id'))))

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
                  ? `Expired ${new Date(req.expires_at).toLocaleDateString()} — access revoked automatically`
                  : `Access expires ${new Date(req.expires_at).toLocaleString()}`}
              </p>
            )}
            {req.granted_scope && Object.keys(req.granted_scope).length > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>Granted scope: {scopeLabel(req.granted_scope)}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isDoctor && pick(req, 'doctorId', 'doctor_id') === uid && req.status === 'approved' && !req.effectively_expired && (
              <>
                <Link href={`/dashboard/records?patient=${pick(req, 'patientId', 'patient_id')}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>Records</Link>
                <Link href={`/dashboard/history?patient=${pick(req, 'patientId', 'patient_id')}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>History</Link>
              </>
            )}
            <span className={`badge badge-${req.status}`}>{req.effectively_expired ? 'expired' : req.status}</span>
            {req.status === 'approved' && canRevoke && (
              <button onClick={() => handleRevoke(req.id)} disabled={actionLoading === req.id} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer' }}>Revoke</button>
            )}
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
            Access Requests
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>{requests.length} total requests</p>
        </div>
        {isDoctor && (
          doctorVerified ? (
            <Link href="/dashboard/access-requests/new" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
              <Plus size={18} /> Request Access
            </Link>
          ) : (
            <span style={{ fontSize: '13px', padding: '10px 16px', background: 'var(--color-surface-variant, #f3f0ff)', borderRadius: '12px', color: 'var(--color-on-surface-variant)' }}>
              Credentials pending verification — requesting is locked
            </span>
          )
        )}
      </div>

      {error && <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}

      {requests.length === 0 ? (
        <EmptyState icon="shield" title="No access requests" description="Access requests will appear here when doctors request patient data access." />
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Pending</h2>
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
