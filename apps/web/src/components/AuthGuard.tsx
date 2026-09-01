'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await api.getMe()
        setAuthenticated(true)
      } catch {
        router.replace('/login')
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <LoadingSpinner size="lg" text="Checking authentication..." />
      </div>
    )
  }

  if (!authenticated) return null

  return <>{children}</>
}
