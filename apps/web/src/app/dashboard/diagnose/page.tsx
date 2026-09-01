'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PatientInfoForm from '@/components/forms/PatientInfoForm'
import SymptomsForm from '@/components/forms/SymptomsForm'
import ConditionsForm from '@/components/forms/ConditionsForm'
import { api } from '@/lib/api'
import { ClipboardList, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import type { PatientInfo, DiagnosticInput } from '@medisync/shared'

export default function DiagnosePage() {
  const router = useRouter()
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
    const input: DiagnosticInput = {
      patientInfo, symptoms, existingConditions: conditions, symptomDuration: duration, severity,
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
          Step {step} of 3 — {step === 1 ? 'Your Information' : step === 2 ? 'Symptoms' : 'Medical History'}
        </p>
      </div>

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
