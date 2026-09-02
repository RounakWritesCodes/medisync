'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useActiveProfile } from '@/contexts/ActiveProfileContext'
import { ArrowLeft, FilePlus, Upload, X, Image, FileText } from 'lucide-react'

const RECORD_TYPES = ['prescription', 'lab_result', 'checkup', 'surgery', 'imaging', 'other'] as const
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'

export default function NewRecordPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { activeProfile } = useActiveProfile()
  const [type, setType] = useState<string>('prescription')
  const [date, setDate] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [details, setDetails] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (selected.size > 50 * 1024 * 1024) {
      setError('File too large. Maximum size is 50 MB.')
      return
    }

    setFile(selected)
    setError('')

    if (selected.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreview(ev.target?.result as string)
      reader.readAsDataURL(selected)
    } else {
      setPreview(null)
    }
  }

  const removeFile = () => {
    setFile(null)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const detailsObj = details.trim() ? { notes: details.trim() } : {}
      const record = await api.createRecord({
        type, date, doctor_name: doctorName || undefined, hospital_name: hospitalName || undefined, details: detailsObj,
        profile_id: activeProfile?.id || undefined,
      })

      // Upload file if one was selected
      if (file && record?.id) {
        setUploadProgress(true)
        const formData = new FormData()
        formData.append('file', file)
        await api.uploadRecordFile(record.id, formData)
      }

      router.push('/dashboard/records')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setLoading(false)
      setUploadProgress(false)
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

          {/* File Upload */}
          <div>
            <label className="label">Report Image / Document</label>
            {!file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--color-outline-variant)',
                  borderRadius: '16px',
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: 'var(--color-surface)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-primary-container)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-outline-variant)'; e.currentTarget.style.background = 'var(--color-surface)' }}
              >
                <Upload size={36} style={{ color: 'var(--color-primary)', marginBottom: '12px' }} />
                <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>Click to upload a report</p>
                <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                  JPG, PNG, WebP, or PDF — up to 50 MB
                </p>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                {preview ? (
                  <div style={{ width: '80px', height: '80px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface-highest)' }}>
                    <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ width: '80px', height: '80px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-container)', flexShrink: 0 }}>
                    <FileText size={32} style={{ color: 'var(--color-primary)' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
                    {(file.size / 1024).toFixed(1)} KB • {file.type}
                  </p>
                </div>
                <button type="button" onClick={removeFile} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', color: '#b71c1c' }}>
                  <X size={20} />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {error && <div style={{ padding: '12px 16px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50" style={{ padding: '16px', fontSize: '16px', alignSelf: 'stretch' }}>
            {uploadProgress ? 'Uploading file...' : loading ? 'Saving...' : 'Save Record'}
          </button>
        </form>
      </div>
    </div>
  )
}
