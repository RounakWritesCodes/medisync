'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PatientInfoForm from '@/components/forms/PatientInfoForm'
import SymptomsForm from '@/components/forms/SymptomsForm'
import ConditionsForm from '@/components/forms/ConditionsForm'
import { api } from '@/lib/api'
import { useActiveProfile, getRelationshipLabel } from '@/contexts/ActiveProfileContext'
import { ClipboardList, ArrowLeft, ArrowRight, Sparkles, AlertCircle, User } from 'lucide-react'
import type { PatientInfo, DiagnosticInput } from '@medisync/shared'

export default function DiagnosePage() {
  const router = useRouter()
  const { activeProfile, profiles } = useActiveProfile()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: '', age: 0, gender: 'male', weight: undefined, height: undefined, allergies: [], currentMedications: [],
  })
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [duration, setDuration] = useState('')
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe'>('mild')
  const [conditions, setConditions] = useState<string[]>([])

  // Auto-fill patient info from active profile
  useEffect(() => {
    if (activeProfile) {
      const bioSex = (activeProfile.biologicalSex || activeProfile.biological_sex || 'MALE') as string
      setPatientInfo({
        name: activeProfile.fullName || activeProfile.full_name || '',
        age: activeProfile.age,
        gender: bioSex.toLowerCase() === 'male' ? 'male' : 'female',
        weight: undefined,
        height: undefined,
        allergies: activeProfile.allergies || [],
        currentMedications: [],
      })
    }
  }, [activeProfile])

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {}
    if (!patientInfo.name) newErrors.name = 'Name is required'
    if (!patientInfo.age || patientInfo.age < 1 || patientInfo.age > 120) newErrors.age = 'Age must be between 1 and 120'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {}
    if (symptoms.length === 0) newErrors.symptoms = 'At least one symptom is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  const handleSubmit = async () => {
    setLoading(true)
    const input: DiagnosticInput & { profile_id?: string } = {
      patientInfo, symptoms, existingConditions: conditions, symptomDuration: duration, severity,
      ...(activeProfile ? { profile_id: activeProfile.id } : {}),
    }

    try {
      const data = await api.createDiagnosis(input)
      if (data.id) { router.push(`/dashboard/results/${data.id}`); return }
      alert('Diagnosis complete!')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to process diagnosis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          <ClipboardList size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} />
          Symptom Checker
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>
          Step {step} of 3 — {step === 1 ? 'Patient Information' : step === 2 ? 'Symptoms' : 'Medical History'}
        </p>
      </div>

      {/* Profile Banner */}
      {activeProfile && (
        <div
          className="glass-card animate-fade-in flex items-center gap-4"
          style={{ animationDelay: '0.05s', padding: '16px 20px', marginBottom: '24px' }}
        >
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 44,
              height: 44,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          >
            <span className="text-white font-semibold" style={{ fontSize: 18 }}>
              {(activeProfile.fullName || activeProfile.full_name || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-on-surface)' }}>
              Diagnosing for: {activeProfile.fullName || activeProfile.full_name || 'Unknown'}, {activeProfile.age} yrs
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>
              {getRelationshipLabel(activeProfile.relationship)} profile
              {profiles.length > 1 && ' — Switch profile in sidebar if needed'}
            </div>
          </div>
          {activeProfile.relationship !== 'SELF' && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{
                background: 'var(--color-primary-container)',
                color: 'var(--color-primary)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <User size={12} />
              {getRelationshipLabel(activeProfile.relationship)}
            </div>
          )}
        </div>
      )}

      <div className="progress-bar animate-fade-in" style={{ animationDelay: '0.1s', marginBottom: '32px' }}>
        <div className="progress-fill" style={{ width: `${(step / 3) * 100}%` }}></div>
      </div>

      <div className="glass-card animate-fade-in" style={{ animationDelay: '0.2s', padding: '32px' }}>
        {step === 1 && <PatientInfoForm data={patientInfo} onChange={setPatientInfo} errors={errors} />}
        {step === 2 && <SymptomsForm symptoms={symptoms} onSymptomsChange={setSymptoms} duration={duration} onDurationChange={setDuration} severity={severity} onSeverityChange={setSeverity} />}
        {step === 3 && <ConditionsForm conditions={conditions} onConditionsChange={setConditions} allergies={patientInfo.allergies} onAllergiesChange={(allergies) => setPatientInfo({ ...patientInfo, allergies })} medications={patientInfo.currentMedications} onMedicationsChange={(currentMedications) => setPatientInfo({ ...patientInfo, currentMedications })} />}

        <div className="flex justify-between" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--color-outline-variant)' }}>
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="btn-secondary" style={{ padding: '12px 24px', fontSize: '14px' }}>
              <ArrowLeft size={18} /> Back
            </button>
          ) : <div />}
          {step < 3 ? (
            <button onClick={handleNext} className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
              Continue <ArrowRight size={18} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} className="btn-primary disabled:opacity-50" style={{ padding: '12px 24px', fontSize: '14px' }}>
              {loading ? 'Analyzing...' : 'Get Diagnosis'}
              {!loading && <Sparkles size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
