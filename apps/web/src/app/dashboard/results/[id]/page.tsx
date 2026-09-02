'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ArrowLeft, Brain, Bandage, FlaskConical, Siren, Sparkles, Shield, Pill, AlertTriangle, FileText, Activity } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface CardData { id: string; title: string; icon: string; color: string; bgColor: string; content: string[] }

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** Check if ai_response is the new structured format or legacy text */
function isStructuredResponse(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && 'possible_conditions' in data
}

function parseStructuredResponse(data: Record<string, unknown>): CardData[] {
  const cards: CardData[] = []

  // 1. Clinical Summary
  if (data.clinical_summary && typeof data.clinical_summary === 'string') {
    cards.push({
      id: 'clinical_summary',
      title: 'Clinical Summary',
      icon: 'auto_awesome',
      color: '#014492',
      bgColor: '#d1e4ff',
      content: [data.clinical_summary],
    })
  }

  // 2. Possible Conditions (detailed)
  const conditions = data.possible_conditions as Array<Record<string, unknown>> | undefined
  if (conditions && conditions.length > 0) {
    const conditionItems = conditions.map((c) => {
      const name = c.name || 'Unknown'
      const prob = c.probability_percent ? `${c.probability_percent}%` : ''
      const confidence = c.confidence ? ` (${c.confidence})` : ''
      const symptoms = c.matched_symptoms && Array.isArray(c.matched_symptoms) && (c.matched_symptoms as string[]).length > 0
        ? `\nMatched: ${(c.matched_symptoms as string[]).join(', ')}`
        : ''
      const specialist = c.specialist ? `\nSpecialist: ${c.specialist}` : ''
      const tests = c.tests && Array.isArray(c.tests) && (c.tests as string[]).length > 0
        ? `\nTests: ${(c.tests as string[]).join(', ')}`
        : ''
      const selfCare = c.self_care && Array.isArray(c.self_care) && (c.self_care as string[]).length > 0
        ? `\nSelf-care: ${(c.self_care as string[]).join(', ')}`
        : ''
      return `${name}${prob ? ` - ${prob}${confidence}` : ''}${symptoms}${specialist}${tests}${selfCare}`
    })
    cards.push({
      id: 'conditions',
      title: 'Possible Conditions',
      icon: 'neurology',
      color: '#3525cd',
      bgColor: '#e8deff',
      content: conditionItems,
    })
  }

  // 3. Diagnostic Overview
  const overview = data.diagnostic_overview as Record<string, unknown> | undefined
  if (overview) {
    const overviewItems: string[] = []
    if (overview.presentation_summary) overviewItems.push(`Presentation: ${overview.presentation_summary}`)
    if (overview.interpretation) overviewItems.push(`Interpretation: ${overview.interpretation}`)
    if (overview.patient_context_summary) overviewItems.push(`Patient: ${overview.patient_context_summary}`)
    if (Array.isArray(overview.important_missing_information) && (overview.important_missing_information as string[]).length > 0) {
      overviewItems.push(`Missing info: ${(overview.important_missing_information as string[]).join(', ')}`)
    }
    if (overviewItems.length > 0) {
      cards.push({
        id: 'diagnostic_overview',
        title: 'Diagnostic Overview',
        icon: 'auto_awesome',
        color: '#005338',
        bgColor: '#d1ffe4',
        content: overviewItems,
      })
    }
  }

  // 4. Differential Summary
  const diff = data.differential_summary as Record<string, unknown> | undefined
  if (diff) {
    const diffItems: string[] = []
    if (Array.isArray(diff.strong_relevance) && (diff.strong_relevance as string[]).length > 0) {
      diffItems.push(`Strong: ${(diff.strong_relevance as string[]).join(', ')}`)
    }
    if (Array.isArray(diff.moderate_relevance) && (diff.moderate_relevance as string[]).length > 0) {
      diffItems.push(`Moderate: ${(diff.moderate_relevance as string[]).join(', ')}`)
    }
    if (Array.isArray(diff.weak_relevance) && (diff.weak_relevance as string[]).length > 0) {
      diffItems.push(`Weak: ${(diff.weak_relevance as string[]).join(', ')}`)
    }
    if (diff.interpretation) diffItems.push(diff.interpretation as string)
    if (diffItems.length > 0) {
      cards.push({
        id: 'differential',
        title: 'Differential Summary',
        icon: 'auto_awesome',
        color: '#6b38d4',
        bgColor: '#f0e6ff',
        content: diffItems,
      })
    }
  }

  // 5. Medication Guidance
  const meds = data.medication_guidance as Record<string, unknown> | undefined
  if (meds) {
    const medItems: string[] = []
    if (meds.purpose) medItems.push(meds.purpose as string)
    if (Array.isArray(meds.supportive_management) && (meds.supportive_management as string[]).length > 0) {
      medItems.push(`Supportive: ${(meds.supportive_management as string[]).join('; ')}`)
    }
    if (Array.isArray(meds.cross_differential_precautions) && (meds.cross_differential_precautions as string[]).length > 0) {
      medItems.push(`Precautions: ${(meds.cross_differential_precautions as string[]).join('; ')}`)
    }
    if (meds.prescription_boundary) medItems.push(meds.prescription_boundary as string)
    if (medItems.length > 0) {
      cards.push({
        id: 'medication',
        title: 'Medication Guidance',
        icon: 'healing',
        color: '#005338',
        bgColor: '#6ffabe',
        content: medItems,
      })
    }
  }

  // 6. Recommended Tests
  const tests = data.tests_to_discuss as string[] | undefined
  if (tests && tests.length > 0) {
    cards.push({
      id: 'tests',
      title: 'Recommended Tests',
      icon: 'science',
      color: '#6b38d4',
      bgColor: '#e8deff',
      content: tests,
    })
  }

  // 7. Safety & Emergency
  const emergency = data.emergency as boolean | undefined
  const redFlags = data.red_flags as string[] | undefined
  const safetyReasons = data.safety_reasons as string[] | undefined
  if (emergency || (redFlags && redFlags.length > 0)) {
    const safetyItems: string[] = []
    if (data.urgent_message) safetyItems.push(data.urgent_message as string)
    if (redFlags && redFlags.length > 0) safetyItems.push(`Red flags: ${redFlags.join(', ')}`)
    if (safetyReasons && safetyReasons.length > 0) safetyItems.push(`Reasons: ${safetyReasons.join('; ')}`)
    const guidance = data.emergency_guidance as Record<string, unknown> | undefined
    if (guidance?.action) safetyItems.push(guidance.action as string)
    cards.push({
      id: 'emergency',
      title: 'Emergency Care',
      icon: 'emergency',
      color: '#b71c1c',
      bgColor: '#ffdad6',
      content: safetyItems,
    })
  }

  // 8. Disclaimer
  if (data.disclaimer) {
    cards.push({
      id: 'disclaimer',
      title: 'Disclaimer',
      icon: 'auto_awesome',
      color: '#666666',
      bgColor: '#f0f0f0',
      content: [data.disclaimer as string],
    })
  }

  return cards
}

