'use client'

import Link from 'next/link'
import { ArrowRight, Brain, LayoutDashboard, ClipboardList, HeartPulse, FolderOpen, Shield, Siren, Users, User } from 'lucide-react'

const iconMap: Record<string, React.ComponentType<any>> = {
  neurology: Brain,
  dashboard: LayoutDashboard,
  clinical_notes: ClipboardList,
  monitor_heart: HeartPulse,
  folder_open: FolderOpen,
  shield: Shield,
  emergency: Siren,
  family_restroom: Users,
  account_circle: User,
  person: User,
}

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}

export default function EmptyState({ icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="glass-card text-center animate-fade-in" style={{ padding: '64px' }}>
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '20px',
          background: 'var(--color-primary-container)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}
      >
        {(() => { const Icon = iconMap[icon]; return Icon ? <Icon style={{ color: 'var(--color-primary)', fontSize: '36px' }} /> : null; })()}
      </div>
      <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '15px', color: 'var(--color-on-surface-variant)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
          {actionLabel}
          <ArrowRight style={{ fontSize: '18px' }} />
        </Link>
      )}
    </div>
  )
}
