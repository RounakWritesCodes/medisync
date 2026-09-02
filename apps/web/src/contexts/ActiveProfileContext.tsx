'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '@/lib/api'
import type { PatientProfile } from '@medisync/shared'

interface ActiveProfileContextType {
  /** All profiles belonging to the current user */
  profiles: PatientProfile[]
  /** The currently active/selected profile */
  activeProfile: PatientProfile | null
  /** Loading state */
  loading: boolean
  /** Switch to a different profile */
  switchProfile: (profileId: string) => void
  /** Create a new profile */
  createProfile: (data: {
    fullName: string
    relationship: string
    dateOfBirth: string
    biologicalSex: string
    bloodGroup?: string
    allergies?: string[]
  }) => Promise<PatientProfile>
  /** Update a profile */
  updateProfile: (id: string, data: Partial<PatientProfile>) => Promise<PatientProfile>
  /** Delete a profile */
  deleteProfile: (id: string) => Promise<void>
  /** Refresh profiles from server */
  refreshProfiles: () => Promise<void>
}

const ActiveProfileContext = createContext<ActiveProfileContextType | null>(null)

const STORAGE_KEY = 'medisync_active_profile_id'

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<PatientProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)

  /** Fetch all profiles from the server */
  const refreshProfiles = useCallback(async () => {
    try {
      const data = await api.getProfiles()
      const profileList = data.profiles || []
      setProfiles(profileList)

      // Restore active profile from sessionStorage or use default
      const savedId = sessionStorage.getItem(STORAGE_KEY)
      const savedProfile = profileList.find((p: PatientProfile) => p.id === savedId)
      const defaultProfile = profileList.find((p: PatientProfile) => p.is_default === 1)

      if (savedProfile) {
        setActiveProfile(savedProfile)
      } else if (defaultProfile) {
        setActiveProfile(defaultProfile)
        sessionStorage.setItem(STORAGE_KEY, defaultProfile.id)
      } else if (profileList.length > 0) {
        setActiveProfile(profileList[0])
        sessionStorage.setItem(STORAGE_KEY, profileList[0].id)
      }
    } catch (err) {
      console.error('Failed to load profiles:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  /** Switch to a different profile */
  const switchProfile = useCallback((profileId: string) => {
    const profile = profiles.find(p => p.id === profileId)
    if (profile) {
      setActiveProfile(profile)
      sessionStorage.setItem(STORAGE_KEY, profileId)
    }
  }, [profiles])

  /** Create a new profile */
  const createProfile = useCallback(async (data: {
    fullName: string
    relationship: string
    dateOfBirth: string
    biologicalSex: string
    bloodGroup?: string
    allergies?: string[]
  }) => {
    const result = await api.createProfile(data)
    const newProfile = result.profile
    setProfiles(prev => [...prev, newProfile])
    return newProfile
  }, [])

  /** Update a profile */
  const updateProfile = useCallback(async (id: string, data: Partial<PatientProfile>) => {
    const result = await api.updateProfile(id, data)
    const updatedProfile = result.profile
    setProfiles(prev => prev.map(p => p.id === id ? updatedProfile : p))
    if (activeProfile?.id === id) {
      setActiveProfile(updatedProfile)
    }
    return updatedProfile
  }, [activeProfile])

  /** Delete a profile */
  const deleteProfile = useCallback(async (id: string) => {
    await api.deleteProfile(id)
    setProfiles(prev => prev.filter(p => p.id !== id))
    if (activeProfile?.id === id) {
      const remaining = profiles.filter(p => p.id !== id)
      if (remaining.length > 0) {
        setActiveProfile(remaining[0])
        sessionStorage.setItem(STORAGE_KEY, remaining[0].id)
      } else {
        setActiveProfile(null)
        sessionStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [activeProfile, profiles])

  // Load profiles on mount
  useEffect(() => {
    refreshProfiles()
  }, [refreshProfiles])

  return (
    <ActiveProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        loading,
        switchProfile,
        createProfile,
        updateProfile,
        deleteProfile,
        refreshProfiles,
      }}
    >
      {children}
    </ActiveProfileContext.Provider>
  )
}

/** Hook to access the active profile context */
export function useActiveProfile() {
  const context = useContext(ActiveProfileContext)
  if (!context) {
    throw new Error('useActiveProfile must be used within an ActiveProfileProvider')
  }
  return context
}

/** Helper to get relationship display label */
export function getRelationshipLabel(relationship: string): string {
  const labels: Record<string, string> = {
    SELF: 'Me',
    CHILD: 'Child',
    PARENT: 'Parent',
    SPOUSE: 'Spouse',
    OTHER: 'Family',
  }
  return labels[relationship] || 'Family'
}

/** Helper to get relationship icon */
export function getRelationshipIcon(relationship: string): string {
  const icons: Record<string, string> = {
    SELF: 'person',
    CHILD: 'child_care',
    PARENT: 'elderly',
    SPOUSE: 'favorite',
    OTHER: 'group',
  }
  return icons[relationship] || 'person'
}
