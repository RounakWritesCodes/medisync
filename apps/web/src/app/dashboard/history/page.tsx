'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { HeartPulse, Plus } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

interface Diagnosis {
  id: string; patient_name?: string; patientName?: string; severity: string; symptoms: string[]; age: number; created_at?: string; createdAt?: string;
  owner?: boolean; patient_email?: string | null;
}

export default function HistoryPage() {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPatient, setFilterPatient] = useState<string | null>(null)

  useEffect(() => {
    const fetchDiagnoses = async () => {
      try {
        const data = await api.getDiagnoses()
        setDiagnoses(data)
        // Optional ?patient=<id> — doctors land here from an approved request.
        const sp = new URLSearchParams(window.location.search)
        setFilterPatient(sp.get('patient'))
      } catch {}
      setLoading(false)
    }
    fetchDiagnoses()
  }, [])

  const visible = filterPatient
    ? diagnoses.filter(d => String((d as any).userId ?? (d as any).user_id ?? '') === filterPatient)
    : diagnoses
  const sharedFrom = visible.find(d => d.owner === false)
  const chartOwnerLabel: string | null = filterPatient && sharedFrom
    ? (sharedFrom.patientName || sharedFrom.patient_name || sharedFrom.patient_email || null)
    : null

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this diagnosis?')) {
      await api.deleteDiagnosis(id)
      setDiagnoses(diagnoses.filter((d) => d.id !== id))
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading history..." /></div>

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="flex justify-between items-center animate-fade-in" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            <HeartPulse size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
            Diagnosis History
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>{visible.length} {visible.length === 1 ? 'diagnosis' : 'diagnoses'} shown</p>
        </div>
        <Link href="/dashboard/diagnose" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
          <Plus size={18} /> New Diagnosis
        </Link>
      </div>

      {filterPatient && (
        <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-primary-container)', borderRadius: '12px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>
            Viewing the diagnostic history of <strong>{chartOwnerLabel ?? 'a patient'}</strong> — scope and expiry of your access still apply.
          </span>
          <Link href="/dashboard/history" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Show all</Link>
        </div>
      )}

      {visible.length === 0 ? (
        filterPatient ? (
          <EmptyState icon="inbox" title="No shared diagnoses" description="This patient has no AI diagnoses visible under your granted scope." />
        ) : (
          <EmptyState icon="inbox" title="No diagnoses yet" description="Start your first AI-powered diagnosis to see your health history here." actionLabel="Start First Diagnosis" actionHref="/dashboard/diagnose" />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {visible.map((diagnosis, index) => (
            <Link key={diagnosis.id} href={`/dashboard/results/${diagnosis.id}`} className="glass-card animate-fade-in" style={{ animationDelay: `${index * 0.05}s`, padding: '24px', textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="flex justify-between items-start" style={{ marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{diagnosis.patientName || diagnosis.patient_name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>{new Date(diagnosis.createdAt || diagnosis.created_at || '').toLocaleDateString()}</p>
                </div>
                <span className={`badge-${diagnosis.severity}`}>{diagnosis.severity}</span>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div className="flex flex-wrap" style={{ gap: '6px' }}>
                  {diagnosis.symptoms.slice(0, 3).map((s) => <span key={s} className="tag" style={{ fontSize: '11px', padding: '4px 10px' }}>{s}</span>)}
                  {diagnosis.symptoms.length > 3 && <span className="tag" style={{ fontSize: '11px', padding: '4px 10px' }}>+{diagnosis.symptoms.length - 3} more</span>}
                </div>
              </div>
              <div className="flex justify-between items-center" style={{ paddingTop: '12px', borderTop: '1px solid var(--color-outline-variant)' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                  {diagnosis.age} years
                  {diagnosis.owner === false && (
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-primary)' }}>
                      Shared by patient{diagnosis.patient_email ? ` (${diagnosis.patient_email})` : ''}
                    </span>
                  )}
                </span>
                {diagnosis.owner !== false && (
                  <button onClick={(e) => { e.preventDefault(); handleDelete(diagnosis.id) }} style={{ fontSize: '12px', color: '#b71c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Delete</button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
