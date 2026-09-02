"""
MediSync Probability Engine

Implements Naive Bayes-based disease probability calculation using the
medical knowledge base. Replaces the deterministic relevance scoring with
proper probabilistic inference.

Key features:
- Bayesian posterior probability calculation
- Prior probability estimation from disease prevalence
- Conditional probability estimation from symptom-disease mappings
- Age and sex-based demographic adjustments
- Contradicting symptom handling
- Probability calibration
"""

import math
import json
from pathlib import Path
from typing import Optional


DATA_PATH = Path(__file__).parent / "data" / "medical_knowledge.json"

with open(DATA_PATH, "r", encoding="utf-8-sig") as f:
    KNOWLEDGE_BASE = json.load(f)


# --- Symptom normalization (shared with disease_ranker) ---

def normalize_symptom(value: str) -> str:
    return " ".join(str(value).strip().casefold().split())


PARENT_SYMPTOMS = {
    "high fever": {"fever"},
    "dry cough": {"cough"},
    "productive cough": {"cough"},
    "watery diarrhea": {"diarrhea"},
    "bloody diarrhea": {"diarrhea"},
    "severe abdominal pain": {"abdominal pain"},
    "upper abdominal pain": {"abdominal pain"},
    "lower abdominal pain": {"abdominal pain"},
    "one-sided weakness": {"weakness"},
    "one sided weakness": {"weakness"},
}


def equivalent(user_symptom: str, reference_symptom: str) -> bool:
    user_symptom = normalize_symptom(user_symptom)
    reference_symptom = normalize_symptom(reference_symptom)
    if user_symptom == reference_symptom:
        return True
    return reference_symptom in PARENT_SYMPTOMS.get(user_symptom, set())


def matched_symptoms(
    user_symptoms: set[str],
    reference_symptoms: set[str],
) -> set[str]:
    matches = set()
    for user_symptom in user_symptoms:
        for reference in reference_symptoms:
            if equivalent(user_symptom, reference):
                matches.add(user_symptom)
                break
    return matches


# --- Disease prior probabilities (base rates) ---
# These represent approximate prevalence in a general symptomatic population.
# Can be updated with real epidemiological data.

DISEASE_PRIORS: dict[str, float] = {}

# Default prior for diseases without specific data
DEFAULT_PRIOR = 1.0 / 300.0  # Uniform across 300 diseases

# Higher-priority diseases (more common in general practice)
HIGH_PREVALENCE_DISEASES = {
    "common cold": 0.15,
    "influenza": 0.12,
    "gastroesophageal reflux": 0.10,
    "migraine": 0.08,
    "tension-type headache": 0.08,
    "urinary tract infection": 0.08,
    "viral gastroenteritis": 0.07,
    "sinusitis": 0.07,
    "bronchitis": 0.06,
    "hypertension": 0.10,
    "type 2 diabetes mellitus": 0.08,
    "anemia": 0.06,
    "anxiety disorder": 0.07,
    "allergic rhinitis": 0.08,
    "asthma": 0.06,
    "pneumonia": 0.05,
    "tonsillitis": 0.05,
    "cervical spondylosis": 0.04,
    "fibromyalgia": 0.03,
    "depression": 0.06,
}

# Moderate prevalence
MODERATE_PREVALENCE_DISEASES = {
    "dengue": 0.04,
    "chikungunya": 0.03,
    "typhoid fever": 0.03,
    "malaria": 0.03,
    "hepatitis a": 0.02,
    "hepatitis b": 0.02,
    "tuberculosis": 0.03,
    "copd": 0.03,
    "cholelithiasis": 0.02,
    "hypothyroidism": 0.03,
    "hyperthyroidism": 0.02,
    "rheumatoid arthritis": 0.02,
    "osteoarthritis": 0.04,
    "kidney stones": 0.03,
    "appendicitis": 0.02,
    "pancreatitis": 0.01,
    "cholecystitis": 0.02,
    "gastritis": 0.04,
    "peptic ulcer disease": 0.03,
    "irritable bowel syndrome": 0.03,
}

