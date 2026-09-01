import json
import math
from collections import Counter
from pathlib import Path


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
    if not symptoms:
        return []

    user = {
        normalize_symptom(s)
        for s in symptoms
        if str(s).strip()
    }

    if not user:
        return []

    results = []

    for condition in KNOWLEDGE_BASE:
        core = {
            normalize_symptom(s)
            for s in condition.get("core_symptoms", [])
        }

        supporting = {
            normalize_symptom(s)
            for s in condition.get("supporting_symptoms", [])
        }

        distinctive = {
            normalize_symptom(s)
            for s in condition.get("distinctive_symptoms", [])
        }

        contradicting = {
            normalize_symptom(s)
            for s in condition.get("contradicting_symptoms", [])
        }

        required_any_of = condition.get("required_any_of", [])

        core_matches = matched_symptoms(user, core)
        supporting_matches = matched_symptoms(user, supporting)
        distinctive_matches = matched_symptoms(user, distinctive)
        contradiction_matches = matched_symptoms(user, contradicting)

        all_matches = (
            core_matches
            | supporting_matches
            | distinctive_matches
        )

        if not all_matches:
            continue

        if len(user) >= 3 and len(all_matches) == 1:
            only_match = next(iter(all_matches))

            if only_match in GENERIC_SYMPTOMS:
                continue

        required_group_passed = True

        if required_any_of:
            required_group_passed = False

            for group in required_any_of:
                if not isinstance(group, list):
                    continue

                group_set = {
                    normalize_symptom(s)
                    for s in group
                }

                if matched_symptoms(user, group_set):
                    required_group_passed = True
                    break

        if not required_group_passed:
            continue

        core_coverage = (
            len(core_matches)
            / max(len(core), 1)
        )

        support_coverage = (
            len(supporting_matches)
            / max(len(supporting), 1)
        )

        user_coverage = (
            len(all_matches)
            / max(len(user), 1)
        )

        specificity_total = weighted_match_strength(all_matches)

        maximum_specificity = sum(
            sorted(
                (
                    symptom_specificity(s)
                    for s in user
                ),
                reverse=True,
            )[:max(len(all_matches), 1)]
        )

        specificity_score = (
            specificity_total
            / max(maximum_specificity, 0.001)
        )

        specificity_score = min(
            specificity_score,
            1.0,
        )

        score = (
            0.38 * core_coverage
            + 0.25 * user_coverage
            + 0.12 * support_coverage
            + 0.25 * specificity_score
        )

        if distinctive_matches:
            score += min(
                0.16,
                0.08 * len(distinctive_matches),
            )

        score -= min(
            0.45,
            0.22 * len(contradiction_matches),
        )

        if all(
            symptom in GENERIC_SYMPTOMS
            for symptom in all_matches
        ):
            score -= 0.10

        if len(all_matches) >= 4:
            score += 0.08
        elif len(all_matches) >= 3:
            score += 0.05
        elif len(all_matches) >= 2:
            score += 0.02

        unexplained = user - all_matches

        if len(user) >= 4:
            unexplained_ratio = len(unexplained) / len(user)

            if unexplained_ratio >= 0.75:
                score -= 0.15
            elif unexplained_ratio >= 0.50:
                score -= 0.07

        score = max(
            0.0,
            min(score, 1.0),
        )

        if score < 0.25:
            continue

        results.append(
            {
                "name": condition["disease"],
                "match_score": round(score, 3),
                "relevance_label": relevance_label(score),
                "matched_symptoms": sorted(all_matches),
                "core_symptoms_matched": sorted(core_matches),
                "supporting_symptoms_matched": sorted(
                    supporting_matches
                ),
                "distinctive_symptoms_matched": sorted(
                    distinctive_matches
                ),
                "contradicting_symptoms": sorted(
                    contradiction_matches
                ),
                "unexplained_symptoms": sorted(unexplained),
                "tests": condition.get("tests", []),
                "specialist": condition.get(
                    "specialist",
                    "General Physician",
                ),
                "self_care": condition.get(
                    "self_care",
                    [],
                ),
                "medication_information": condition.get(
                    "medication_information",
                    [],
                ),
                "category": condition.get(
                    "category",
                    "general",
                ),
            }
        )

    results.sort(
        key=lambda item: (
            item["match_score"],
            len(item["distinctive_symptoms_matched"]),
            len(item["core_symptoms_matched"]),
            len(item["matched_symptoms"]),
        ),
        reverse=True,
    )

    selected = []
    category_counts = Counter()

    for result in results:
        category = result.get("category", "general")

        if (
            category_counts[category] >= 3
            and result["match_score"] < 0.72
        ):
            continue

        selected.append(result)
        category_counts[category] += 1

        if len(selected) >= limit:
            break

    return selected
