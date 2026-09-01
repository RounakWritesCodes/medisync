import re


NEGATION_WORDS = [
    "no",
    "not",
    "never",
    "without",
    "nahi",
    "nahin",
    "nhi",
    "नहीं"
]



SEVERITY_MAP = {
    "mild": [
        "mild",
        "slight",
        "little",
        "thoda",
        "thodi"
    ],

    "moderate": [
        "moderate",
        "medium"
    ],

    "severe": [
        "severe",
        "very bad",
        "extreme",
        "bahut",
        "bohot",
        "tez",
        "ज्यादा",
        "बहुत"
    ]
}


def extract_age(text: str):
    patterns = [
        r"\bage\s*(?:is|:)?\s*(\d{1,3})\b",
        r"\bi am\s+(\d{1,3})\s*(?:years?|yrs?)?\b",
        r"\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b",
        r"\bmeri age\s*(?:hai|:)?\s*(\d{1,3})\b",
        r"\bumar\s*(?:hai|:)?\s*(\d{1,3})\b"
    ]

    lower = text.lower()

    for pattern in patterns:
        match = re.search(pattern, lower)

        if match:
            age = int(match.group(1))

            if 0 < age < 120:
                return age

    return None


def extract_sex(text: str):
    lower = text.lower()

    male_terms = [
        "male",
        "man",
        "boy",
        "ladka",
        "mard"
    ]

    female_terms = [
        "female",
        "woman",
        "girl",
        "ladki",
        "aurat"
    ]

    for term in male_terms:
        if re.search(rf"\b{re.escape(term)}\b", lower):
            return "male"

    for term in female_terms:
        if re.search(rf"\b{re.escape(term)}\b", lower):
            return "female"

    return None


def extract_duration(text: str):
    lower = text.casefold()

    relative_patterns = [
        (
            r"\b(?:since\s+today|aaj se)\b",
            {
                "value": 0,
                "unit": "days",
                "description": "since today"
            }
        ),
        (
            r"\b(?:since\s+yesterday|kal se)\b",
            {
                "value": 1,
                "unit": "days",
                "description": "since yesterday"
            }
        ),
        (
            r"\b(?:parso se)\b",
            {
                "value": 2,
                "unit": "days",
                "description": "since day before yesterday"
            }
        ),
    ]

    for pattern, result in relative_patterns:
        if re.search(pattern, lower):
            return result.copy()

    patterns = [
        (
            r"\b(\d+)\s*(?:day|days|din)(?:\s+se)?\b",
            "days"
        ),
        (
            r"\b(\d+)\s*(?:week|weeks|hafte|hafta)(?:\s+se)?\b",
            "weeks"
        ),
        (
            r"\b(\d+)\s*(?:month|months|mahine|mahina)(?:\s+se)?\b",
            "months"
        ),
        (
            r"\b(\d+)\s*(?:hour|hours|ghante|ghanta)(?:\s+se)?\b",
            "hours"
        )
    ]

    for pattern, unit in patterns:
        match = re.search(pattern, lower)

        if match:
            return {
                "value": int(match.group(1)),
                "unit": unit
            }

    return None

def extract_severity(text: str):
    lower = text.lower()

    for severity, terms in SEVERITY_MAP.items():

        for term in terms:
            if term in lower:
                return severity

    return None


def is_negated(text: str, phrase: str) -> bool:
    lower = text.casefold()
    phrase = phrase.casefold().strip()

    if not phrase:
        return False

    match = re.search(
        rf"(?<!\w){re.escape(phrase)}(?!\w)",
        lower
    )

    if not match:
        return False

    start = match.start()
    end = match.end()

    before = lower[max(0, start - 100):start]
    after = lower[end:end + 100]

    before_clause = re.split(
        r"\b(?:but|however|although|lekin|magar|just)\b",
        before
    )[-1]

    after_clause = re.split(
        r"\b(?:but|however|although|lekin|magar)\b",
        after
    )[0]

    before_words = re.findall(
        r"\b[\w']+\b",
        before_clause,
        flags=re.UNICODE
    )

    recent = before_words[-10:]

    direct_negators = {
        "no",
        "not",
        "never",
        "without",
        "nahi",
        "nahin",
        "nhi",
        "नहीं"
    }

    if any(
        word in direct_negators
        for word in recent
    ):
        return True

    negative_phrases = [
        "don't have",
        "dont have",
        "do not have",
        "doesn't have",
        "does not have",
        "didn't have",
        "did not have"
    ]

    if any(
        item in before_clause
        for item in negative_phrases
    ):
        return True

    hindi_after = after_clause.lstrip()

    if re.match(
        r"^(?:नहीं|नही|नहिं)(?:\s|$)",
        hindi_after
    ):
        return True

    after_words = re.findall(
        r"\b[\w']+\b",
        after_clause,
        flags=re.UNICODE
    )

    if any(
        word in {"nahi", "nahin", "nhi"}
        for word in after_words[:4]
    ):
        return True

    resolved_patterns = [
        r"\bdon't have it now\b",
        r"\bdo not have it now\b",
        r"\bnot anymore\b",
        r"\bno longer\b",
        r"\bwent away\b",
        r"\bhas gone away\b",
        r"\bresolved\b"
    ]

    if any(
        re.search(pattern, after_clause)
        for pattern in resolved_patterns
    ):
        return True

    historical_before = [
        r"\bi had\s*$",
        r"\bpreviously had\s*$",
        r"\bused to have\s*$"
    ]

    historical_after = [
        r"^\s*yesterday\b",
        r"^\s*last week\b",
        r"^\s*last month\b"
    ]

    past_before = any(
        re.search(pattern, before_clause)
        for pattern in historical_before
    )

    past_after = any(
        re.search(pattern, after)
        for pattern in historical_after
    )

    resolved_after = any(
        re.search(pattern, after)
        for pattern in resolved_patterns
    )

    if past_before and (past_after or resolved_after):
        return True

    hypothetical_patterns = [
        r"\bmight get\s*$",
        r"\bmay get\s*$",
        r"\bcould get\s*$",
        r"\bworried.*might get\s*$",
        r"\bworried.*may get\s*$",
        r"\bafraid.*might get\s*$",
        r"\bafraid.*may get\s*$"
    ]

    if any(
        re.search(pattern, before_clause)
        for pattern in hypothetical_patterns
    ):
        return True

    return False

def extract_patient_info(text: str):
    return {
        "age": extract_age(text),
        "sex": extract_sex(text),
        "duration": extract_duration(text),
        "severity": extract_severity(text)
    }