# Low prevalence (rare but important)
LOW_PREVALENCE_DISEASES = {
    "meningitis": 0.005,
    "encephalitis": 0.003,
    "brain tumor": 0.002,
    "pulmonary embolism": 0.005,
    "myocardial infarction": 0.01,
    "stroke": 0.01,
    "leukemia": 0.002,
    "lymphoma": 0.002,
    "lupus": 0.005,
    "multiple sclerosis": 0.003,
    "parkinsons disease": 0.005,
    "alzheimers disease": 0.005,
    "hiv aids": 0.005,
    "sickle cell anemia": 0.003,
    "hemophilia": 0.001,
    "crohns disease": 0.005,
    "ulcerative colitis": 0.005,
    "celiac disease": 0.005,
    "cushing syndrome": 0.001,
    "addisons disease": 0.001,
}


def _build_prior_lookup() -> dict[str, float]:
    """Build a normalized prior probability lookup from prevalence data."""
    lookup = {}

    for disease, prior in HIGH_PREVALENCE_DISEASES.items():
        lookup[normalize_symptom(disease)] = prior

    for disease, prior in MODERATE_PREVALENCE_DISEASES.items():
        lookup[normalize_symptom(disease)] = prior

    for disease, prior in LOW_PREVALENCE_DISEASES.items():
        lookup[normalize_symptom(disease)] = prior

    return lookup


_PRIOR_LOOKUP = _build_prior_lookup()


def get_disease_prior(disease_name: str) -> float:
    """Get the prior probability for a disease."""
    normalized = normalize_symptom(disease_name)
    if normalized in _PRIOR_LOOKUP:
        return _PRIOR_LOOKUP[normalized]
    return DEFAULT_PRIOR


# --- Conditional probability estimation ---
# P(symptom | disease) based on knowledge base structure

# Probability weights for different symptom categories
CORE_PROB = 0.85       # P(symptom | disease) if symptom is core
SUPPORTING_PROB = 0.55  # P(symptom | disease) if symptom is supporting
DISTINCTIVE_PROB = 0.75  # P(symptom | disease) if symptom is distinctive
CONTRADICTING_PROB = 0.15  # P(symptom | disease) if symptom contradicts

# Probability of NOT having a symptom given the disease
MISSING_SYMPTOM_PENALTY = 0.4  # How much to reduce for missing expected symptoms


def _build_disease_symptom_probs(condition: dict) -> dict[str, float]:
    """Build conditional probability lookup for a disease.

    Returns: {symptom: P(symptom | disease)}
    """
    probs = {}

    core = {normalize_symptom(s) for s in condition.get("core_symptoms", [])}
    supporting = {normalize_symptom(s) for s in condition.get("supporting_symptoms", [])}
    distinctive = {normalize_symptom(s) for s in condition.get("distinctive_symptoms", [])}
    contradicting = {normalize_symptom(s) for s in condition.get("contradicting_symptoms", [])}

    for symptom in core:
        probs[symptom] = CORE_PROB

    for symptom in supporting:
        if symptom not in probs:
            probs[symptom] = SUPPORTING_PROB

    for symptom in distinctive:
        if symptom not in probs:
            probs[symptom] = DISTINCTIVE_PROB

    for symptom in contradicting:
        probs[symptom] = CONTRADICTING_PROB

    return probs


# --- Age-based demographic adjustments ---

# Diseases more likely at certain ages
AGE_RISK_FACTORS: dict[str, tuple[float, float, float]] = {
    # (weight_below_18, weight_18_50, weight_above_50)
    "common cold": (1.2, 1.0, 0.9),
    "influenza": (1.3, 1.0, 1.2),
    "bronchiolitis": (1.8, 0.3, 0.3),
    "croup": (2.0, 0.2, 0.2),
    "measles": (1.5, 0.5, 0.3),
    "mumps": (1.5, 0.5, 0.3),
    "chickenpox": (1.5, 0.3, 0.2),
    "tonsillitis": (1.3, 0.8, 0.5),
    "otitis media": (1.5, 0.5, 0.3),
    "urinary tract infection": (0.8, 1.3, 1.2),
    "kidney stones": (0.3, 1.2, 1.5),
    "prostatitis": (0.0, 1.3, 1.5),
    "hypertension": (0.2, 0.8, 1.5),
    "type 2 diabetes mellitus": (0.2, 0.8, 1.5),
    "coronary artery disease": (0.1, 0.7, 1.8),
    "stroke": (0.1, 0.5, 2.0),
    "parkinsons disease": (0.0, 0.3, 2.5),
    "alzheimers disease": (0.0, 0.1, 3.0),
    "osteoarthritis": (0.1, 0.6, 2.0),
    "osteoporosis": (0.1, 0.4, 2.5),
    "pneumonia": (1.2, 0.8, 1.3),
    "tuberculosis": (0.8, 1.2, 1.1),
    "malaria": (1.1, 1.0, 0.9),
    "dengue": (1.0, 1.1, 0.9),
    "meningitis": (1.5, 1.0, 0.8),
    "leukemia": (1.3, 0.8, 1.0),
    "sickle cell anemia": (1.5, 1.0, 0.8),
}


