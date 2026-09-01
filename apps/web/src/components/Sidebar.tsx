'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Brain, LayoutDashboard, ClipboardList, HeartPulse, FolderOpen, Shield, Siren, Users, User, LogOut, Stethoscope } from 'lucide-react'
import { api } from '@/lib/api'

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
  logout: LogOut,
}

export default function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const desktopDropdownRef = useRef<HTMLDivElement>(null)
  const mobileDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const getUser = async () => {
      try {
        // Use the shared API client so this hits the backend (:3001), not Next.js.
        // A raw fetch('/api/auth/me') would 404 against the frontend server.
        const data = await api.getMe()
        setUser(data.user)
        setProfile(data.profile)
      } catch {}
    }
    getUser()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const outsideDesktop = desktopDropdownRef.current && !desktopDropdownRef.current.contains(target)
      const outsideMobile = mobileDropdownRef.current && !mobileDropdownRef.current.contains(target)
      if ((!desktopDropdownRef.current || outsideDesktop) && (!mobileDropdownRef.current || outsideMobile)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const goToLogin = () => {
    setShowDropdown(false)
    // Clear the server session, then land on /login.
    // (Previously this button never logged out and just went to /register.)
    api.logout().catch(() => {}).finally(() => {
      window.location.href = '/login'
    })
  }

  const getDisplayName = () => {
    if (profile?.username) return profile.username
    if (user?.username) return user.username
    if (user?.email) return user.email.split('@')[0]
    return 'Profile'
  }

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/dashboard/diagnose', label: 'Symptom Checker', icon: 'clinical_notes' },
    { href: '/dashboard/history', label: 'Diagnosis History', icon: 'monitor_heart' },
  ]

  const healthLinks = [
    { href: '/dashboard/records', label: 'Medical Records', icon: 'folder_open' },
    { href: '/dashboard/access-requests', label: 'Access Requests', icon: 'shield' },
    { href: '/dashboard/emergency-access', label: 'Emergency Access', icon: 'emergency' },
    { href: '/dashboard/guardian', label: 'Guardian', icon: 'family_restroom' },
  ]

  // Admin-only console (D1 doctor credential review).
  const adminLinks = user?.role === 'admin'
    ? [{ href: '/dashboard/admin/verifications', label: 'Doctor Verification', icon: 'stethoscope' }]
    : []

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <Link href="/" className="sidebar-logo">
          <Brain />
        </Link>

        <nav className="sidebar-nav">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
            >
              {(() => { const Icon = iconMap[link.icon]; return Icon ? <Icon /> : null; })()}
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">Health Records</div>

        <nav className="sidebar-nav">
          {healthLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
            >
              {(() => { const Icon = iconMap[link.icon]; return Icon ? <Icon /> : null; })()}
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">Account</div>

        {adminLinks.length > 0 && (
          <>
            {adminLinks.map((link) => (
              <nav className="sidebar-nav" key={link.href} style={{ marginBottom: '4px' }}>
                <Link
                  href={link.href}
                  className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
                >
                  <Stethoscope size={18} />
                  <span>{link.label}</span>
                </Link>
              </nav>
            ))}
          </>
        )}

        <div className="relative w-full" ref={desktopDropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="sidebar-link w-full"
            style={{ cursor: 'pointer' }}
          >
            <User />
            <span>{getDisplayName()}</span>
          </button>

          {showDropdown && (
            <div
              className="absolute left-0 bottom-full mb-2 py-2 rounded-2xl shadow-lg z-50"
              style={{
                width: '220px',
                background: 'rgba(255,255,255,0.4)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-on-surface)' }}>{getDisplayName()}</p>
                <p style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>{user?.email}</p>
              </div>
              <button
                onClick={goToLogin}
                className="w-full px-5 py-3 text-left text-sm font-medium transition-colors flex items-center gap-3"
                style={{ color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-container)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <LogOut style={{ fontSize: '20px' }} />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Nav */}
      <header className="top-nav">
        <Link href="/" className="flex items-center gap-2">
          <Brain style={{ color: 'var(--color-primary)' }} />
          <span className="font-bold text-lg">MediSync Health</span>
        </Link>

        <div className="flex items-center gap-2">
          {navLinks.slice(0, 3).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`p-2 rounded-full transition-colors ${
                isActive(link.href) ? 'text-white' : 'text-on-surface-variant'
              }`}
              style={isActive(link.href) ? { background: 'var(--color-primary)' } : {}}
            >
              {(() => { const Icon = iconMap[link.icon]; return Icon ? <Icon style={{ fontSize: '22px' }} /> : null; })()}
            </Link>
          ))}

          <div className="relative" ref={mobileDropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="p-2 rounded-full transition-colors"
              style={{ background: 'rgba(0,0,0,0.05)' }}
            >
              <User style={{ fontSize: '22px' }} />
            </button>

            {showDropdown && (
              <div
                className="absolute right-0 top-full mt-2 py-2 rounded-2xl shadow-lg z-50"
                style={{
                  width: '180px',
                  background: 'rgba(255,255,255,0.4)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              >
                <button
                  onClick={goToLogin}
                  className="w-full px-5 py-3 text-left text-sm font-medium transition-colors flex items-center gap-3"
                  style={{ color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}
                >
                  <LogOut style={{ fontSize: '20px' }} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
