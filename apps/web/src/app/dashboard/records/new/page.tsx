'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ArrowLeft, FilePlus } from 'lucide-react'

const RECORD_TYPES = ['prescription', 'lab_result', 'checkup', 'surgery', 'imaging', 'other'] as const

export default function NewRecordPage() {
  const router = useRouter()
  const [type, setType] = useState<string>('prescription')
  const [date, setDate] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const detailsObj = details.trim() ? { notes: details.trim() } : {}
      await api.createRecord({
        type, date, doctor_name: doctorName || undefined, hospital_name: hospitalName || undefined, details: detailsObj,
      })
      router.push('/dashboard/records')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <Link href="/dashboard/records" className="inline-flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--color-primary)', textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}>
          <ArrowLeft size={18} /> Back to Records
        </Link>
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          <FilePlus size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
          Add Medical Record
        </h1>
      </div>

      <div className="glass-card animate-fade-in" style={{ padding: '32px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="label">Record Type <span style={{ color: '#b71c1c' }}>*</span></label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input-field" style={{ cursor: 'pointer' }}>
                {RECORD_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date <span style={{ color: '#b71c1c' }}>*</span></label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="label">Doctor Name</label>
              <input type="text" placeholder="Optional" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Hospital / Clinic</label>
              <input type="text" placeholder="Optional" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} className="input-field" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Additional notes..." className="input-field" style={{ resize: 'vertical' }} />
          </div>
          {error && <div style={{ padding: '12px 16px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50" style={{ padding: '16px', fontSize: '16px', alignSelf: 'stretch' }}>
            {loading ? 'Saving...' : 'Save Record'}
          </button>
        </form>
      </div>
    </div>
  )
}
