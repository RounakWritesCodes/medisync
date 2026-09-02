'use client'

import { useState, useRef, useEffect } from 'react'
import { useActiveProfile, getRelationshipLabel } from '@/contexts/ActiveProfileContext'
import { api } from '@/lib/api'
import { User, ChevronDown, Plus, Check, Users, Pencil, Trash2 } from 'lucide-react'

interface ProfileSwitcherProps {
  /** Compact mode for sidebar (default: false) */
  compact?: boolean
}

export default function ProfileSwitcher({ compact = false }: ProfileSwitcherProps) {
  const { profiles, activeProfile, loading, switchProfile, createProfile, updateProfile, deleteProfile } = useActiveProfile()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProfile, setEditingProfile] = useState<any>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading || !activeProfile) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.05)' }}>
        <div className="animate-pulse bg-gray-200 rounded-full" style={{ width: 32, height: 32 }} />
        {!compact && (
          <div className="animate-pulse">
            <div className="bg-gray-200 rounded" style={{ width: 80, height: 12 }} />
            <div className="bg-gray-200 rounded mt-1" style={{ width: 50, height: 10 }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl transition-all hover:bg-black/5"
        style={{ background: isOpen ? 'rgba(0,0,0,0.08)' : 'transparent' }}
      >
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          <span className="text-white font-semibold" style={{ fontSize: 14 }}>
            {(activeProfile.fullName || activeProfile.full_name || 'U').charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Name & Info */}
        {!compact && (
          <div className="flex-1 text-left min-w-0">
            <div className="font-medium truncate" style={{ fontSize: 14, color: 'var(--color-on-surface)' }}>
              {activeProfile.fullName || activeProfile.full_name || 'Unknown'}
            </div>
            <div className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>
              <span>{getRelationshipLabel(activeProfile.relationship)}</span>
              <span>·</span>
              <span>{activeProfile.age} yrs</span>
            </div>
          </div>
        )}

        {/* Chevron */}
        <ChevronDown
          size={16}
          style={{
            color: 'var(--color-on-surface-variant)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-2 py-2 rounded-2xl shadow-lg z-50"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.3)',
            minWidth: 260,
          }}
        >
          {/* Header */}
          <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
            <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>
              <Users size={14} />
              <span>Family Members</span>
            </div>
          </div>

          {/* Profile List */}
          <div className="py-1" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-2 px-2 py-1"
              >
                <button
                  onClick={() => {
                    switchProfile(profile.id)
                    setIsOpen(false)
                  }}
                  className="flex items-center gap-3 flex-1 text-left transition-colors hover:bg-black/5 rounded-lg px-2 py-2"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {/* Avatar */}
                  <div
                    className="flex items-center justify-center rounded-full flex-shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      background: profile.id === activeProfile.id
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'var(--color-surface-highest)',
                    }}
                  >
                  <span
                    className="font-semibold"
                    style={{
                      fontSize: 13,
                      color: profile.id === activeProfile.id ? 'white' : 'var(--color-on-surface-variant)',
                    }}
                  >
                    {(profile.fullName || profile.full_name || 'U').charAt(0).toUpperCase()}
                  </span>
                  </div>

                  {/* Name & Relationship */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                    <span
                      className="font-medium truncate"
                      style={{
                        fontSize: 14,
                        color: 'var(--color-on-surface)',
                      }}
                    >
                      {profile.fullName || profile.full_name || 'Unknown'}
                    </span>
                      {profile.is_default === 1 && (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{
                            background: 'var(--color-primary-container)',
                            color: 'var(--color-primary)',
                            fontSize: 10,
                          }}
                        >
                          Default
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>
                      {getRelationshipLabel(profile.relationship)} · {profile.age} yrs
                    </div>
                  </div>

                  {/* Check icon for active */}
                  {profile.id === activeProfile.id && (
                    <Check size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  )}
                </button>

                {/* Edit Button */}
                {profile.relationship !== 'SELF' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingProfile(profile)
                      setIsOpen(false)
                    }}
                    className="flex items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                    style={{
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      color: 'var(--color-on-surface-variant)',
                    }}
                    title="Edit profile"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add New Button */}
          <div className="px-2 pt-1" style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
            <button
              onClick={() => {
                setIsOpen(false)
                setShowCreateModal(true)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left transition-colors hover:bg-black/5"
              style={{ color: 'var(--color-primary)' }}
            >
              <Plus size={18} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Add Family Member</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Profile Modal */}
      {showCreateModal && (
        <CreateProfileModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createProfile}
        />
      )}

      {/* Edit Profile Modal */}
      {editingProfile && (
        <EditProfileModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onUpdate={updateProfile}
          onDelete={deleteProfile}
        />
      )}
    </div>
  )
}

function CreateProfileModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: any) => Promise<any>
}) {
  const [formData, setFormData] = useState({
    fullName: '',
    relationship: 'CHILD',
    dateOfBirth: '',
    biologicalSex: 'MALE',
    bloodGroup: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.fullName || !formData.dateOfBirth) {
      setError('Name and date of birth are required')
      return
    }

    setLoading(true)
    setError('')
    try {
      await onCreate(formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-3xl"
        style={{ background: 'var(--color-surface)', padding: '32px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
          Add Family Member
        </h2>

        <form onSubmit={handleSubmit}>
          <FormField label="Full Name">
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Enter full name"
              className="w-full rounded-xl"
              style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, padding: '14px 16px' }}
            />
          </FormField>

          <FormField label="Relationship">
            <select
              value={formData.relationship}
              onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
              className="w-full rounded-xl"
              style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, background: 'var(--color-surface)', padding: '14px 16px' }}
            >
              <option value="SELF">Self</option>
              <option value="CHILD">Child</option>
              <option value="PARENT">Parent</option>
              <option value="SPOUSE">Spouse</option>
              <option value="OTHER">Other</option>
            </select>
          </FormField>

          <FormField label="Date of Birth">
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              className="w-full rounded-xl"
              style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, padding: '14px 16px' }}
            />
          </FormField>

          <FormField label="Biological Sex">
            <div className="flex gap-2">
              {['MALE', 'FEMALE', 'INTERSEX'].map((sex) => (
                <button
                  key={sex}
                  type="button"
                  onClick={() => setFormData({ ...formData, biologicalSex: sex })}
                  className="flex-1 rounded-xl text-sm font-medium transition-all"
                  style={{
                    padding: '14px 16px',
                    border: `2px solid ${formData.biologicalSex === sex ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                    background: formData.biologicalSex === sex ? 'var(--color-primary-container)' : 'transparent',
                    color: formData.biologicalSex === sex ? 'var(--color-primary)' : 'var(--color-on-surface)',
                  }}
                >
                  {sex.charAt(0) + sex.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Blood Group (Optional)">
            <select
              value={formData.bloodGroup}
              onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
              className="w-full rounded-xl"
              style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, background: 'var(--color-surface)', padding: '14px 16px' }}
            >
              <option value="">Select blood group</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </FormField>

          {error && (
            <div className="px-4 py-3 rounded-xl" style={{ background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-medium transition-colors"
              style={{ border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl font-medium text-white transition-colors"
              style={{ background: 'var(--color-primary)', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Creating...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditProfileModal({
  profile,
  onClose,
  onUpdate,
  onDelete,
}: {
  profile: any
  onClose: () => void
  onUpdate: (id: string, data: any) => Promise<any>
  onDelete: (id: string) => Promise<any>
}) {
  const [formData, setFormData] = useState({
    fullName: profile.fullName || profile.full_name || '',
    relationship: profile.relationship || 'OTHER',
    dateOfBirth: profile.dateOfBirth || profile.date_of_birth || '',
    biologicalSex: profile.biologicalSex || profile.biological_sex || 'MALE',
    bloodGroup: profile.bloodGroup || profile.blood_group || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.fullName || !formData.dateOfBirth) {
      setError('Name and date of birth are required')
      return
    }

    setLoading(true)
    setError('')
    try {
      await onUpdate(profile.id, formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await onDelete(profile.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-3xl"
        style={{ background: 'var(--color-surface)', padding: '32px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Edit Profile</h2>
          {profile.relationship !== 'SELF' && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#dc2626', fontSize: 13 }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="px-4 py-3 rounded-xl mb-4" style={{ background: '#fee2e2', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
              Delete this profile?
            </p>
            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 12 }}>
              This will permanently delete {profile.full_name}'s profile and cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid #fecaca', color: '#991b1b' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#dc2626', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {!showDeleteConfirm && (
          <form onSubmit={handleSubmit}>
            <FormField label="Full Name">
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Enter full name"
                className="w-full rounded-xl"
                style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, padding: '14px 16px' }}
              />
            </FormField>

            <FormField label="Relationship">
              <select
                value={formData.relationship}
                onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                className="w-full rounded-xl"
                style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, background: 'var(--color-surface)', padding: '14px 16px' }}
              >
                <option value="SELF">Self</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
                <option value="SPOUSE">Spouse</option>
                <option value="OTHER">Other</option>
              </select>
            </FormField>

            <FormField label="Date of Birth">
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full rounded-xl"
                style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, padding: '14px 16px' }}
              />
            </FormField>

            <FormField label="Biological Sex">
              <div className="flex gap-2">
                {['MALE', 'FEMALE', 'INTERSEX'].map((sex) => (
                  <button
                    key={sex}
                    type="button"
                    onClick={() => setFormData({ ...formData, biologicalSex: sex })}
                    className="flex-1 rounded-xl text-sm font-medium transition-all"
                    style={{
                      padding: '14px 16px',
                      border: `2px solid ${formData.biologicalSex === sex ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                      background: formData.biologicalSex === sex ? 'var(--color-primary-container)' : 'transparent',
                      color: formData.biologicalSex === sex ? 'var(--color-primary)' : 'var(--color-on-surface)',
                    }}
                  >
                    {sex.charAt(0) + sex.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Blood Group (Optional)">
              <select
                value={formData.bloodGroup}
                onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                className="w-full rounded-xl"
                style={{ border: '1px solid var(--color-outline-variant)', fontSize: 14, background: 'var(--color-surface)', padding: '14px 16px' }}
              >
                <option value="">Select blood group</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </FormField>

            {error && (
              <div className="px-4 py-3 rounded-xl" style={{ background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div className="flex gap-3" style={{ marginTop: 24 }}>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-medium transition-colors"
                style={{ border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-medium text-white transition-colors"
                style={{ background: 'var(--color-primary)', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8, color: 'var(--color-on-surface)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
