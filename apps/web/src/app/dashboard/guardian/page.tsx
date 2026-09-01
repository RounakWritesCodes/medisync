'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Users, Plus, Baby, FileText, Siren, FolderOpen, ClipboardList } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import type { GuardianLinkWithUser, GuardianTriggerType } from '@medisync/shared'

const TRIGGER_TYPES: { value: GuardianTriggerType; label: string; icon: string }[] = [
  { value: 'minor', label: 'Minor (Under 18)', icon: 'child_care' },
  { value: 'advance_directive', label: 'Advance Directive', icon: 'description' },
  { value: 'emergency_incapacity', label: 'Emergency Incapacity', icon: 'emergency' },
]

export default function GuardianPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [links, setLinks] = useState<GuardianLinkWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [triggerType, setTriggerType] = useState<GuardianTriggerType>('advance_directive')
  const [scope, setScope] = useState<'records' | 'records_and_diagnoses'>('records')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { user: authUser } = await api.getMe()
        setUser(authUser)
        const data = await api.getGuardianLinks()
        setLinks(data)
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
      // The API assigns the current user as patient; only the guardian email,
      // trigger type and read scope are needed. The GUARDIAN must accept the
      // link before any access is granted.
      await api.createGuardianLink({ guardian_email: guardianEmail, trigger_type: triggerType, scope })
      setShowNew(false)
      setGuardianEmail('')
      const data = await api.getGuardianLinks()
      setLinks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    await api.updateGuardianLink(id, status)
    setLinks(prev => prev.map(l => l.id === id ? { ...l, status: status as any } : l))
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>

  const guardianIconMap: Record<string, React.ComponentType<any>> = {
    child_care: Baby, description: FileText, emergency: Siren,
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="flex justify-between items-center animate-fade-in" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            <Users size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
            Guardian Management
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>Manage guardian/proxy access relationships</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
          <Plus size={18} /> New Link
        </button>
      </div>

      {showNew && (
        <div className="glass-card animate-fade-in" style={{ padding: '32px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>Create Guardian Link</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="label">Guardian Email <span style={{ color: '#b71c1c' }}>*</span></label>
              <input type="email" required placeholder="guardian@example.com" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} className="input-field" />
              <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '6px' }}>
                The guardian will receive access only after they accept this link.
              </p>
            </div>
            <div>
              <label className="label">Trigger Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {TRIGGER_TYPES.map(tt => (
                  <button key={tt.value} type="button" onClick={() => setTriggerType(tt.value)}
                    style={{ padding: '16px', borderRadius: '16px', border: `2px solid ${triggerType === tt.value ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`, background: triggerType === tt.value ? 'var(--color-primary-container)' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                    {(() => { const Icon = guardianIconMap[tt.icon]; return Icon ? <Icon size={24} style={{ display: 'block', marginBottom: '4px', color: 'var(--color-primary)' }} /> : null; })()}
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{tt.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">What can this guardian see?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button type="button" onClick={() => setScope('records')}
                  style={{ padding: '16px', borderRadius: '16px', border: `2px solid ${scope === 'records' ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`, background: scope === 'records' ? 'var(--color-primary-container)' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                  <FolderOpen size={24} style={{ display: 'block', margin: '0 auto 4px', color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Medical Records only</span>
                </button>
                <button type="button" onClick={() => setScope('records_and_diagnoses')}
                  style={{ padding: '16px', borderRadius: '16px', border: `2px solid ${scope === 'records_and_diagnoses' ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`, background: scope === 'records_and_diagnoses' ? 'var(--color-primary-container)' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                  <ClipboardList size={24} style={{ display: 'block', margin: '0 auto 4px', color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Records + AI Diagnoses</span>
                </button>
              </div>
            </div>
            {error && <div style={{ padding: '12px 16px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50" style={{ padding: '14px', fontSize: '15px' }}>
                {submitting ? 'Creating...' : 'Create Link'}
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="btn-ghost" style={{ padding: '14px', fontSize: '15px' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {links.length === 0 ? (
        <EmptyState icon="family_restroom" title="No guardian links" description="Create guardian links to manage proxy access." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {links.map(link => (
            <div key={link.id} className="glass-card" style={{ padding: '20px' }}>
              <div className="flex justify-between items-center">
                <div>
                  <p style={{ fontWeight: 600, fontSize: '15px' }}>
                    {(link as any).patientName || link.patient_name || (link as any).patientEmail || link.patient_email || 'Patient'} &harr; {(link as any).guardianName || link.guardian_name || (link as any).guardianEmail || link.guardian_email || 'Guardian'}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                    Type: {((link as any).triggerType || link.trigger_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                    Sees: {((link.scope === 'records_and_diagnoses' ? 'Records + AI Diagnoses' : 'Medical Records') as string)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge badge-${link.status === 'sole_active' || link.status === 'active_shared_control' ? 'approved' : link.status === 'pending_guardian' || link.status === 'pending_senior' ? 'pending' : 'revoked'}`}>
                    {link.status.replace(/_/g, ' ')}
                  </span>
                  {link.status === 'pending_guardian' && user?.id === (link as any).guardianId && (
                    <button onClick={() => handleUpdateStatus(link.id, 'active_shared_control')} className="btn-success" style={{ padding: '8px 16px', fontSize: '13px' }}>Approve</button>
                  )}
                  {(link.status === 'sole_active' || link.status === 'active_shared_control') && (
                    <button onClick={() => handleUpdateStatus(link.id, 'revoked')} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer' }}>Revoke</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
