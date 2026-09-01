from __future__ import annotations

from typing import Any


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


def _clean_list(values) -> list[str]:
    if not values:
        return []

    result = []
    seen = set()

    for value in values:
        text = str(value).strip()
        if not text:
            continue

        key = text.casefold()

        if key not in seen:
            seen.add(key)
            result.append(text)

    return result


def _human_list(values: list[str]) -> str:
    values = _clean_list(values)

    if not values:
        return ""

    if len(values) == 1:
        return values[0]

    if len(values) == 2:
        return f"{values[0]} and {values[1]}"

    return ", ".join(values[:-1]) + f", and {values[-1]}"


def _build_condition_summary(condition: dict[str, Any]) -> str:
    name = condition.get("name", "This condition")
    matched = _clean_list(condition.get("matched_symptoms"))
    distinctive = _clean_list(
        condition.get("distinctive_symptoms_matched")
    )
    contradictions = _clean_list(
        condition.get("contradicting_symptoms")
    )
    unexplained = _clean_list(
        condition.get("unexplained_symptoms")
    )

    parts = []

    if matched:
        parts.append(
            f"{name} was included because the current presentation "
            f"shares features including {_human_list(matched[:5])}."
        )
    else:
        parts.append(
            f"{name} remains in the retrieved differential, although "
            "the current symptom evidence is limited."
        )

    if distinctive:
        parts.append(
            "More distinctive supporting features include "
            f"{_human_list(distinctive[:4])}."
        )

    if contradictions:
        parts.append(
            "Features that reduce support for this possibility include "
            f"{_human_list(contradictions[:4])}."
        )

    if unexplained:
        parts.append(
            "This possibility does not fully explain "
            f"{_human_list(unexplained[:4])}."
        )

    parts.append(
        "The relevance score reflects similarity to the reported "
        "features and is not the probability of having this disease."
    )

    return " ".join(parts)



def parse_duration_days(duration) -> float | None:
    if not duration:
        return None

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
            return (
                float(match.group(1))
                * multiplier
            )

    return None


def apply_temporal_compatibility(
    conditions,
    duration=None,
):
    conditions = [
        dict(condition)
        for condition in (conditions or [])
    ]

    days = parse_duration_days(duration)

    if days is None:
        return conditions

    for condition in conditions:
        profile = condition.get(
            "temporal_profile"
        )

        condition[
            "temporal_compatibility"
        ] = {
            "duration_days": round(days, 2),
            "profile_available": bool(
                isinstance(profile, dict)
            ),
            "adjusted": False,
        }

        if not isinstance(profile, dict):
            continue

        minimum = profile.get(
            "min_typical_days"
        )
        maximum = profile.get(
            "max_typical_days"
        )

        incompatible = False

        if (
            minimum is not None
            and days < float(minimum)
        ):
            incompatible = True

        if (
            maximum is not None
            and days > float(maximum)
        ):
            incompatible = True

        if not incompatible:
            continue

        original = float(
            condition.get(
                "match_score",
                0.0,
            )
        )

        adjusted = max(
            0.0,
            original - 0.10,
        )

        condition[
            "match_score"
        ] = round(adjusted, 3)

        condition[
            "temporal_compatibility"
        ]["adjusted"] = True

    conditions.sort(
        key=lambda item: (
            item.get(
                "match_score",
                0.0,
            ),
            len(
                item.get(
                    "distinctive_symptoms_matched",
                    [],
                )
            ),
            len(
                item.get(
                    "core_symptoms_matched",
                    [],
                )
            ),
        ),
        reverse=True,
    )

    return conditions


