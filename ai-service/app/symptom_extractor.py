import json
import re
from pathlib import Path

from app.patient_parser import is_negated


ROOT = Path(__file__).resolve().parents[1]

ALIASES_PATH = (
    ROOT
    / "datasets"
    / "symptom_aliases.json"
)


def normalize(text: str) -> str:
    if not text:
        return ""

    import unicodedata

    text = unicodedata.normalize("NFKC", text).casefold()

    cleaned = []

    for char in text:
        category = unicodedata.category(char)

        if (
            char.isspace()
            or char in {"'", "'"}
            or category[0] in {"L", "N", "M"}
        ):
            cleaned.append("'" if char == "'" else char)
        else:
            cleaned.append(" ")

    text = "".join(cleaned)

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def load_aliases():
    with open(
        ALIASES_PATH,
        "r",
        encoding="utf-8-sig"
    ) as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError(
            "symptom_aliases.json must contain an object"
        )

    cleaned = {}

    for canonical, aliases in data.items():

        canonical = normalize(canonical)

        if not canonical:
            continue

        if not isinstance(aliases, list):
            raise ValueError(
                f"{canonical}: aliases must be a list"
            )

        cleaned_aliases = []

        for alias in aliases:

            if not isinstance(alias, str):
                raise ValueError(
                    f"{canonical}: alias must be string"
                )

            alias = normalize(alias)

            if (
                alias
                and alias not in cleaned_aliases
            ):
                cleaned_aliases.append(alias)

        if canonical not in cleaned_aliases:
            cleaned_aliases.append(canonical)

        cleaned[canonical] = cleaned_aliases

    return cleaned


SYMPTOM_ALIASES = load_aliases()


def find_phrase(
    alias: str,
    text: str
):
    alias = normalize(alias)

    if not alias:
        return None

    pattern = (
        rf"(?<!\w)"
        rf"{re.escape(alias)}"
        rf"(?!\w)"
    )

    return re.search(
        pattern,
        text,
        flags=re.UNICODE
    )


def extract_symptoms(
    text: str
) -> list[str]:

    normalized_text = normalize(text)

    if not normalized_text:
        return []

    candidates = []

    for canonical, aliases in SYMPTOM_ALIASES.items():

        for alias in aliases:

            match = find_phrase(
                alias,
                normalized_text
            )

            if match is None:
                continue

            if is_negated(
                normalized_text,
                alias
            ):
                continue

            candidates.append(
                {
                    "canonical": canonical,
                    "alias": alias,
                    "start": match.start(),
                    "end": match.end(),
                    "length": match.end() - match.start()
                }
            )

    candidates.sort(
        key=lambda item: (
            -item["length"],
            item["start"]
        )
    )

    accepted = []

    occupied_ranges = []

    for candidate in candidates:

        start = candidate["start"]
        end = candidate["end"]

        overlaps = False

        for used_start, used_end in occupied_ranges:

            if (
                start < used_end
                and end > used_start
            ):
                overlaps = True
                break

        if overlaps:
            continue

        accepted.append(candidate)

        occupied_ranges.append(
            (start, end)
        )

    accepted.sort(
        key=lambda item: item["start"]
    )

    result = []

    for item in accepted:

        canonical = item["canonical"]

        if canonical not in result:
            result.append(canonical)

    return result