def _get_age_factor(disease_name: str, age: Optional[int]) -> float:
    """Get age-based risk adjustment factor."""
    if age is None:
        return 1.0

    normalized = normalize_symptom(disease_name)

    if normalized not in AGE_RISK_FACTORS:
        return 1.0

    low, mid, high = AGE_RISK_FACTORS[normalized]

    if age < 18:
        return low
    elif age <= 50:
        return mid
    else:
        return high


# --- Sex-based demographic adjustments ---

# Diseases more likely in one sex
SEX_RISK_FACTORS: dict[str, dict[str, float]] = {
    "urinary tract infection": {"female": 1.5, "male": 0.7},
    "prostatitis": {"female": 0.0, "male": 1.5},
    "kidney stones": {"female": 0.8, "male": 1.2},
    "coronary artery disease": {"female": 0.7, "male": 1.3},
    "myocardial infarction": {"female": 0.6, "male": 1.4},
    "gout": {"female": 0.4, "male": 1.6},
    "hypothyroidism": {"female": 1.5, "male": 0.5},
    "hyperthyroidism": {"female": 1.5, "male": 0.5},
    "lupus": {"female": 1.8, "male": 0.3},
    "rheumatoid arthritis": {"female": 1.5, "male": 0.6},
    "fibromyalgia": {"female": 1.7, "male": 0.4},
    "breast cancer": {"female": 1.5, "male": 0.01},
    "ovarian cancer": {"female": 1.5, "male": 0.0},
    "prostate cancer": {"female": 0.0, "male": 1.5},
    "cervical cancer": {"female": 1.5, "male": 0.0},
    "endometriosis": {"female": 1.5, "male": 0.0},
    "polycystic ovary syndrome": {"female": 1.5, "male": 0.0},
    "menopause": {"female": 1.5, "male": 0.0},
    "migraine": {"female": 1.3, "male": 0.8},
    "anxiety disorder": {"female": 1.3, "male": 0.8},
    "depression": {"female": 1.2, "male": 0.9},
    "anemia": {"female": 1.3, "male": 0.8},
    "hemophilia": {"female": 0.05, "male": 1.5},
    "sickle cell anemia": {"female": 1.0, "male": 1.0},
}


def _get_sex_factor(disease_name: str, sex: Optional[str]) -> float:
    """Get sex-based risk adjustment factor."""
    if not sex:
        return 1.0

    normalized = normalize_symptom(disease_name)
    sex_lower = sex.strip().casefold()

    if normalized not in SEX_RISK_FACTORS:
        return 1.0

    factors = SEX_RISK_FACTORS[normalized]
    return factors.get(sex_lower, 1.0)


# --- Duration-based adjustments ---

def _get_duration_factor(
    condition: dict,
    duration_days: Optional[float],
) -> float:
    """Adjust probability based on symptom duration vs disease temporal profile."""
    if duration_days is None:
        return 1.0

    profile = condition.get("temporal_profile")
    if not isinstance(profile, dict):
        return 1.0

    min_days = profile.get("min_typical_days")
    max_days = profile.get("max_typical_days")

    if min_days is not None and max_days is not None:
        min_days = float(min_days)
        max_days = float(max_days)

        if min_days <= duration_days <= max_days:
            return 1.1  # Slight boost if within typical range
        elif duration_days < min_days * 0.5 or duration_days > max_days * 2:
            return 0.7  # Penalty if very far from typical range
        else:
            return 0.9  # Mild penalty

    return 1.0


# --- Core probability calculation ---

