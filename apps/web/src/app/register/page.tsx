'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { CheckCircle2, Brain, User, Stethoscope, ShieldCheck, Clock } from 'lucide-react'

/**
 * Indian medical councils (D1) — registration numbers are issued by the NMC
 * (Indian Medical Register) or a State Medical Council and verified by an
 * admin against the council's public register.
 */
const MEDICAL_COUNCILS: { value: string; label: string }[] = [
  { value: 'nmc', label: 'National Medical Commission (NMC)' },
  { value: 'andhra_pradesh', label: 'Andhra Pradesh Medical Council' },
  { value: 'assam', label: 'Assam Medical Council' },
  { value: 'bihar', label: 'Bihar Medical Council' },
  { value: 'chhattisgarh', label: 'Chhattisgarh Medical Council' },
  { value: 'delhi', label: 'Delhi Medical Council' },
  { value: 'goa', label: 'Goa Medical Council' },
  { value: 'gujarat', label: 'Gujarat Medical Council' },
  { value: 'haryana', label: 'Haryana Medical Council' },
  { value: 'himachal_pradesh', label: 'Himachal Pradesh Medical Council' },
  { value: 'jammu_kashmir', label: 'J&K Medical Council' },
  { value: 'jharkhand', label: 'Jharkhand Medical Council' },
  { value: 'karnataka', label: 'Karnataka Medical Council' },
  { value: 'kerala', label: 'Kerala State Medical Councils' },
  { value: 'madhya_pradesh', label: 'Madhya Pradesh Medical Council' },
  { value: 'maharashtra', label: 'Maharashtra Medical Council' },
  { value: 'manipur', label: 'Manipur Medical Council' },
  { value: 'meghalaya', label: 'Meghalaya Medical Council' },
  { value: 'mizoram', label: 'Mizoram Medical Council' },
  { value: 'odisha', label: 'Odisha Medical Council' },
  { value: 'puducherry', label: 'Puducherry Medical Council' },
  { value: 'punjab', label: 'Punjab Medical Council' },
  { value: 'rajasthan', label: 'Rajasthan Medical Council' },
  { value: 'sikkim', label: 'Sikkim Medical Council' },
  { value: 'tamil_nadu', label: 'Tamil Nadu Medical Council' },
  { value: 'telangana', label: 'Telangana State Medical Council' },
  { value: 'tripura', label: 'Tripura Medical Council' },
  { value: 'uttar_pradesh', label: 'Uttar Pradesh Medical Council' },
  { value: 'uttarakhand', label: 'Uttarakhand Medical Council' },
  { value: 'west_bengal', label: 'West Bengal Medical Council' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [role, setRole] = useState<'patient' | 'doctor'>('patient')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Doctor credential fields
  const [fullName, setFullName] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [council, setCouncil] = useState('')
  const [qualification, setQualification] = useState('')
  const [yearOfRegistration, setYearOfRegistration] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<null | { role: 'patient' | 'doctor'; pendingVerification: boolean }>(null)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and contain a letter and a number')
      setLoading(false)
      return
    }

    if (role === 'doctor') {
      if (!fullName.trim() || !registrationNumber.trim() || !council || !qualification.trim()) {
        setError('All doctor credential fields are required')
        setLoading(false)
        return
      }
    }

    try {
      await api.register(
        email,
        password,
        username || undefined,
        role,
        role === 'doctor'
          ? {
              full_name: fullName.trim(),
              registration_number: registrationNumber.trim(),
              council,
              qualification: qualification.trim(),
              ...(yearOfRegistration ? { year_of_registration: Number(yearOfRegistration) } : {}),
            }
          : undefined
      )
      setSuccess({ role, pendingVerification: role === 'doctor' })
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="w-full" style={{ maxWidth: '400px' }}>
          <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 style={{ color: 'var(--color-tertiary)', fontSize: '32px', width: '32px', height: '32px' }} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Account Created!</h1>
            {success.pendingVerification ? (
              <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>
                Your doctor account is <strong>pending verification</strong>. A platform admin will review your{' '}
                {MEDICAL_COUNCILS.find((c) => c.value === council)?.label ?? 'medical council'} registration against the public register.
                You can sign in now, but access-request features stay locked until your credentials are verified.
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '24px' }}>
                Your account has been created successfully. You can now sign in.
              </p>
            )}
            <Link href="/login" className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>Go to Login</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full" style={{ maxWidth: '480px' }}>
        <div className="text-center" style={{ marginBottom: '32px' }}>
          <Link href="/" className="inline-flex items-center gap-2">
            <Brain style={{ color: 'var(--color-primary)', fontSize: '32px', width: '32px', height: '32px' }} />
            <span className="font-bold" style={{ fontSize: '22px' }}>MediSync Health</span>
          </Link>
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          <div className="text-center" style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Create Account</h1>
            <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>Start your health management journey</p>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-error-container)', borderRadius: '12px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {/* --- Role selection --- */}
          <div style={{ marginBottom: '20px' }}>
            <label className="label">I am signing up as</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setRole('patient')}
                aria-pressed={role === 'patient'}
                style={{
                  padding: '18px 12px',
                  borderRadius: '16px',
                  border: `2px solid ${role === 'patient' ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                  background: role === 'patient' ? 'var(--color-primary-container)' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                <User size={22} style={{ color: 'var(--color-primary)' }} />
                Patient
              </button>
              <button
                type="button"
                onClick={() => setRole('doctor')}
                aria-pressed={role === 'doctor'}
                style={{
                  padding: '18px 12px',
                  borderRadius: '16px',
                  border: `2px solid ${role === 'doctor' ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                  background: role === 'doctor' ? 'var(--color-primary-container)' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                <Stethoscope size={22} style={{ color: 'var(--color-primary)' }} />
                Doctor
              </button>
            </div>
          </div>

          <form onSubmit={handleRegister}>
            {role === 'doctor' && (
              <>
                <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'var(--color-surface-variant, #f3f0ff)', borderRadius: '12px', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary)' }} />
                  <span>
                    Doctor accounts are created as <strong>pending verification</strong>. Enter your details exactly as
                    registered with your medical council — an admin verifies them against the NMC / State Medical Council register before clinical features unlock.
                  </span>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label className="label">Full Name (as per council registration) *</label>
                  <input type="text" placeholder="e.g. Dr. Priya Sharma" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="input-field" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label className="label">Medical Registration No. *</label>
                  <input type="text" placeholder="e.g. MCI/2019/45678 or DMC/R/12345" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} required className="input-field" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label className="label">Issuing Council *</label>
                  <select value={council} onChange={(e) => setCouncil(e.target.value)} required className="input-field">
                    <option value="">Select your medical council…</option>
                    {MEDICAL_COUNCILS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label className="label">Qualification *</label>
                  <input type="text" placeholder="e.g. MBBS, MD (General Medicine)" value={qualification} onChange={(e) => setQualification(e.target.value)} required className="input-field" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label className="label">Year of First Registration (optional)</label>
                  <input type="number" min={1956} max={new Date().getFullYear()} placeholder="e.g. 2019" value={yearOfRegistration} onChange={(e) => setYearOfRegistration(e.target.value)} className="input-field" />
                </div>
              </>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label className="label">Username</label>
              <input type="text" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} required className="input-field" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="label">Email</label>
              <input type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="label">Password</label>
              <input type="password" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input-field" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="label">Confirm Password</label>
              <input type="password" placeholder="Confirm your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="input-field" />
            </div>

            {role === 'doctor' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-on-surface-variant)', marginBottom: '16px' }}>
                <Clock size={14} /> Verification is reviewed manually — usually within 1–2 working days.
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50" style={{ padding: '14px', fontSize: '15px' }}>
              {loading ? 'Creating account...' : role === 'doctor' ? 'Submit for Verification' : 'Create Account'}
            </button>
          </form>

          <div className="text-center" style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