function parseAIResponse(aiResponse: string | Record<string, unknown>): CardData[] {
  if (!aiResponse) return []

  // Handle structured JSON response (new format)
  if (typeof aiResponse === 'object' && aiResponse !== null && isStructuredResponse(aiResponse)) {
    return parseStructuredResponse(aiResponse as Record<string, unknown>)
  }

  // Handle string response (try parsing as JSON first, then as text)
  const text = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse)

  try {
    const parsed = JSON.parse(text)
    if (isStructuredResponse(parsed)) return parseStructuredResponse(parsed)
  } catch {
    // Not JSON, parse as text
  }

  // Legacy text format fallback
  const cards: CardData[] = []
  const sections = [
    { key: 'CLINICAL SUMMARY', title: 'AI Clinical Summary', icon: 'auto_awesome', color: '#014492', bgColor: '#d1e4ff' },
    { key: 'POSSIBLE DIAGNOSES', title: 'Possible Diagnoses', icon: 'neurology', color: '#3525cd', bgColor: '#e8deff' },
    { key: 'IMMEDIATE SOLUTIONS', title: 'Immediate Solutions', icon: 'healing', color: '#005338', bgColor: '#6ffabe' },
    { key: 'RECOMMENDED TESTS', title: 'Recommended Tests', icon: 'science', color: '#6b38d4', bgColor: '#e8deff' },
    { key: 'WHEN TO SEEK EMERGENCY', title: 'Emergency Care', icon: 'emergency', color: '#b71c1c', bgColor: '#ffdad6' },
  ]
  for (const section of sections) {
    const regex = new RegExp(`${section.key}[\\s:]*\\n([\\s\\S]*?)(?=(?:\\n(?:CLINICAL SUMMARY|POSSIBLE DIAGNOSES|IMMEDIATE SOLUTIONS|RECOMMENDED TESTS|WHEN TO SEEK)|$))`, 'i')
    const match = text.match(regex)
    if (match) {
      const items = match[1].trim().split('\n').map(l => l.replace(/^[•\-\d\.\*\s]+/, '').trim()).filter(l => l.length > 3)
      if (items.length > 0) cards.push({ id: section.key, title: section.title, icon: section.icon, color: section.color, bgColor: section.bgColor, content: items })
    }
  }
  if (cards.length === 0 && text) {
    const items = text.split('\n').map(l => l.replace(/^[•\-\d\.\*\s]+/, '').trim()).filter(l => l.length > 5)
    cards.push({ id: 'analysis', title: 'AI Analysis', icon: 'auto_awesome', color: '#3525cd', bgColor: '#e8deff', content: items.length > 0 ? items : [text] })
  }
  return cards
}

