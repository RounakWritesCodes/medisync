'use client'

import { Info } from 'lucide-react'

interface MedicalDisclaimerProps {
  variant?: 'banner' | 'inline' | 'footer'
}

export default function MedicalDisclaimer({ variant = 'inline' }: MedicalDisclaimerProps) {
  if (variant === 'banner') {
    return (
      <div className="disclaimer" style={{ marginBottom: '24px' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
          <Info style={{ fontSize: '20px' }} />
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Medical Disclaimer</span>
        </div>
        <p style={{ fontSize: '13px', lineHeight: 1.6 }}>
          This tool is for informational purposes only and does not replace professional medical advice.
          Always consult a qualified healthcare provider for diagnosis and treatment.
        </p>
      </div>
    )
  }

  if (variant === 'footer') {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
          For informational purposes only. Not a substitute for professional medical advice.
        </p>
      </div>
    )
  }

  return (
    <div className="disclaimer" style={{ margin: '16px 0' }}>
      <p style={{ fontSize: '13px', lineHeight: 1.6 }}>
        This tool provides AI-generated health insights for informational purposes only.
        It is not a substitute for professional medical advice, diagnosis, or treatment.
      </p>
    </div>
  )
}
