-- Migration: Convert ai_response from text to jsonb
-- This preserves existing data by casting text to jsonb

-- First, add a new jsonb column
ALTER TABLE diagnoses ADD COLUMN ai_response_new jsonb;

-- Copy existing data, casting text to jsonb (wrap in try/catch for invalid JSON)
UPDATE diagnoses SET ai_response_new = 
  CASE 
    WHEN ai_response IS NULL THEN NULL
    WHEN ai_response::text ~ '^\s*\{.*\}\s*$' THEN ai_response::jsonb
    ELSE jsonb_build_object('raw_text', ai_response)
  END
WHERE ai_response IS NOT NULL;

-- Drop the old text column
ALTER TABLE diagnoses DROP COLUMN ai_response;

-- Rename the new column
ALTER TABLE diagnoses RENAME COLUMN ai_response_new TO ai_response;