export default function ResultsPage() {
  const params = useParams()
  const router = useRouter()
  const [diagnosis, setDiagnosis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<CardData[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const fetchDiagnosis = async () => {
      try {
        await api.getMe()
        const data = await api.getDiagnosis(params.id as string)
        if (!data) { router.push('/dashboard'); return }
        setDiagnosis(data)
        const aiData = data.aiResponse || data.ai_response
        const parsed = parseAIResponse(aiData)
        setCards(shuffleArray(parsed))
      } catch { router.push('/dashboard') }
      setLoading(false)
    }
    fetchDiagnosis()
  }, [params.id, router])

  const goToNext = useCallback(() => {
    if (cards.length <= 1) return
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % cards.length
        if (next === 0) setCards(prevCards => shuffleArray(prevCards))
        return next
      })
      setIsTransitioning(false)
      startTimeRef.current = Date.now()
      setProgress(0)
    }, 300)
  }, [cards.length])

  useEffect(() => {
    if (cards.length <= 1) return
    const interval = 15000
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      setProgress(Math.min((elapsed / interval) * 100, 100))
      if (elapsed >= interval) goToNext()
    }, 50)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [cards.length, goToNext])

  const iconMap: Record<string, React.ComponentType<any>> = {
    neurology: Brain, healing: Bandage, science: FlaskConical, emergency: Siren, auto_awesome: Sparkles,
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" text="Loading diagnosis..." /></div>
  if (!diagnosis) return null

  const currentCard = cards[currentIndex]

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <Link href="/dashboard/history" className="inline-flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--color-primary)', textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}>
          <ArrowLeft size={18} /> Back to History
        </Link>
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>Diagnosis Results</h1>
        <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)' }}>
          For {diagnosis.patientName || diagnosis.patient_name || 'Unknown'} &middot; {new Date(diagnosis.createdAt || diagnosis.created_at).toLocaleDateString()}
        </p>
      </div>

      {cards.length > 0 && (
        <>
          <div className="progress-bar" style={{ marginBottom: '24px' }}>
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {cards.map((card, i) => (
              <button key={card.id} onClick={() => { setCurrentIndex(i); startTimeRef.current = Date.now(); setProgress(0) }}
                style={{ padding: '8px 16px', borderRadius: '9999px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s ease',
                  background: i === currentIndex ? card.color : 'var(--color-surface-highest)', color: i === currentIndex ? 'white' : 'var(--color-on-surface-variant)' }}>
                {card.title}
              </button>
            ))}
          </div>

          <div className="glass-card animate-fade-in" style={{ padding: '32px', minHeight: '300px', opacity: isTransitioning ? 0 : 1, transition: 'opacity 0.3s ease' }}>
            {currentCard && (
              <>
                <div className="flex items-center gap-3" style={{ marginBottom: '24px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: currentCard.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(() => { const Icon = iconMap[currentCard.icon]; return Icon ? <Icon size={24} style={{ color: currentCard.color }} /> : null; })()}
                  </div>
                  <h2 style={{ fontSize: '22px', fontWeight: 700 }}>{currentCard.title}</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {currentCard.content.map((item, i) => (
                    <div key={i} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--color-outline-variant)', whiteSpace: 'pre-wrap' }}>
                      <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--color-on-surface)' }}>{item}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
