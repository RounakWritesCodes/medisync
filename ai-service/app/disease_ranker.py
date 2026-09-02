import json
import math
from collections import Counter
from pathlib import Path

from app.probability_engine import (
    calculate_probabilities,
    normalize_symptom,
    equivalent,
    matched_symptoms,
)


DATA_PATH = Path(__file__).parent / "data" / "medical_knowledge.json"

with open(DATA_PATH, "r", encoding="utf-8-sig") as f:
    KNOWLEDGE_BASE = json.load(f)


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


GENERIC_SYMPTOMS = {
    "fever",
    "headache",
    "fatigue",
    "body ache",
    "nausea",
    "vomiting",
    "cough",
    "weakness",
    "dizziness",
    "abdominal pain",
}


def normalize_symptom(value: str) -> str:
    return " ".join(str(value).strip().casefold().split())


def equivalent(user_symptom: str, reference_symptom: str) -> bool:
    user_symptom = normalize_symptom(user_symptom)
    reference_symptom = normalize_symptom(reference_symptom)

    if user_symptom == reference_symptom:
        return True

    return reference_symptom in PARENT_SYMPTOMS.get(
        user_symptom,
        set(),
    )


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


def build_symptom_frequency() -> Counter:
    frequency = Counter()

    for condition in KNOWLEDGE_BASE:
        positive = set(condition.get("core_symptoms", []))
        positive.update(condition.get("supporting_symptoms", []))
        positive.update(condition.get("distinctive_symptoms", []))

        for symptom in positive:
            frequency[normalize_symptom(symptom)] += 1

    return frequency


SYMPTOM_FREQUENCY = build_symptom_frequency()


def symptom_specificity(symptom: str) -> float:
    symptom = normalize_symptom(symptom)

    frequency = SYMPTOM_FREQUENCY.get(symptom, 1)
    total = max(len(KNOWLEDGE_BASE), 1)

    value = math.log((total + 1) / (frequency + 1)) + 1.0

    if symptom in GENERIC_SYMPTOMS:
        value *= 0.55

    return value


def weighted_match_strength(matches: set[str]) -> float:
    return sum(symptom_specificity(s) for s in matches)


def relevance_label(score: float) -> str:
    if score >= 0.72:
        return "strong"

    if score >= 0.46:
        return "moderate"

    return "weak"


def rank_diseases(
    symptoms: list[str],
    age=None,
    sex=None,
    duration=None,
    severity=None,
    limit: int = 5,
):
    """Rank diseases using Bayesian probability engine.

    This function now uses the probability_engine module to calculate
    proper posterior probabilities based on:
    - Prior disease prevalence
    - Conditional symptom probabilities
    - Age and sex demographic factors
    - Duration compatibility
    - Contradicting symptom handling

    Returns list of diseases with probability scores and metadata.
    """
    if not symptoms:
        return []

    # Use the probability engine for Bayesian inference
    prob_results = calculate_probabilities(
        symptoms=symptoms,
        age=age,
        sex=sex,
        duration=duration,
        severity=severity,
        limit=limit,
    )

    if not prob_results:
        return []

    # Build enriched results with knowledge base metadata
    results = []
    knowledge_lookup = {
        normalize_symptom(c["disease"]): c
        for c in KNOWLEDGE_BASE
    }

    for prob_data in prob_results:
        disease_name = prob_data["disease"]
        normalized_name = normalize_symptom(disease_name)

        # Get full condition data from knowledge base
        condition = knowledge_lookup.get(normalized_name, {})

        # Build result with both probability and metadata
        result = {
            "name": disease_name,
            # Bayesian probability (main score)
            "match_score": round(prob_data["probability"], 3),
            "probability": round(prob_data["probability"], 3),
            "probability_percent": prob_data["probability_percent"],
            "confidence": prob_data["confidence"],
            # Relevance label (backward compatible)
            "relevance_label": _probability_to_label(
                prob_data["probability"]
            ),
            # Symptom matches
            "matched_symptoms": prob_data["all_matches"],
            "core_symptoms_matched": prob_data["core_matches"],
            "supporting_symptoms_matched": prob_data[
                "supporting_matches"
            ],
            "distinctive_symptoms_matched": prob_data[
                "distinctive_matches"
            ],
            "contradicting_symptoms": prob_data[
                "contradiction_matches"
            ],
            "unexplained_symptoms": sorted(
                set(symptoms) - set(prob_data["all_matches"])
            ),
            # Knowledge base data
            "tests": condition.get("tests", []),
            "specialist": condition.get(
                "specialist", "General Physician"
            ),
            "self_care": condition.get("self_care", []),
            "medication_information": condition.get(
                "medication_information", []
            ),
            "category": condition.get("category", "general"),
            # Probability details (for debugging/transparency)
            "_probability_details": {
                "prior": round(prob_data["prior"], 6),
                "core_coverage": round(prob_data["core_coverage"], 3),
                "total_coverage": round(
                    prob_data["total_coverage"], 3
                ),
                "age_factor": round(prob_data["age_factor"], 3),
                "sex_factor": round(prob_data["sex_factor"], 3),
                "duration_factor": round(
                    prob_data["duration_factor"], 3
                ),
            },
        }

        results.append(result)

    # Ensure diversity across categories (max 3 per category)
    selected = []
    category_counts = Counter()

    for result in results:
        category = result.get("category", "general")

        # Allow more from same category if probability is very high
        max_per_category = (
            4 if result["probability"] >= 0.25 else 3
        )

        if category_counts[category] >= max_per_category:
            continue

        selected.append(result)
        category_counts[category] += 1

        if len(selected) >= limit:
            break

    return selected


def _probability_to_label(probability: float) -> str:
    """Convert probability to relevance label (backward compatible)."""
    if probability >= 0.25:
        return "strong"
    elif probability >= 0.10:
        return "moderate"
    else:
        return "weak"
