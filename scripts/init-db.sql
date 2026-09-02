-- MediSync Database Schema
-- This file is run by the Postgres container on first startup.

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient',
  verification_status TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles table (user profile, not patient profile)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT,
  role TEXT DEFAULT 'patient',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patient profiles table (multi-profile / guardian-dependent architecture)
CREATE TABLE IF NOT EXISTS patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'SELF',
  date_of_birth DATE NOT NULL,
  biological_sex TEXT NOT NULL,
  blood_group TEXT,
  allergies JSONB DEFAULT '[]'::jsonb,
  avatar_url TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index: one default profile per guardian
CREATE UNIQUE INDEX IF NOT EXISTS one_default_profile_per_guardian
  ON patient_profiles (guardian_user_id)
  WHERE is_default = 1;

-- Diagnoses table
CREATE TABLE IF NOT EXISTS diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  profile_id UUID REFERENCES patient_profiles(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  weight NUMERIC,
  height NUMERIC,
  allergies JSONB DEFAULT '[]'::jsonb,
  current_medications JSONB DEFAULT '[]'::jsonb,
  symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  existing_conditions JSONB DEFAULT '[]'::jsonb,
  symptom_duration TEXT,
  severity TEXT NOT NULL DEFAULT 'mild',
  ai_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Records table
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES patient_profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  date DATE NOT NULL,
  doctor_name TEXT,
  hospital_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  attachment_url TEXT,
  content_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Access requests table
CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  scope JSONB DEFAULT '{}'::jsonb,
  granted_scope JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  consent_model TEXT,
  patient_approved_at TIMESTAMPTZ,
  guardian_approved_at TIMESTAMPTZ,
  responded_by UUID,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  profile_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index: one pending request per doctor/patient pair
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request_per_pair
  ON access_requests (doctor_id, patient_id)
  WHERE status = 'pending';

-- Emergency access table
CREATE TABLE IF NOT EXISTS emergency_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor verifications table
CREATE TABLE IF NOT EXISTS doctor_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  council TEXT NOT NULL,
  qualification TEXT NOT NULL,
  year_of_registration INTEGER,
  id_document_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role_at_time TEXT,
  action_type TEXT NOT NULL,
  target_patient_id UUID,
  record_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  details JSONB
);

-- Revoked tokens table
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Verification tokens table
CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
