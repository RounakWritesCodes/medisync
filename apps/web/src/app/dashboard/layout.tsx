'use client'

import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Sidebar />
        <main
          className="main-content"
          style={{
            paddingLeft: '64px',
            minHeight: '100vh',
            paddingTop: '32px',
            paddingRight: '32px',
          }}
        >
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
