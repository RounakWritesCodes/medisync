'use client'

import { User } from 'lucide-react'
import type { PatientInfo } from '@medisync/shared'

interface PatientInfoFormProps {
  data: PatientInfo
  onChange: (data: PatientInfo) => void
  errors?: Record<string, string>
}

export default function PatientInfoForm({ data, onChange, errors = {} }: PatientInfoFormProps) {
  const handleChange = (field: keyof PatientInfo, value: string | number | undefined) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div>
      <div className="section-title" style={{ marginBottom: '24px' }}>
        <User style={{ color: 'var(--color-primary)', fontSize: '22px' }} />
        Your Information
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label className="label">Full Name <span style={{ color: '#b71c1c' }}>*</span></label>
          <input
            type="text"
            placeholder="Enter your full name"
            value={data.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="input-field"
          />
          {errors.name && <p style={{ marginTop: '6px', fontSize: '12px', color: '#b71c1c' }}>{errors.name}</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="label">Age <span style={{ color: '#b71c1c' }}>*</span></label>
            <input
              type="number"
              placeholder="Your age"
              value={data.age || ''}
              onChange={(e) => handleChange('age', parseInt(e.target.value) || 0)}
              min={1}
              max={120}
              className="input-field"
            />
            {errors.age && <p style={{ marginTop: '6px', fontSize: '12px', color: '#b71c1c' }}>{errors.age}</p>}
          </div>

          <div>
            <label className="label">Gender</label>
            <select
              value={data.gender}
              onChange={(e) => handleChange('gender', e.target.value)}
              className="input-field"
              style={{ cursor: 'pointer' }}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="label">Weight (kg)</label>
            <input
              type="number"
              placeholder="Optional"
              value={data.weight || ''}
              onChange={(e) => handleChange('weight', parseFloat(e.target.value) || undefined)}
              min={1}
              max={200}
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Height (cm)</label>
            <input
              type="number"
              placeholder="Optional"
              value={data.height || ''}
              onChange={(e) => handleChange('height', parseFloat(e.target.value) || undefined)}
              min={1}
              max={250}
              className="input-field"
            />
          </div>
        </div>
      </div>
    </div>
  )
}