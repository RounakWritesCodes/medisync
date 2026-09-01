import re


TEST_ALIASES = {
    "cbc": "Complete Blood Count (CBC)",
    "complete blood count": "Complete Blood Count (CBC)",
    "complete blood count cbc": "Complete Blood Count (CBC)",
    "urinalysis": "Urinalysis",
    "urine analysis": "Urinalysis",
    "chest x ray": "Chest X-ray",
    "chest xray": "Chest X-ray",
    "ecg": "ECG",
    "ekg": "ECG",
    "electrocardiogram": "ECG"
}


def normalize_test_name(name: str) -> str:

    text = name.casefold().strip()

    text = re.sub(
        r"\bwhen clinically indicated\b",
        "",
        text
    )

    text = re.sub(
        r"\bif clinically indicated\b",
        "",
        text
    )

    text = re.sub(
        r"\bas clinically indicated\b",
        "",
        text
    )

    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    return text


def deduplicate_tests(tests: list[str]) -> list[str]:

    result = []
    seen = set()

    for test in tests:

        if not isinstance(test, str):
            continue

        test = test.strip()

        if not test:
            continue

        key = normalize_test_name(test)

        if not key:
            continue

        canonical = TEST_ALIASES.get(
            key,
            test
        )

        canonical_key = normalize_test_name(
            canonical
        )

        if canonical_key in seen:
            continue

        seen.add(canonical_key)
        result.append(canonical)

    return result


def determine_urgency(
    emergency: bool,
    symptoms: list[str]
) -> str:

    if emergency:
        return "emergency"

    symptom_set = set(symptoms)

    prompt_evaluation = {
        "eye pain",
        "light sensitivity",
        "blurred vision",
        "blood in stool",
        "black stool",
        "blood in urine"
    }

    if symptom_set.intersection(
        prompt_evaluation
    ):
        return "prompt"

    return "routine"
