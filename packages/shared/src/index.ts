// Shared types between API and web

// ===== User & Auth =====

export type UserRole = 'patient' | 'doctor' | 'admin';

export type VerificationStatus = 'pending_verification' | 'verified' | 'rejected';

export interface User {
  id: string;
  email: string;
  username?: string;
  role: UserRole;
  verification_status?: VerificationStatus | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  username?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// ===== AI Diagnostic Types =====

export interface PatientInfo {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  weight?: number;
  height?: number;
  allergies: string[];
  currentMedications: string[];
}

export interface DiagnosticInput {
  patientInfo: PatientInfo;
  symptoms: string[];
  existingConditions: string[];
  symptomDuration: string;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface Diagnosis {
  id: string;
  user_id: string;
  patient_name: string;
  age: number;
  gender: string;
  weight?: number;
  height?: number;
  allergies: string[];
  current_medications: string[];
  symptoms: string[];
  existing_conditions: string[];
  symptom_duration: string;
  severity: string;
  ai_response: StructuredAiResponse | string | null;
  created_at: string;
}

// ===== Structured AI Response (from MediSync AI Service) =====

export interface ConditionDetail {
  rank: number;
  name: string;
  match_score: number;
  relevance_label: 'strong' | 'moderate' | 'weak';
  matched_symptoms: string[];
  core_symptoms_matched: string[];
  supporting_symptoms_matched: string[];
  distinctive_symptoms_matched: string[];
  contradicting_symptoms: string[];
  unexplained_symptoms: string[];
  tests: string[];
  specialist: string;
  self_care: string[];
  medication_information: string[];
  category: string;
  summary: string;
  why_considered: string[];
  supporting_evidence: string[];
  evidence_against: string[];
  unexplained_features: string[];
  management_information: string[];
  condition_specific_medication_information: string[];
}

export interface DiagnosticOverview {
  patient_context_summary: string;
  presentation_summary: string;
  interpretation: string;
  low_information: boolean;
  important_missing_information: string[];
  red_flags: string[];
}

export interface MedicationGuidance {
  purpose: string;
  patient_factors_considered: Record<string, unknown>;
  patient_specific_review: Array<{ type: string; factors: string[]; message: string }>;
  condition_specific_information: Array<{ condition: string; information: string }>;
  supportive_management: string[];
  cross_differential_precautions: string[];
  medication_safety_completeness: { status: string; missing_information: string[] };
  prescription_boundary: string;
}

export interface DifferentialSummary {
  strong_relevance: string[];
  moderate_relevance: string[];
  weak_relevance: string[];
  interpretation: string;
}

export interface EmergencyGuidance {
  priority: string;
  action: string;
  do_not_delay_for_app_results: boolean;
}

export interface StructuredAiResponse {
  symptoms: string[];
  extraction_source: string;
  possible_conditions: ConditionDetail[];
  clinical_summary: string;
  diagnostic_overview: DiagnosticOverview;
  differential_summary: DifferentialSummary;
  medication_guidance: MedicationGuidance;
  tests_to_discuss: string[];
  urgency: 'emergency' | 'prompt' | 'routine';
  emergency: boolean;
  red_flags: string[];
  safety_reasons: string[];
  disclaimer: string;
  urgent_message?: string;
  emergency_guidance?: EmergencyGuidance;
  condition_results_are_secondary?: boolean;
}

// ===== Medical Records =====

export type RecordType =
  | 'prescription'
  | 'lab_result'
  | 'checkup'
  | 'surgery'
  | 'imaging'
  | 'other';

export interface MedicalRecord {
  id: string;
  patient_id: string;
  type: RecordType;
  date: string;
  doctor_name: string | null;
  hospital_name: string | null;
  details: Record<string, unknown>;
  attachment_url: string | null;
  content_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

// ===== Access Requests =====

export type AccessRequestStatus = 'pending' | 'partially_approved' | 'approved' | 'denied' | 'revoked';

/** Who holds consent authority for a request (evaluated at decision time). */
export type ConsentModel = 'patient' | 'guardian' | 'dual';

export interface AccessRequestScope {
  categories?: string[] | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface AccessRequest {
  id: string;
  doctor_id: string;
  patient_id: string;
  reason: string | null;
  scope: AccessRequestScope;
  granted_scope: AccessRequestScope | null;
  status: AccessRequestStatus;
  consent_model: ConsentModel | null;
  patient_approved_at: string | null;
  guardian_approved_at: string | null;
  responded_by: string | null;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessRequestWithUser extends AccessRequest {
  doctor_name?: string;
  doctor_email?: string;
  patient_name?: string;
  patient_email?: string;
  effectively_expired?: boolean;
}

// ===== Doctor Verification (India: NMC / State Medical Council) =====

export interface DoctorVerification {
  id: string;
  user_id: string;
  full_name: string;
  registration_number: string;
  council: string;
  qualification: string;
  year_of_registration: number | null;
  status: 'pending_verification' | 'verified' | 'rejected';
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  email?: string;
  username?: string;
}

// ===== Emergency Access =====

export type EmergencyAccessStatus = 'active' | 'revoked' | 'expired';

export type EmergencyAccessReasonCode =
  | 'cardiac_arrest'
  | 'stroke'
  | 'trauma'
  | 'unconscious'
  | 'severe_bleeding'
  | 'respiratory_failure'
  | 'sepsis'
  | 'other';

export interface EmergencyAccess {
  id: string;
  doctor_id: string;
  patient_id: string;
  reason_code: EmergencyAccessReasonCode;
  reason_text: string;
  status: EmergencyAccessStatus;
  granted_at: string;
  expires_at: string;
  created_at: string;
}

export interface EmergencyAccessWithUser extends EmergencyAccess {
  doctor_name?: string;
  doctor_email?: string;
  patient_name?: string;
  patient_email?: string;
}

// ===== Guardian Links =====

export type GuardianTriggerType = 'minor' | 'advance_directive' | 'emergency_incapacity';

export type GuardianStatus =
  | 'pending_guardian'
  | 'pending_senior'
  | 'active_shared_control'
  | 'sole_active'
  | 'denied'
  | 'revoked'
  | 'expired';

export interface GuardianLink {
  id: string;
  patient_id: string;
  guardian_id: string;
  trigger_type: GuardianTriggerType;
  status: GuardianStatus;
  /** What the guardian may read: "records" | "records_and_diagnoses". */
  scope: string;
  authority_document_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuardianLinkWithUser extends GuardianLink {
  patient_name?: string;
  patient_email?: string;
  guardian_name?: string;
  guardian_email?: string;
}

// ===== API Responses =====

export interface ApiError {
  error: string;
  message?: string;
}

export interface AuthResponse {
  user: User;
  profile?: Profile;
}

export interface RecordsResponse {
  records: MedicalRecord[];
  total?: number;
}
