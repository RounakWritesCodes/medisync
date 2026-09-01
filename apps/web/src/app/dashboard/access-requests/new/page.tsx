'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ArrowLeft, Shield } from 'lucide-react'

const RECORD_TYPES = ['prescription', 'lab_result', 'checkup', 'surgery', 'imaging', 'other'] as const

export default function NewAccessRequestPage() {
  const router = useRouter()
  const [patientEmail, setPatientEmail] = useState('')
  const [reason, setReason] = useState('')
  const [scopeType, setScopeType] = useState<'full' | 'category'>('full')
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleCategory = (cat: string) => {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!reason.trim()) {
      setError('A reason for the request is required')
      setLoading(false)
      return
    }

    try {
      const scope = scopeType === 'category' ? { categories } : {}
      await api.createAccessRequest({ patient_email: patientEmail, reason: reason.trim(), scope })
      router.push('/dashboard/access-requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <Link href="/dashboard/access-requests" className="inline-flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--color-primary)', textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}>
          <ArrowLeft size={18} /> Back to Requests
        </Link>
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          <Shield size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
          Request Patient Access
        </h1>
      </div>

      <div className="glass-card animate-fade-in" style={{ padding: '32px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label className="label">Patient Email <span style={{ color: '#b71c1c' }}>*</span></label>
            <input type="email" required placeholder="patient@example.com" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} className="input-field" />
          </div>

          <div>
            <label className="label">Reason for Request <span style={{ color: '#b71c1c' }}>*</span></label>
            <textarea
              required
              rows={3}
              maxLength={1000}
              placeholder="Clinical reason for accessing this patient's records (shared with the patient / their guardian)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div>
            <label className="label">Access Scope</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {(['full', 'category'] as const).map(v => (
                <button key={v} type="button" onClick={() => setScopeType(v)}
                  style={{ padding: '16px', borderRadius: '16px', border: `2px solid ${scopeType === v ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`, background: scopeType === v ? 'var(--color-primary-container)' : 'white', cursor: 'pointer', fontWeight: 600, fontSize: '14px', textTransform: 'capitalize' }}>
                  {v === 'full' ? 'Full Access' : 'Specific Types'}
                </button>
              ))}
            </div>
          </div>

          {scopeType === 'category' && (
            <div>
              <label className="label">Record Types</label>
              <div className="flex flex-wrap" style={{ gap: '8px' }}>
                {RECORD_TYPES.map(cat => (
                  <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                    className={`tag ${categories.includes(cat) ? 'active' : ''}`} style={{ textTransform: 'capitalize' }}>
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '12px 16px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50" style={{ padding: '14px', fontSize: '15px' }}>
            {loading ? 'Sending...' : 'Request Access'}
          </button>
        </form>
      </div>
    </div>
  )
}
