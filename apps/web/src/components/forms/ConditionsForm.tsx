'use client'

import { Heart } from 'lucide-react'
import TagInput from '@/components/ui/TagInput'

interface ConditionsFormProps {
  conditions: string[]
  onConditionsChange: (conditions: string[]) => void
  allergies: string[]
  onAllergiesChange: (allergies: string[]) => void
  medications: string[]
  onMedicationsChange: (medications: string[]) => void
}

const COMMON_CONDITIONS = [
  'Diabetes', 'Hypertension', 'Asthma', 'Heart Disease', 'Arthritis',
  'Thyroid Disorder', 'Kidney Disease', 'Liver Disease', 'Anemia',
  'Depression', 'Anxiety', 'Migraine', 'GERD', 'Lupus',
]

const COMMON_ALLERGIES = [
  'Penicillin', 'Aspirin', 'Ibuprofen', 'Latex', 'Peanuts',
  'Shellfish', 'Eggs', 'Milk', 'Soy', 'Wheat', 'Fish',
]

const COMMON_MEDICATIONS = [
  'Metformin', 'Lisinopril', 'Amlodipine', 'Omeprazole',
  'Levothyroxine', 'Ibuprofen', 'Acetaminophen', 'Insulin', 'Vitamins',
]

export default function ConditionsForm({
  conditions,
  onConditionsChange,
  allergies,
  onAllergiesChange,
  medications,
  onMedicationsChange,
}: ConditionsFormProps) {
  return (
    <div>
      <div className="section-title" style={{ marginBottom: '24px' }}>
        <Heart style={{ color: 'var(--color-secondary)', fontSize: '22px' }} />
        Medical History (Optional)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <TagInput
          label="Existing Medical Conditions"
          tags={conditions}
          onChange={onConditionsChange}
          placeholder="Type a condition and press Enter..."
          suggestions={COMMON_CONDITIONS}
        />

        <TagInput
          label="Known Allergies"
          tags={allergies}
          onChange={onAllergiesChange}
          placeholder="Type an allergy and press Enter..."
          suggestions={COMMON_ALLERGIES}
        />

        <TagInput
          label="Current Medications"
          tags={medications}
          onChange={onMedicationsChange}
          placeholder="Type a medication and press Enter..."
          suggestions={COMMON_MEDICATIONS}
        />
      </div>
    </div>
  )
}