def build_detailed_conditions(
    conditions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    detailed = []

    for index, condition in enumerate(conditions):
        item = dict(condition)

        matched = _clean_list(
            condition.get("matched_symptoms")
        )
        core = _clean_list(
            condition.get("core_symptoms_matched")
        )
        supporting = _clean_list(
            condition.get("supporting_symptoms_matched")
        )
        distinctive = _clean_list(
            condition.get("distinctive_symptoms_matched")
        )
        contradictions = _clean_list(
            condition.get("contradicting_symptoms")
        )
        unexplained = _clean_list(
            condition.get("unexplained_symptoms")
        )

        why = []

        if core:
            why.append(
                "Core matching features: "
                + _human_list(core)
            )

        if supporting:
            why.append(
                "Supporting features: "
                + _human_list(supporting)
            )

        if distinctive:
            why.append(
                "Distinctive matching features: "
                + _human_list(distinctive)
            )

        if not why and matched:
            why.append(
                "Matching reported features: "
                + _human_list(matched)
            )

        item["rank"] = index + 1
        item["summary"] = _build_condition_summary(condition)
        item["why_considered"] = why
        item["supporting_evidence"] = matched
        item["evidence_against"] = contradictions
        item["unexplained_features"] = unexplained
        item["management_information"] = _clean_list(
            condition.get("self_care")
        )
        item["condition_specific_medication_information"] = (
            _clean_list(
                condition.get("medication_information")
            )
        )

        detailed.append(item)

    return detailed


def build_diagnostic_overview(
    *,
    symptoms,
    conditions,
    age=None,
    sex=None,
    duration=None,
    severity=None,
    emergency=False,
    red_flags=None,
) -> dict[str, Any]:
    symptoms = _clean_list(symptoms)
    conditions = conditions or []
    red_flags = _clean_list(red_flags)

    patient_bits = []

    if age is not None:
        patient_bits.append(f"age {age}")

    if sex and sex not in {"unknown", "other"}:
        patient_bits.append(str(sex))

    context = (
        ", ".join(patient_bits)
        if patient_bits
        else "demographics not fully specified"
    )

    if symptoms:
        presentation = (
            f"Reported features include {_human_list(symptoms)}"
        )
    else:
        presentation = (
            "No clear current symptoms were extracted"
        )

    if duration:
        presentation += f", with duration {duration}"

    if severity:
        presentation += f" and reported {severity} severity"

    presentation += "."

    if emergency:
        interpretation = (
            "The deterministic safety screen identified an emergency "
            "pattern. Immediate medical assessment takes priority over "
            "the ranked differential."
        )
    elif conditions:
        names = [
            c.get("name")
            for c in conditions[:3]
            if c.get("name")
        ]

        interpretation = (
            "The current presentation overlaps with multiple conditions"
        )

        if names:
            interpretation += (
                ", with the strongest retrieved matches including "
                + _human_list(names)
            )

        interpretation += (
            ". These are differential considerations rather than "
            "confirmed diagnoses."
        )
    else:
        interpretation = (
            "The current information is insufficient to produce a "
            "useful ranked differential."
        )

    generic_only = bool(symptoms) and all(
        symptom in GENERIC_SYMPTOMS
        for symptom in symptoms
    )

    low_information = (
        len(symptoms) <= 1
        and generic_only
        and not emergency
    )

    missing = []

    if age is None:
        missing.append("age")

    if not sex:
        missing.append("sex")

    if not duration:
        missing.append("symptom duration")

    if not severity:
        missing.append("severity")

    if low_information:
        missing.extend([
            "additional associated symptoms",
            "relevant exposures or recent illness history",
        ])

    return {
        "patient_context_summary": context,
        "presentation_summary": presentation,
        "interpretation": interpretation,
        "low_information": low_information,
        "important_missing_information": _clean_list(missing),
        "red_flags": red_flags,
    }


def build_medication_guidance(
    *,
    conditions,
    symptoms,
    age=None,
    sex=None,
    medical_history=None,
    medications=None,
    allergies=None,
    emergency=False,
) -> dict[str, Any]:
    conditions = conditions or []
    symptoms = _clean_list(symptoms)
    medical_history = _clean_list(medical_history)
    medications = _clean_list(medications)
    allergies = _clean_list(allergies)

    condition_information = []
    supportive = []

    for condition in conditions[:5]:
        name = condition.get("name", "Possible condition")

        for text in _clean_list(
            condition.get("medication_information")
        ):
            condition_information.append({
                "condition": name,
                "information": text,
            })

        for text in _clean_list(
            condition.get("self_care")
        ):
            supportive.append(text)

    supportive = _clean_list(supportive)

    missing = []

    if not allergies:
        missing.append("drug allergies")

    if not medications:
        missing.append("current medications")

    if not medical_history:
        missing.append("relevant medical history")

    if age is None:
        missing.append("age")

    missing.extend([
        "kidney function/status when relevant",
        "liver function/status when relevant",
    ])

    normalized_sex = (
        str(sex).strip().casefold()
        if sex
        else ""
    )

    if normalized_sex in {
        "",
        "female",
        "unknown",
        "other",
    }:
        missing.append(
            "pregnancy/breastfeeding status when relevant"
        )

    patient_specific_review = []

    if allergies:
        patient_specific_review.append({
            "type": "allergy_review",
            "factors": allergies,
            "message": (
                "Reported drug allergies must be checked before "
                "any medicine is selected."
            ),
        })

    if medications:
        patient_specific_review.append({
            "type": "current_medication_review",
            "factors": medications,
            "message": (
                "Current medicines should be reviewed for "
                "possible contraindications or interactions "
                "before another medicine is added."
            ),
        })

    if medical_history:
        patient_specific_review.append({
            "type": "medical_history_review",
            "factors": medical_history,
            "message": (
                "Relevant medical history may affect medication "
                "choice and monitoring requirements."
            ),
        })

    precautions = [
        (
            "Do not select disease-specific prescription treatment "
            "solely from the condition ranking."
        ),
        (
            "Medication suitability depends on contraindications, "
            "allergies, current medicines, medical history and the "
            "eventual clinical diagnosis."
        ),
        (
            "Antibiotics, steroids, prescription antivirals and other "
            "disease-specific prescription therapies require "
            "appropriate clinical assessment."
        ),
    ]

    if len(conditions) > 1:
        precautions.append(
            "Because multiple conditions remain possible, treatment "
            "appropriate for one differential may be inappropriate "
            "for another until the diagnosis is clarified."
        )

    if emergency:
        precautions.insert(
            0,
            "Emergency assessment takes priority over medication "
            "selection or self-treatment."
        )

    completeness = (
        "limited"
        if len(missing) >= 4
        else "partial"
        if missing
        else "higher"
    )

    return {
        "purpose": (
            "Educational medication and management guidance only; "
            "not an individualized prescription."
        ),
        "patient_factors_considered": {
            "age": age,
            "sex": sex,
            "symptoms": symptoms,
            "medical_history": medical_history,
            "current_medications": medications,
            "allergies": allergies,
        },
        "patient_specific_review": (
            patient_specific_review
        ),
        "condition_specific_information": (
            condition_information
        ),
        "supportive_management": supportive[:8],
        "cross_differential_precautions": precautions,
        "medication_safety_completeness": {
            "status": completeness,
            "missing_information": _clean_list(missing),
        },
        "prescription_boundary": (
            "MedDraftV44 does not automatically prescribe, select "
            "individualized doses, or instruct users to start or stop "
            "prescription medicines."
        ),
    }


def build_differential_summary(
    conditions: list[dict[str, Any]],
) -> dict[str, Any]:
    conditions = conditions or []

    strong = []
    moderate = []
    weak = []

    for condition in conditions:
        name = condition.get("name")
        if not name:
            continue

        label = condition.get("relevance_label", "weak")

        if label == "strong":
            strong.append(name)
        elif label == "moderate":
            moderate.append(name)
        else:
            weak.append(name)

    return {
        "strong_relevance": strong,
        "moderate_relevance": moderate,
        "weak_relevance": weak,
        "interpretation": (
            "Relevance groups summarize similarity to the reported "
            "features. They are not disease probabilities."
        ),
    }