def calculate_disease_probability(
    user_symptoms: set[str],
    condition: dict,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    duration_days: Optional[float] = None,
) -> dict:
    """Calculate the posterior probability of a disease given symptoms.

    Uses Bayes' theorem:
    P(D|S) ∝ P(D) × P(S|D)

    Where P(S|D) = ∏ P(si|D) × ∏ P(not sj | D)
    (product over observed symptoms and absent expected symptoms)

    Returns dict with probability details.
    """
    disease_name = condition.get("disease", "Unknown")

    # Normalize all symptom sets
    core = {normalize_symptom(s) for s in condition.get("core_symptoms", [])}
    supporting = {normalize_symptom(s) for s in condition.get("supporting_symptoms", [])}
    distinctive = {normalize_symptom(s) for s in condition.get("distinctive_symptoms", [])}
    contradicting = {normalize_symptom(s) for s in condition.get("contradicting_symptoms", [])}

    # Build conditional probability lookup
    cond_probs = _build_disease_symptom_probs(condition)

    # Find matches
    core_matches = matched_symptoms(user_symptoms, core)
    supporting_matches = matched_symptoms(user_symptoms, supporting)
    distinctive_matches = matched_symptoms(user_symptoms, distinctive)
    contradiction_matches = matched_symptoms(user_symptoms, contradicting)
    all_matches = core_matches | supporting_matches | distinctive_matches

    # --- Step 1: Get prior probability ---
    prior = get_disease_prior(disease_name)

    # --- Step 2: Calculate likelihood P(S|D) ---
    # Log-space for numerical stability
    log_likelihood = 0.0

    # Probability of observed symptoms given disease
    for symptom in all_matches:
        norm_symptom = normalize_symptom(symptom)
        p_symptom_given_disease = cond_probs.get(norm_symptom, 0.3)

        # Core matches are stronger evidence
        if norm_symptom in core_matches:
            p_symptom_given_disease = max(p_symptom_given_disease, CORE_PROB)
        elif norm_symptom in supporting_matches:
            p_symptom_given_disease = max(p_symptom_given_disease, SUPPORTING_PROB)
        elif norm_symptom in distinctive_matches:
            p_symptom_given_disease = max(p_symptom_given_disease, DISTINCTIVE_PROB)

        # Avoid log(0)
        p_symptom_given_disease = max(p_symptom_given_disease, 1e-10)
        log_likelihood += math.log(p_symptom_given_disease)

    # Penalty for missing expected symptoms (core symptoms not present)
    missing_core = core - user_symptoms
    for symptom in missing_core:
        # P(not symptom | disease) = 1 - P(symptom | disease)
        p_not_symptom = 1.0 - cond_probs.get(symptom, CORE_PROB)
        p_not_symptom = max(p_not_symptom, 1e-10)

        # Weight missing core symptoms more heavily
        penalty_weight = 1.5 if symptom in core else 1.0
        log_likelihood += penalty_weight * math.log(p_not_symptom)

    # --- Step 3: Handle contradicting symptoms ---
    contradiction_penalty = 1.0
    if contradiction_matches:
        # Each contradiction reduces probability
        for _ in contradiction_matches:
            contradiction_penalty *= 0.3  # Strong penalty per contradiction

    # --- Step 4: Calculate demographic adjustments ---
    age_factor = _get_age_factor(disease_name, age)
    sex_factor = _get_sex_factor(disease_name, sex)
    duration_factor = _get_duration_factor(condition, duration_days)

    demographic_factor = age_factor * sex_factor * duration_factor

    # --- Step 5: Calculate unnormalized posterior ---
    log_posterior = math.log(max(prior, 1e-10)) + log_likelihood
    posterior = math.exp(log_posterior)

    # Apply adjustments
    posterior *= contradiction_penalty * demographic_factor

    # --- Step 6: Coverage-based adjustment ---
    # Diseases explaining more user symptoms get a boost
    if user_symptoms:
        coverage = len(all_matches) / len(user_symptoms)
        # Boost diseases that explain user's symptoms well
        coverage_boost = 1.0 + (coverage * 0.3)
        posterior *= coverage_boost

    # --- Step 7: Core coverage bonus ---
    if core:
        core_coverage = len(core_matches) / len(core)
        # Diseases with core symptom matches are more likely
        core_boost = 1.0 + (core_coverage * 0.5)
        posterior *= core_boost

    return {
        "disease": disease_name,
        "posterior": posterior,
        "prior": prior,
        "log_likelihood": log_likelihood,
        "contradiction_penalty": contradiction_penalty,
        "age_factor": age_factor,
        "sex_factor": sex_factor,
        "duration_factor": duration_factor,
        "demographic_factor": demographic_factor,
        "core_matches": sorted(core_matches),
        "supporting_matches": sorted(supporting_matches),
        "distinctive_matches": sorted(distinctive_matches),
        "contradiction_matches": sorted(contradiction_matches),
        "all_matches": sorted(all_matches),
        "missing_core": sorted(missing_core),
        "core_coverage": len(core_matches) / max(len(core), 1),
        "total_coverage": len(all_matches) / max(len(user_symptoms), 1),
    }


