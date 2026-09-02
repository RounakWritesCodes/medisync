'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ArrowLeft, Shield, FileText, HeartPulse, Eye, Users } from 'lucide-react'

interface PatientProfile {
  id: string
  fullName?: string
  full_name?: string
  relationship: string
  isDefault?: number
  is_default?: number
}

export default function NewAccessRequestPage() {
  const router = useRouter()
  const [doctorEmail, setDoctorEmail] = useState('')
  const [reason, setReason] = useState('')
  const [profiles, setProfiles] = useState<PatientProfile[]>([])
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [allRecords, setAllRecords] = useState<any[]>([])
  const [allDiagnoses, setAllDiagnoses] = useState<any[]>([])

  // Fetch profiles, records, and diagnoses on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profilesRes, recordsRes, diagnosesRes] = await Promise.all([
          api.getProfiles(),
          api.getRecords(),
          api.getDiagnoses()
        ])
        setProfiles(Array.isArray(profilesRes) ? profilesRes : (profilesRes?.profiles || []))
        setAllRecords(Array.isArray(recordsRes) ? recordsRes : (recordsRes?.records || []))
        setAllDiagnoses(Array.isArray(diagnosesRes) ? diagnosesRes : (diagnosesRes?.diagnoses || []))
      } catch {}
    }
    fetchData()
  }, [])

  const toggleProfile = (id: string) => {
    setSelectedProfileIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const selectAllProfiles = () => {
    setSelectedProfileIds(profiles.map(p => p.id))
  }

  const clearProfileSelection = () => {
    setSelectedProfileIds([])
  }

  // Filter records/diagnoses based on selected profiles
  const visibleRecords = selectedProfileIds.length === 0
    ? allRecords // No selection = show all (full access)
    : allRecords.filter(r => {
        const pid = r.profileId || r.profile_id
        // Old records without profile_id: show if default profile is selected
        if (!pid) {
          const defaultProfile = profiles.find(p => (p.isDefault === 1 || p.is_default === 1))
          return defaultProfile ? selectedProfileIds.includes(defaultProfile.id) : true
        }
        return selectedProfileIds.includes(pid)
      })

  const visibleDiagnoses = selectedProfileIds.length === 0
    ? allDiagnoses
    : allDiagnoses.filter(d => {
        const pid = d.profileId || d.profile_id
        if (!pid) {
          const defaultProfile = profiles.find(p => (p.isDefault === 1 || p.is_default === 1))
          return defaultProfile ? selectedProfileIds.includes(defaultProfile.id) : true
        }
        return selectedProfileIds.includes(pid)
      })

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
      // Empty array = full access, non-empty = only those profiles
      await api.createAccessRequest({
        doctor_email: doctorEmail,
        reason: reason.trim(),
        scope: {},
        profile_ids: selectedProfileIds
      })
      router.push('/dashboard/access-requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setLoading(false)
    }
  }

  const getProfileName = (p: PatientProfile) => p.fullName || p.full_name || 'Unnamed'
  const isDefault = (p: PatientProfile) => p.isDefault === 1 || p.is_default === 1

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <Link href="/dashboard/access-requests" className="inline-flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--color-primary)', textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}>
          <ArrowLeft size={18} /> Back to Requests
        </Link>
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          <Shield size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
          Request Doctor Access
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>
          Invite a doctor to view your medical records. Choose which family member&apos;s records they can see.
        </p>
      </div>

      <div className="glass-card animate-fade-in" style={{ padding: '32px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Doctor Email */}
          <div>
            <label className="label">Doctor Email <span style={{ color: '#b71c1c' }}>*</span></label>
            <input
              type="email"
              required
              placeholder="doctor@hospital.com"
              value={doctorEmail}
              onChange={(e) => setDoctorEmail(e.target.value)}
              className="input-field"
            />
            <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '6px' }}>
              Enter the email address of the doctor you want to share records with.
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="label">Reason for Request <span style={{ color: '#b71c1c' }}>*</span></label>
            <textarea
              required
              rows={3}
              maxLength={1000}
              placeholder="Why do you want this doctor to access your records? (e.g., second opinion, ongoing treatment, specialist referral)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Profile Selection */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
              <label className="label" style={{ margin: 0 }}>
                <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Which profiles can this doctor see?
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllProfiles}
                  style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, textDecoration: 'underline' }}>
                  Select All
                </button>
                <button type="button" onClick={clearProfileSelection}
                  style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, textDecoration: 'underline' }}>
                  Clear
                </button>
              </div>
            </div>

            {profiles.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: '12px', color: 'var(--color-on-surface-variant)', fontSize: '13px' }}>
                No profiles found. Create a profile first.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {profiles.map(profile => {
                  const selected = selectedProfileIds.includes(profile.id)
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => toggleProfile(profile.id)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '14px',
                        border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                        background: selected ? 'var(--color-primary-container)' : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div className="flex items-center gap-2" style={{ marginBottom: '4px' }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '6px',
                          border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-outline)'}`,
                          background: selected ? 'var(--color-primary)' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', color: 'white', fontWeight: 700
                        }}>
                          {selected ? '✓' : ''}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-on-surface)' }}>
                          {getProfileName(profile)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginLeft: '28px' }}>
                        {profile.relationship}
                        {isDefault(profile) && (
                          <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px', borderRadius: '6px', background: 'var(--color-tertiary-container)', color: 'var(--color-tertiary)' }}>
                            SELF
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '8px' }}>
              {selectedProfileIds.length === 0
                ? 'No profiles selected — the doctor will have access to ALL your profiles.'
                : `${selectedProfileIds.length} profile${selectedProfileIds.length > 1 ? 's' : ''} selected — doctor can only see these profiles.`
              }
            </p>
          </div>

          {/* Live Preview */}
          <div style={{ borderTop: '1px solid var(--color-outline-variant)', paddingTop: '20px' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: '16px' }}>
              <Eye size={18} style={{ color: 'var(--color-primary)' }} />
              <label className="label" style={{ margin: 0, fontSize: '15px' }}>
                What the doctor will see ({visibleRecords.length} records, {visibleDiagnoses.length} diagnoses)
              </label>
            </div>

            {visibleRecords.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '8px' }}>
                  <FileText size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Medical Records
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', padding: '12px', background: 'var(--color-surface)', borderRadius: '12px' }}>
                  {visibleRecords.map((record: any) => {
                    const profile = profiles.find(p => p.id === (record.profileId || record.profile_id))
                    return (
                      <div key={record.id} className="flex items-center justify-between" style={{ padding: '8px 12px', background: 'var(--color-surface-highest)', borderRadius: '8px', fontSize: '13px' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ textTransform: 'capitalize', color: 'var(--color-primary)', fontWeight: 500 }}>{record.type?.replace('_', ' ')}</span>
                          {profile && (
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: 'var(--color-secondary-container)', color: 'var(--color-secondary)' }}>
                              {getProfileName(profile)}
                            </span>
                          )}
                        </div>
                        <span style={{ color: 'var(--color-on-surface-variant)' }}>{record.date}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {visibleDiagnoses.length > 0 && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '8px' }}>
                  <HeartPulse size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Diagnoses
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', padding: '12px', background: 'var(--color-surface)', borderRadius: '12px' }}>
                  {visibleDiagnoses.map((diagnosis: any) => {
                    const profile = profiles.find(p => p.id === (diagnosis.profileId || diagnosis.profile_id))
                    return (
                      <div key={diagnosis.id} className="flex items-center justify-between" style={{ padding: '8px 12px', background: 'var(--color-surface-highest)', borderRadius: '8px', fontSize: '13px' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontWeight: 500 }}>{diagnosis.patientName || diagnosis.patient_name}</span>
                          {profile && (
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: 'var(--color-secondary-container)', color: 'var(--color-secondary)' }}>
                              {getProfileName(profile)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`badge-${diagnosis.severity}`} style={{ fontSize: '11px' }}>{diagnosis.severity}</span>
                          <span style={{ color: 'var(--color-on-surface-variant)' }}>{new Date(diagnosis.createdAt || diagnosis.created_at || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {visibleRecords.length === 0 && visibleDiagnoses.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: '12px', color: 'var(--color-on-surface-variant)', fontSize: '13px' }}>
                No records or diagnoses to share for the selected profiles.
              </div>
            )}
          </div>

          {error && <div style={{ padding: '12px 16px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50" style={{ padding: '14px', fontSize: '15px' }}>
            {loading ? 'Sending...' : 'Send Request to Doctor'}
          </button>
        </form>
      </div>
    </div>
  )
}
