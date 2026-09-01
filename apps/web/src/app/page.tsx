'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Brain, Sparkles, ArrowRight, BadgeCheck, FileText, FolderOpen, Shield } from 'lucide-react'

export default function HomePage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <header
        className="fixed top-0 w-full z-50"
        style={{
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
        }}
      >
        <div className="flex justify-between items-center h-16" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px' }}>
          <Link href="/" className="flex items-center gap-2">
            <Brain style={{ color: 'var(--color-primary)', fontSize: '28px', width: '28px', height: '28px' }} />
            <span className="font-bold text-lg">MediSync Health</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost">Sign In</Link>
            <Link href="/register" className="btn-primary" style={{ padding: '10px 24px', fontSize: '14px' }}>Get Started</Link>
          </div>
        </div>
      </header>

      <main style={{ paddingTop: '120px' }}>
        <section className={`${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px', marginBottom: '80px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '48px', alignItems: 'center' }}>
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'var(--color-primary-container)', color: 'var(--color-on-primary-container)', fontSize: '13px', fontWeight: 600, marginBottom: '24px' }}>
                <Sparkles style={{ fontSize: '16px', width: '16px', height: '16px' }} />
                AI-Powered Health Platform
              </div>
              <h1 className="font-extrabold" style={{ fontSize: '56px', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '20px' }}>
                Your Health,<br />
                <span style={{ color: 'var(--color-primary)' }}>Reimagined</span>
              </h1>
              <p style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)', lineHeight: 1.7, marginBottom: '32px', maxWidth: '500px' }}>
                AI-powered symptom analysis, secure medical records, and seamless health data sharing — all in one place.
              </p>
              <div className="flex gap-4">
                <Link href="/register" className="btn-primary" style={{ padding: '16px 36px', fontSize: '16px' }}>
                  Get Started Free
                  <ArrowRight style={{ fontSize: '20px', width: '20px', height: '20px' }} />
                </Link>
                <Link href="/login" className="btn-secondary" style={{ padding: '16px 36px', fontSize: '16px' }}>Sign In</Link>
              </div>
            </div>

            <div style={{ position: 'relative', height: '400px' }}>
              <div className="glass-card" style={{ position: 'absolute', top: '20px', right: '0', width: '320px', padding: '24px' }}>
                <div className="flex items-center gap-3" style={{ marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Brain style={{ color: 'var(--color-primary)', fontSize: '22px', width: '22px', height: '22px' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>AI Analysis</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>Processing symptoms...</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="tag active" style={{ fontSize: '11px', padding: '4px 10px' }}>Headache</span>
                  <span className="tag active" style={{ fontSize: '11px', padding: '4px 10px' }}>Fatigue</span>
                  <span className="tag" style={{ fontSize: '11px', padding: '4px 10px' }}>+3 more</span>
                </div>
              </div>

              <div className="tonal-tertiary" style={{ position: 'absolute', bottom: '40px', left: '20px', width: '260px', padding: '20px' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
                  <BadgeCheck style={{ fontSize: '20px', width: '20px', height: '20px' }} />
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>Health Score</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700 }}>87<span style={{ fontSize: '16px', fontWeight: 500 }}>/100</span></div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Good condition</div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px', marginBottom: '80px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: 700, marginBottom: '12px' }}>Everything You Need</h2>
            <p style={{ fontSize: '16px', color: 'var(--color-on-surface-variant)' }}>Complete health management powered by AI</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {[
              { Icon: FileText, title: 'Symptom Analysis', desc: 'Enter symptoms and get instant AI-powered analysis with possible diagnoses.', color: 'primary' },
              { Icon: FolderOpen, title: 'Medical Records', desc: 'Store, manage, and share your medical records securely with healthcare providers.', color: 'tertiary' },
              { Icon: Shield, title: 'Access Control', desc: 'Patient-controlled data sharing with granular access permissions and emergency protocols.', color: 'secondary' },
            ].map((item) => (
              <div key={item.title} className="glass-card" style={{ padding: '28px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: `var(--color-${item.color}-container)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <item.Icon style={{ color: `var(--color-${item.color})`, fontSize: '24px', width: '24px', height: '24px' }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{item.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px', marginBottom: '80px' }}>
          <div className="glass-panel" style={{ padding: '64px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '16px' }}>Ready to Start?</h2>
            <p style={{ fontSize: '16px', color: 'var(--color-on-surface-variant)', marginBottom: '32px', maxWidth: '500px', margin: '0 auto 32px' }}>
              Join thousands of users who trust MediSync Health for their health management needs.
            </p>
            <Link href="/register" className="btn-primary" style={{ padding: '16px 40px', fontSize: '16px' }}>
              Start Free
              <ArrowRight style={{ fontSize: '20px', width: '20px', height: '20px' }} />
            </Link>
          </div>
        </section>
      </main>

      <footer style={{ padding: '32px', borderTop: '1px solid var(--color-outline-variant)', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>&copy; 2026 MediSync Health. All rights reserved.</p>
      </footer>
    </div>
  )
}