def calculate_probabilities(
    symptoms: list[str],
    age: Optional[int] = None,
    sex: Optional[str] = None,
    duration: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 10,
) -> list[dict]:
    """Calculate probabilities for all diseases given symptoms.

    Returns list of diseases with their posterior probabilities,
    normalized so they sum to 1.0 (representing relative probability).
    """
    if not symptoms:
        return []

    user = {normalize_symptom(s) for s in symptoms if str(s).strip()}
    if not user:
        return []

    # Parse duration
    duration_days = None
    if duration:
        duration_days = _parse_duration_days(duration)

    # Calculate raw posteriors for all diseases
    results = []

    for condition in KNOWLEDGE_BASE:
        # Check required symptoms first
        required_any_of = condition.get("required_any_of", [])
        if required_any_of:
            required_passed = False
            for group in required_any_of:
                if not isinstance(group, list):
                    continue
                group_set = {normalize_symptom(s) for s in group}
                if matched_symptoms(user, group_set):
                    required_passed = True
                    break
            if not required_passed:
                continue

        prob_data = calculate_disease_probability(
            user_symptoms=user,
            condition=condition,
            age=age,
            sex=sex,
            duration_days=duration_days,
        )

        # Skip diseases with very low probability
        if prob_data["posterior"] < 1e-15:
            continue

        # Skip diseases with no symptom matches and low probability
        if not prob_data["all_matches"] and prob_data["posterior"] < 1e-10:
            continue

        results.append(prob_data)

    if not results:
        return []

    # Normalize probabilities to sum to 1.0
    total_posterior = sum(r["posterior"] for r in results)

    if total_posterior > 0:
        for r in results:
            r["probability"] = r["posterior"] / total_posterior
    else:
        # Fallback: equal probability
        for r in results:
            r["probability"] = 1.0 / len(results)

    # Sort by probability
    results.sort(key=lambda x: x["probability"], reverse=True)

    # Apply severity adjustment
    if severity == "severe":
        # For severe symptoms, boost rare/serious conditions
        for r in results[:limit]:
            disease = normalize_symptom(r["disease"])
            if disease in LOW_PREVALENCE_DISEASES:
                r["probability"] *= 1.5
        # Re-normalize
        total = sum(r["probability"] for r in results[:limit])
        if total > 0:
            for r in results[:limit]:
                r["probability"] /= total

    # Select top results
    selected = results[:limit]

    # Add confidence level
    for r in selected:
        prob = r["probability"]
        if prob >= 0.3:
            r["confidence"] = "high"
        elif prob >= 0.15:
            r["confidence"] = "moderate"
        elif prob >= 0.05:
            r["confidence"] = "low"
        else:
            r["confidence"] = "very_low"

    # Add probability percentage
    for r in selected:
        r["probability_percent"] = round(r["probability"] * 100, 1)

    return selected


def _parse_duration_days(duration: str) -> Optional[float]:
    """Parse duration string to days."""
    import re

    text = str(duration).strip().casefold()

    patterns = [
        (r"(\d+(?:\.\d+)?)\s*hour", 1 / 24),
        (r"(\d+(?:\.\d+)?)\s*day", 1),
        (r"(\d+(?:\.\d+)?)\s*week", 7),
        (r"(\d+(?:\.\d+)?)\s*month", 30),
        (r"(\d+(?:\.\d+)?)\s*year", 365),
    ]

    for pattern, multiplier in patterns:
        match = re.search(pattern, text)
        if match:
            return float(match.group(1)) * multiplier

    return None


# --- Calibration ---
# Apply Platt scaling to calibrate probabilities

def calibrate_probability(
    raw_probability: float,
    temperature: float = 1.5,
    bias: float = 0.0,
) -> float:
    """Apply temperature scaling for probability calibration.

    This helps convert raw scores to better-calibrated probabilities.
    """
    # Sigmoid with temperature
    z = (raw_probability - 0.5) * temperature + bias
    calibrated = 1.0 / (1.0 + math.exp(-z))
    return calibrated
