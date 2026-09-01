from typing import Iterable


CRITICAL_SINGLE_RED_FLAGS = {
    "seizure",
    "fainting",
    "severe bleeding",
    "severe breathing difficulty",
    "throat swelling",
}


URGENT_RED_FLAGS = {
    "chest pain",
    "chest pressure",
    "shortness of breath",
    "confusion",
    "rapid breathing",
    "severe testicular pain",
    "severe eye pain",
}


CRITICAL_COMBINATIONS = [
    {
        "all_of": {
            "one sided weakness",
            "speech difficulty",
        },
        "reason": "stroke-like neurological symptoms",
    },
    {
        "all_of": {
            "chest pain",
            "shortness of breath",
        },
        "reason": "chest pain with breathing difficulty",
    },
    {
        "all_of": {
            "fainting",
            "confusion",
        },
        "reason": "loss of consciousness with confusion",
    },
    {
        "all_of": {
            "throat swelling",
            "shortness of breath",
        },
        "reason": "airway swelling with breathing difficulty",
    },
    {
        "all_of": {
            "hives",
            "shortness of breath",
        },
        "any_of": {
            "throat swelling",
            "facial swelling",
        },
        "reason": "severe allergic-reaction pattern affecting breathing",
    },
    {
        "all_of": {
            "shortness of breath",
            "pleuritic chest pain",
        },
        "reason": "sudden breathing difficulty with pleuritic chest pain",
    },
    {
        "all_of": {
            "shortness of breath",
            "coughing blood",
        },
        "reason": "breathing difficulty with coughing blood",
    },
    {
        "all_of": {
            "fever",
            "neck stiffness",
            "confusion",
        },
        "reason": "fever with neck stiffness and altered mental status",
    },
    {
        "all_of": {
            "fever",
            "severe headache",
        },
        "any_of": {
            "confusion",
            "neck stiffness",
            "seizure",
        },
        "reason": "severe febrile neurological symptoms",
    },
    {
        "all_of": {
            "very high body temperature",
            "confusion",
        },
        "reason": "very high body temperature with altered mental status",
    },
    {
        "all_of": {
            "dehydration",
            "deep rapid breathing",
        },
        "any_of": {
            "vomiting",
            "fruity breath",
            "confusion",
        },
        "reason": "dehydration with abnormal deep rapid breathing",
    },
    {
        "all_of": {
            "fruity breath",
            "deep rapid breathing",
        },
        "reason": "metabolic emergency pattern with fruity breath and deep breathing",
    },
    {
        "all_of": {
            "severe dehydration",
            "confusion",
        },
        "any_of": {
            "increased thirst",
            "frequent urination",
        },
        "reason": "severe dehydration with altered mental status",
    },
    {
        "all_of": {
            "severe eye pain",
            "blurred vision",
        },
        "any_of": {
            "nausea",
            "vomiting",
            "headache",
        },
        "reason": "severe eye pain with acute visual disturbance",
    },
    {
        "all_of": {
            "severe testicular pain",
            "testicular swelling",
        },
        "reason": "sudden severe testicular pain with swelling",
    },
    {
        "all_of": {
            "lower abdominal pain",
            "vaginal bleeding",
        },
        "any_of": {
            "fainting",
            "dizziness",
            "severe abdominal pain",
        },
        "reason": "abdominal pain with vaginal bleeding and instability symptoms",
    },
    {
        "all_of": {
            "very high blood pressure",
            "confusion",
        },
        "reason": "very high blood pressure with neurological symptoms",
    },
    {
        "all_of": {
            "very high blood pressure",
            "chest pain",
        },
        "reason": "very high blood pressure with chest pain",
    },
    {
        "all_of": {
            "chest pressure",
            "sweating",
        },
        "any_of": {
            "shortness of breath",
            "pain radiating to arm",
            "nausea",
        },
        "reason": "concerning acute coronary symptom pattern",
    },
    {
        "all_of": {
            "fever",
            "right upper abdominal pain",
            "jaundice",
        },
        "any_of": {
            "confusion",
            "low blood pressure",
        },
        "reason": "febrile jaundice with right upper abdominal pain",
    },
    {
        "all_of": {
            "jaundice",
            "confusion",
        },
        "reason": "jaundice with altered mental status",
    },
    {
        "all_of": {
            "progressive weakness",
            "shortness of breath",
        },
        "reason": "progressive weakness with breathing difficulty",
    },
    {
        "all_of": {
            "ascending weakness",
            "difficulty swallowing",
        },
        "reason": "ascending weakness with swallowing difficulty",
    },
    {
        "all_of": {
            "fever",
            "confusion",
        },
        "any_of": {
            "rapid breathing",
            "low blood pressure",
            "severe skin infection",
        },
        "reason": "infection-like symptoms with systemic instability",
    },
]


