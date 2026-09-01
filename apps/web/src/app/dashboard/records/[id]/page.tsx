'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ArrowLeft, Trash2, Image, FileText } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { MedicalRecord } from '@medisync/shared'

export default function RecordDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [record, setRecord] = useState<MedicalRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        await api.getMe()
        const record = await api.getRecord(id)
        if (record) setRecord(record)
        else router.push('/dashboard/records')
      } catch { router.push('/dashboard/records') }
      setLoading(false)
    }
    fetchRecord()
  }, [id, router])

  const handleDelete = async () => {
    if (!confirm('Delete this record?')) return
    await api.deleteRecord(id)
    router.push('/dashboard/records')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading record..." /></div>
  if (!record) return null

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <Link href="/dashboard/records" className="inline-flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--color-primary)', textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}>
          <ArrowLeft size={18} /> Back to Records
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', textTransform: 'capitalize' }}>{record.type.replace('_', ' ')}</h1>
            <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>{record.date}</p>
          </div>
          <button onClick={handleDelete} className="btn-danger" style={{ padding: '10px 20px', fontSize: '13px' }}>
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      {record.attachment_url && (
        <div className="glass-card animate-fade-in" style={{ padding: '24px', marginBottom: '24px' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '16px' }}>
            <Image size={22} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>
              {record.content_type?.startsWith('image/') ? 'Prescription Photo' : 'Attached Document'}
            </h2>
          </div>
          {record.content_type?.startsWith('image/') ? (
            <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--color-outline-variant)' }}>
              <img src={record.attachment_url} alt="Prescription" style={{ width: '100%', maxHeight: '600px', objectFit: 'contain', background: 'white', cursor: 'zoom-in' }} onClick={() => window.open(record.attachment_url!, '_blank')} />
            </div>
          ) : (
            <a href={record.attachment_url} target="_blank" rel="noopener noreferrer" className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px', textDecoration: 'none', color: 'inherit' }}>
              <FileText size={48} style={{ color: 'var(--color-primary)' }} />
              <div>
                <p style={{ fontWeight: 600 }}>View Document</p>
                <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>Click to open in new tab</p>
              </div>
            </a>
          )}
          <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '12px' }}>
            {record.file_size ? `File size: ${(record.file_size / 1024).toFixed(1)} KB` : ''}
            {record.content_type ? ` • Type: ${record.content_type}` : ''}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: record.attachment_url ? '1fr' : '1fr 1fr', gap: '20px' }} className="animate-fade-in">
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div><p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginBottom: '4px' }}>Doctor</p><p style={{ fontSize: '15px', fontWeight: 600 }}>{record.doctor_name || '—'}</p></div>
            <div><p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginBottom: '4px' }}>Hospital</p><p style={{ fontSize: '15px', fontWeight: 600 }}>{record.hospital_name || '—'}</p></div>
            <div><p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginBottom: '4px' }}>Record Type</p><p style={{ fontSize: '15px', fontWeight: 600, textTransform: 'capitalize' }}>{record.type.replace('_', ' ')}</p></div>
          </div>
        </div>
        {record.details && Object.keys(record.details).length > 0 && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Additional Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(record.details).map(([key, value]) => (
                <div key={key}>
                  <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', textTransform: 'capitalize', marginBottom: '4px' }}>{key.replace(/_/g, ' ')}</p>
                  <p style={{ fontSize: '15px' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
