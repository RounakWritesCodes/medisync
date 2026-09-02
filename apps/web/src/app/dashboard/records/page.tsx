'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { FolderOpen, Plus, FileText, ArrowRight, Pill, FlaskConical, ScanLine } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { MedicalRecord } from '@medisync/shared'

export default function RecordsPage() {
  const router = useRouter()
  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPatient, setFilterPatient] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MedicalRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        await api.getMe()
        const data = await api.getRecords()
        setRecords(data)
        // Optional ?patient=<id> — doctors land here from an approved request.
        const sp = new URLSearchParams(window.location.search)
        setFilterPatient(sp.get('patient'))
      } catch { router.push('/login') }
      setLoading(false)
    }
    fetchRecords()
  }, [router])

  const anyField = (obj: any, a: string, b: string) => obj?.[a] ?? obj?.[b]
  const visible = filterPatient
    ? records.filter(r => String(anyField(r, 'patientId', 'patient_id') ?? '') === filterPatient)
    : records
  const sharedFrom = visible.find(r => anyField(r, 'owner', 'owner') === false)
  const chartOwnerLabel: string | null = filterPatient && sharedFrom
    ? (anyField(sharedFrom, 'patient_name', 'patient_name') || anyField(sharedFrom, 'patient_email', 'patient_email') || null)
    : null

  const handleDelete = (record: MedicalRecord) => {
    setDeleteTarget(record)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await api.deleteRecord(deleteTarget.id)
    setRecords(records.filter(r => r.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading records..." /></div>

  return (
    <>
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="flex justify-between items-center animate-fade-in" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            <FolderOpen size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
            Medical Records
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>{records.length} records</p>
        </div>
        <Link href="/dashboard/records/new" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
          <Plus size={18} /> Add Record
        </Link>
      </div>

      {filterPatient && (
        <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-primary-container)', borderRadius: '12px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>
            Viewing the shared chart of <strong>{chartOwnerLabel ?? 'a patient'}</strong> — scope and expiry of your access still apply.
          </span>
          <Link href="/dashboard/records" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Show all</Link>
        </div>
      )}

      {visible.length === 0 ? (
        filterPatient ? (
          <EmptyState icon="folder_open" title="No shared records" description="This patient has no records visible under your granted scope." />
        ) : (
          <EmptyState icon="folder_open" title="No records yet" description="Upload your first prescription photo or add a medical record." actionLabel="Add First Record" actionHref="/dashboard/records/new" />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {visible.map((record, index) => (
            <div
              key={record.id}
              className="glass-card animate-fade-in"
              style={{ animationDelay: `${index * 0.05}s`, padding: '20px', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onClick={() => router.push(`/dashboard/records/${record.id}`)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ marginBottom: '16px' }}>
                {record.attachmentUrl ? (
                  <div style={{ borderRadius: '12px', overflow: 'hidden', height: '160px', background: 'var(--color-surface-highest)' }}>
                    {record.contentType?.startsWith('image/') ? (
                      <img src={record.attachmentUrl} alt="Prescription" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={48} style={{ color: 'var(--color-primary)' }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ height: '160px', borderRadius: '12px', background: 'var(--color-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(() => { const typeIconMap: Record<string, React.ComponentType<any>> = { prescription: Pill, lab_result: FlaskConical, imaging: ScanLine }; const Icon = typeIconMap[record.type] || FileText; return <Icon size={48} style={{ color: 'var(--color-primary)' }} />; })()}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-start" style={{ marginBottom: '8px' }}>
                <div className="flex items-center" style={{ gap: '8px' }}>
                  <span className="badge badge-active" style={{ textTransform: 'capitalize' }}>{record.type.replace('_', ' ')}</span>
                  {(record.profileName || record.profile_name) && (
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: (record.profileRelationship || record.profile_relationship) === 'SELF' ? 'var(--color-primary-container)' : 'var(--color-secondary-container)',
                      color: (record.profileRelationship || record.profile_relationship) === 'SELF' ? 'var(--color-primary)' : 'var(--color-secondary)',
                      fontWeight: 500,
                    }}>
                      {record.profileName || record.profile_name}
                      {(record.profileRelationship || record.profile_relationship) && (record.profileRelationship || record.profile_relationship) !== 'SELF' && (
                        <span style={{ marginLeft: '4px', opacity: 0.7 }}>({record.profileRelationship || record.profile_relationship})</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{record.date}</p>
              <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>{record.doctorName || 'No doctor specified'}</p>
              <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>{record.hospitalName || ''}</p>
              {anyField(record, 'owner', 'owner') === false && (
                <p style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600, marginTop: '4px' }}>
                  Shared by patient{anyField(record, 'patient_email', 'patient_email') ? ` (${anyField(record, 'patient_email', 'patient_email')})` : ''}
                </p>
              )}
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {anyField(record, 'owner', 'owner') !== false && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(record) }} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Delete</button>
                )}
                <ArrowRight size={16} style={{ color: 'var(--color-on-surface-variant)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <ConfirmDialog
      open={!!deleteTarget}
      title="Delete Record"
      message={`Are you sure you want to delete this ${deleteTarget?.type?.replace('_', ' ')} record from ${deleteTarget?.date}? This action cannot be undone.`}
      confirmLabel={deleting ? 'Deleting...' : 'Delete'}
      onConfirm={confirmDelete}
      onCancel={() => { if (!deleting) setDeleteTarget(null) }}
    />
    </>
  )
}
