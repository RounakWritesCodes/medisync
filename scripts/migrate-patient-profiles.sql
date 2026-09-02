-- Migration: Add patient_profiles table and update diagnoses/records
-- Run this on an existing database to add the multi-profile support

-- 1. Create patient_profiles table (if not exists)
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

-- 2. Add profile_id column to diagnoses (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnoses' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE diagnoses ADD COLUMN profile_id UUID REFERENCES patient_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add profile_id column to records (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'records' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE records ADD COLUMN profile_id UUID REFERENCES patient_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create default SELF profile for existing users who have diagnoses but no profiles
INSERT INTO patient_profiles (guardian_user_id, full_name, relationship, date_of_birth, biological_sex, is_default)
SELECT DISTINCT
  d.user_id::uuid,
  COALESCE(d.patient_name, 'Unknown'),
  'SELF',
  COALESCE(d.patient_dob, CURRENT_DATE - INTERVAL '30 years'),
  COALESCE(d.patient_gender, 'male'),
  1
FROM diagnoses d
WHERE NOT EXISTS (
  SELECT 1 FROM patient_profiles pp WHERE pp.guardian_user_id = d.user_id::uuid
)
AND d.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 5. Create default SELF profile for existing users who have records but no profiles
INSERT INTO patient_profiles (guardian_user_id, full_name, relationship, date_of_birth, biological_sex, is_default)
SELECT DISTINCT
  r.user_id::uuid,
  'Patient',
  'SELF',
  CURRENT_DATE - INTERVAL '30 years',
  'male',
  1
FROM records r
WHERE NOT EXISTS (
  SELECT 1 FROM patient_profiles pp WHERE pp.guardian_user_id = r.user_id::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM patient_profiles pp2 WHERE pp2.guardian_user_id = r.user_id::uuid
)
AND r.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Done!
SELECT 'Migration complete: patient_profiles table created, diagnoses and records updated' AS status;
