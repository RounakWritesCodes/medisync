'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setLeaving(false)
      requestAnimationFrame(() => setVisible(true))
    } else if (visible) {
      setLeaving(true)
      const t = setTimeout(() => { setVisible(false); setLeaving(false) }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  // close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onCancel])

  if (!visible && !leaving) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onCancel() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: leaving ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.4)',
        backdropFilter: leaving ? 'blur(0px)' : 'blur(8px)',
        WebkitBackdropFilter: leaving ? 'blur(0px)' : 'blur(8px)',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: leaving
            ? '0 8px 32px rgba(0,0,0,0)'
            : '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          transform: leaving
            ? 'scale(0.9) translateY(20px)'
            : 'scale(1) translateY(0)',
          opacity: leaving ? 0 : 1,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: danger ? '#fff0f0' : 'var(--color-primary-container)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <AlertTriangle size={28} style={{ color: danger ? '#b71c1c' : 'var(--color-primary)' }} />
        </div>

        {/* Text */}
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--color-on-surface)' }}>{title}</h3>
        <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginBottom: '28px' }}>{message}</p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              borderRadius: '9999px',
              border: '1.5px solid var(--color-outline-variant)',
              background: 'white',
              color: 'var(--color-on-surface)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = 'var(--color-outline)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--color-outline-variant)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              borderRadius: '9999px',
              border: 'none',
              background: danger ? '#b71c1c' : 'var(--color-primary)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: danger
                ? '0 2px 8px rgba(183,28,28,0.25)'
                : '0 2px 8px rgba(53,37,205,0.25)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = danger
                ? '0 4px 12px rgba(183,28,28,0.35)'
                : '0 4px 12px rgba(53,37,205,0.35)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = danger
                ? '0 2px 8px rgba(183,28,28,0.25)'
                : '0 2px 8px rgba(53,37,205,0.25)'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
