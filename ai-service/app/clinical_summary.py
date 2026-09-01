def _human_list(values):
    values = [
        str(v).strip()
        for v in values
        if str(v).strip()
    ]

    if not values:
        return ""

    if len(values) == 1:
        return values[0]

    if len(values) == 2:
        return f"{values[0]} and {values[1]}"

    return (
        ", ".join(values[:-1])
        + f", and {values[-1]}"
    )


def build_clinical_summary(
    *,
    symptoms,
    conditions,
    age=None,
    sex=None,
    duration=None,
    severity=None,
    emergency=False,
    red_flags=None,
):
    symptoms = symptoms or []
    conditions = conditions or []
    red_flags = red_flags or []

    parts = []

    demographics = []

    if age:
        demographics.append(
            f"{age}-year-old"
        )

    if sex and sex not in {
        "unknown",
        "other",
    }:
        demographics.append(
            str(sex)
        )

    if demographics:
        opening = " ".join(
            demographics
        )
    else:
        opening = "Patient"

    if symptoms:
        opening += (
            " reporting "
            + _human_list(symptoms)
        )
    else:
        opening += (
            " with no clearly extracted "
            "symptoms"
        )

    if duration:
        opening += (
            f" with reported duration "
            f"of {duration}"
        )

    if severity:
        opening += (
            f" and {severity} severity"
        )

    parts.append(
        opening + "."
    )

    if emergency:

        if red_flags:
            parts.append(
                "Potentially serious warning "
                "features were detected: "
                + _human_list(red_flags)
                + "."
            )
        else:
            parts.append(
                "The presentation triggered "
                "the emergency safety pathway."
            )

        parts.append(
            "Urgent medical assessment takes "
            "priority over condition-ranking "
            "results."
        )

    else:
        parts.append(
            "No emergency red-flag pattern "
            "was identified by the current "
            "rule-based safety screen."
        )

    if conditions:

        top = conditions[0]

        top_name = top.get(
            "name",
            "the highest-ranked condition",
        )

        top_label = top.get(
            "relevance_label",
            "ranked",
        )

        top_matches = top.get(
            "matched_symptoms",
            [],
        )

        sentence = (
            f"The highest-ranked current "
            f"differential is {top_name} "
            f"with {top_label} symptom relevance"
        )

        if top_matches:
            sentence += (
                ", supported by "
                + _human_list(
                    top_matches[:5]
                )
            )

        sentence += "."

        parts.append(sentence)

        if len(conditions) > 1:

            alternatives = [
                item.get("name")
                for item in conditions[1:4]
                if item.get("name")
            ]

            if alternatives:
                parts.append(
                    "Other possibilities in "
                    "the current differential "
                    "include "
                    + _human_list(alternatives)
                    + "."
                )

        parts.append(
            "These rankings represent symptom "
            "relevance, not diagnostic "
            "probabilities or confirmed diagnoses."
        )

    else:

        parts.append(
            "The current knowledge base did "
            "not identify a condition above "
            "the ranking threshold for the "
            "extracted symptom pattern."
        )

    return " ".join(parts)