SAFETY_SYMPTOM_ALIASES = {
    "one-sided weakness": "one sided weakness",
    "one sided weakness": "one sided weakness",
    "difficulty speaking": "speech difficulty",
    "difficulty with speech": "speech difficulty",
    "trouble speaking": "speech difficulty",
    "loss of consciousness": "fainting",
    "passed out": "fainting",
    "passed out suddenly": "fainting",
    "altered mental status": "confusion",
    "altered consciousness": "confusion",
    "breathing difficulty": "shortness of breath",
    "difficulty breathing": "shortness of breath",
    "breathlessness": "shortness of breath",
    "severe difficulty breathing": "severe breathing difficulty",
    "struggling to breathe": "severe breathing difficulty",
    "pressure in chest": "chest pressure",
    "chest heaviness": "chest pressure",
    "radiating arm pain": "pain radiating to arm",
    "arm pain with chest pain": "pain radiating to arm",
    "swollen throat": "throat swelling",
    "throat is swelling": "throat swelling",
    "face swelling": "facial swelling",
    "facial swelling": "facial swelling",
    "intense eye pain": "severe eye pain",
    "sudden testicular pain": "severe testicular pain",
    "severe scrotal pain": "severe testicular pain",
    "scrotal swelling": "testicular swelling",
    "extremely high blood pressure": "very high blood pressure",
    "extremely high temperature": "very high body temperature",
    "very high temperature": "very high body temperature",
    "right upper quadrant pain": "right upper abdominal pain",
    "ruq pain": "right upper abdominal pain",
    "kussmaul breathing": "deep rapid breathing",
    "deep breathing": "deep rapid breathing",
    "heavy bleeding": "severe bleeding",
}


def normalize_safety_symptom(symptom: str) -> str:
    normalized = " ".join(
        str(symptom).strip().lower().split()
    )

    return SAFETY_SYMPTOM_ALIASES.get(
        normalized,
        normalized,
    )


def combination_matches(
    symptom_set: set[str],
    rule: dict,
) -> bool:

    required = rule.get(
        "all_of",
        rule.get("symptoms", set()),
    )

    required = set(required)

    if not required.issubset(symptom_set):
        return False

    any_of = set(
        rule.get("any_of", set())
    )

    if any_of and not (
        any_of & symptom_set
    ):
        return False

    return True


def check_emergency(
    symptoms: Iterable[str]
):

    symptom_set = {
        normalize_safety_symptom(symptom)
        for symptom in symptoms
        if symptom
    }

    detected = set()
    reasons = []

    for symptom in CRITICAL_SINGLE_RED_FLAGS:

        if symptom in symptom_set:

            detected.add(symptom)

            reasons.append(
                f"critical symptom: {symptom}"
            )

    for rule in CRITICAL_COMBINATIONS:

        if not combination_matches(
            symptom_set,
            rule,
        ):
            continue

        required = set(
            rule.get(
                "all_of",
                rule.get(
                    "symptoms",
                    set(),
                ),
            )
        )

        any_of = set(
            rule.get(
                "any_of",
                set(),
            )
        )

        detected.update(
            required
        )

        detected.update(
            any_of & symptom_set
        )

        reasons.append(
            rule["reason"]
        )

    for symptom in URGENT_RED_FLAGS:

        if symptom in symptom_set:

            detected.add(symptom)

            reasons.append(
                f"urgent symptom: {symptom}"
            )

    reasons = list(
        dict.fromkeys(reasons)
    )

    return {
        "emergency": bool(detected),
        "red_flags": sorted(detected),
        "reasons": reasons,
    }
