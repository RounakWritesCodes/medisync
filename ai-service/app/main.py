from __future__ import annotations

import os
import tempfile
import subprocess
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.symptom_extractor import extract_symptoms
from app.patient_parser import extract_patient_info
from app.disease_ranker import rank_diseases
from app.safety import check_emergency
from app.response_utils import deduplicate_tests, determine_urgency
from app.clinical_summary import build_clinical_summary
from app.diagnostic_intelligence import (
    build_detailed_conditions,
    build_diagnostic_overview,
    build_medication_guidance,
    build_differential_summary,
)


app = FastAPI(
    title="MediSync AI Service",
    description="Local medical AI diagnosis engine (no external API keys needed)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DiagnosisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    sex: Optional[str] = None
    symptoms: list[str] = Field(default_factory=list)
    existing_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    symptom_duration: Optional[str] = None
    severity: str = "mild"


# Global model cache — defined before functions that use them
_whisper_model = None
_whisper_model_name: str = ""


@app.on_event("startup")
def _preload_whisper():
    """Download and cache the Whisper model at startup so the first request
    doesn't have to wait for a ~74MB download."""
    global _whisper_model, _whisper_model_name
    model_size = os.environ.get("WHISPER_MODEL", "base")
    try:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
            num_workers=min(os.cpu_count() or 2, 4),
        )
        _whisper_model_name = model_size
        print(f"[startup] Whisper model '{model_size}' preloaded successfully")
    except Exception as e:
        print(f"[startup] Whisper preloading failed (will retry on first request): {e}")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "MediSync AI Service",
        "version": "1.0.0",
        "engine": "deterministic_symptom_ranking",
    }


@app.post("/api/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...)):
    """Convert audio to text using Whisper, then extract symptoms.

    Improvements over basic Whisper:
    - ffmpeg preprocessing: normalize volume, convert to 16kHz mono WAV
    - base model instead of tiny (~2x more accurate)
    - beam_size=5 for better search
    - Medical initial prompt to prime the model for healthcare vocabulary
    - Post-processing: correct common medical term mishearings
    """
    # Validate file type
    allowed_types = [
        "audio/webm", "audio/wav", "audio/mpeg", "audio/mp3",
        "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/flac",
    ]
    content_type = audio.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {content_type}. "
                   f"Supported: {', '.join(allowed_types)}",
        )

    # Determine file extension from content type
    ext_map = {
        "audio/webm": ".webm", "audio/wav": ".wav", "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3", "audio/ogg": ".ogg", "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a", "audio/flac": ".flac",
    }
    ext = ext_map.get(content_type, ".webm")

    # Save uploaded audio to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    preprocessed_path = None
    try:
        # Step 1: Preprocess audio with ffmpeg (normalize + convert to 16kHz mono WAV)
        preprocessed_path = _preprocess_audio(tmp_path)

        # Step 2: Transcribe with Whisper (enhanced settings)
        text = _transcribe_with_whisper(preprocessed_path)

        # Step 3: Post-process — fix common medical term mishearings
        text = _fix_medical_terms(text)
    except Exception as e:
        # Fallback: try Google Speech Recognition (good accuracy, free)
        try:
            text = _transcribe_with_speech_recognition(tmp_path)
            text = _fix_medical_terms(text)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail=f"Speech recognition failed: {str(e)}",
            )
    finally:
        os.unlink(tmp_path)
        if preprocessed_path and os.path.exists(preprocessed_path):
            os.unlink(preprocessed_path)

    # Extract symptoms from transcribed text
    symptoms = extract_symptoms(text)

    return {
        "text": text,
        "symptoms": symptoms,
    }


def _preprocess_audio(input_path: str) -> str:
    """Use ffmpeg to convert audio to 16kHz mono WAV for Whisper.

    Stripped the expensive loudnorm two-pass filter — Whisper handles
    volume variations well on its own. Only does fast format conversion.
    """
    output_path = input_path + "_preprocessed.wav"
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", input_path,
                # Fast: just convert to 16kHz mono WAV (Whisper native format)
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                output_path,
            ],
            capture_output=True,
            timeout=10,
        )
        if result.returncode == 0 and os.path.exists(output_path):
            return output_path
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return input_path


def _transcribe_with_whisper(audio_path: str) -> str:
    """Transcribe audio using faster-whisper with speed-optimized settings.

    Optimizations:
    - beam_size=3 (down from 5) — still good accuracy, ~40% faster
    - best_of=1 — beam search already finds the best path
    - Single temperature — no multi-pass retry
    - Shorter medical prompt — enough context without bloating
    - VAD filter — removes silence to skip processing empty audio
    """
    try:
        from faster_whisper import WhisperModel

        model_size = os.environ.get("WHISPER_MODEL", "base")

        # Cache model in memory to avoid reloading on every request
        global _whisper_model, _whisper_model_name
        if _whisper_model is None or _whisper_model_name != model_size:
            _whisper_model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
                num_workers=min(os.cpu_count() or 2, 4),
            )
            _whisper_model_name = model_size

        # Short medical context prompt — primes vocabulary without bloat
        medical_prompt = (
            "Patient has headache, fever, cough, chest pain, "
            "nausea, vomiting, dizziness, fatigue, abdominal pain, "
            "sore throat, runny nose, diarrhea, rash, swelling."
        )

        segments, info = _whisper_model.transcribe(
            audio_path,
            beam_size=3,
            language="en",
            initial_prompt=medical_prompt,
            best_of=1,
            temperature=0.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=300,
                speech_pad_ms=150,
                threshold=0.4,
            ),
        )

        text = " ".join(seg.text.strip() for seg in segments).strip()
        if text:
            return text
    except ImportError:
        pass
    raise RuntimeError("faster-whisper not available")


def _transcribe_with_speech_recognition(audio_path: str) -> str:
    """Transcribe audio using speech_recognition + Google free API."""
    import speech_recognition as sr

    recognizer = sr.Recognizer()
    recognizer.energy_threshold = 300
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold = 0.8

    with sr.AudioFile(audio_path) as source:
        audio_data = recognizer.record(source)
    text = recognizer.recognize_google(audio_data, language="en-US")
    return text


# --- Medical Terms Post-Processing ---
# Common Whisper mishearings for medical vocabulary.
# Whisper often confuses these because it has limited medical training data.
MEDICAL_TERM_CORRECTIONS = {
    # Respiratory
    "head ache": "headache",
    "head akh": "headache",
    "head rec": "headache",
    "headag": "headache",
    "sore throte": "sore throat",
    "shortness of breadth": "shortness of breath",
    "shortness of breath": "shortness of breath",
    "short of breath": "shortness of breath",
    "can't breathe": "difficulty breathing",
    "difficulty breathing": "difficulty breathing",
    "chest pain": "chest pain",
    "chest pan": "chest pain",
    "chest pin": "chest pain",
    "runny knows": "runny nose",
    "runny noes": "runny nose",
    "sneezing": "sneezing",
    "congestion": "congestion",

    # Gastrointestinal
    "nasaus": "nausea",
    "naushiya": "nausea",
    "nauceous": "nausea",
    "nomit": "vomiting",
    "vomitting": "vomiting",
    "vommiting": "vomiting",
    "derea": "diarrhea",
    "diarea": "diarrhea",
    "diareah": "diarrhea",
    "diareea": "diarrhea",
    "diarrea": "diarrhea",
    "diarreea": "diarrhea",
    "stomack ache": "stomach ache",
    "stomach pain": "abdominal pain",
    "stomack pain": "stomach ache",
    "belly ache": "abdominal pain",
    "belly pain": "abdominal pain",
    "abdominal pan": "abdominal pain",
    "blooting": "bloating",
    "bloating": "bloating",

    # Pain/Body
    "myalgia": "muscle pain",
    "body ach": "body ache",
    "body ache": "body ache",
    "back pan": "back pain",
    "back pin": "back pain",
    "joint pan": "joint pain",
    "joint pin": "joint pain",
    "muskel": "muscle",
    "mussel": "muscle",

    # Systemic
    "fever": "fever",
    "temperature": "fever",
    "chills": "chills",
    "fatigue": "fatigue",
    "fatique": "fatigue",
    "fatique": "fatigue",
    "weakness": "weakness",
    "weaknes": "weakness",
    "dizzines": "dizziness",
    "dizzyness": "dizziness",
    "dizzie": "dizziness",
    "headspinn": "dizziness",
    "lightheaded": "dizziness",

    # Neurological
    "migrain": "migraine",
    "migrane": "migraine",
    "numbnes": "numbness",
    "tingling": "tingling",
    "tingling": "numbness",

    # Skin
    "rach": "rash",
    "rash": "rash",
    "itching": "itching",
    "itchy": "itching",

    # Chronic conditions
    "diabeties": "diabetes",
    "diabetis": "diabetes",
    "diabetus": "diabetes",
    "hypertension": "hypertension",
    "high blood pressure": "hypertension",
    "hypy tension": "hypertension",
    "asthma": "asthma",
    "asthma": "asthma",
    "asmath": "asthma",
    "pneumonia": "pneumonia",
    "new monia": "pneumonia",
    "bronchitis": "bronchitis",
    "brohnchitis": "bronchitis",

    # Other
    "allergies": "allergies",
    "allerjies": "allergies",
    "inflamation": "inflammation",
    "swellin": "swelling",
    "swellen": "swelling",
    "appetight": "appetite",
    "appetight": "appetite",
    "insomnya": "insomnia",
    "inomnia": "insomnia",
    "can not sleep": "insomnia",
    "cant sleep": "insomnia",
    "blurred vision": "blurred vision",
    "blurry vision": "blurred vision",
    "night swets": "night sweats",
    "night sweet": "night sweats",
}


def _fix_medical_terms(text: str) -> str:
    """Fix common Whisper mishearings of medical terms.

    Uses fuzzy matching with edit distance to catch near-misses,
    not just exact string matches.
    """
    if not text:
        return text

    words = text.split()
    fixed_words = []
    i = 0

    while i < len(words):
        matched = False

        # Try matching 3-word phrases first, then 2-word, then 1-word
        for phrase_len in [3, 2, 1]:
            if i + phrase_len > len(words):
                continue
            phrase = " ".join(words[i:i + phrase_len]).lower().strip(".,!?;:")

            if phrase in MEDICAL_TERM_CORRECTIONS:
                correction = MEDICAL_TERM_CORRECTIONS[phrase]
                # Preserve capitalization of first word
                if words[i][0:1].isupper():
                    correction = correction.capitalize()
                fixed_words.append(correction)
                i += phrase_len
                matched = True
                break

            # Fuzzy match: check if any correction is very close
            for misheard, correct in MEDICAL_TERM_CORRECTIONS.items():
                if _edit_distance(phrase, misheard) <= max(1, len(misheard) // 4):
                    correction = correct
                    if words[i][0:1].isupper():
                        correction = correction.capitalize()
                    fixed_words.append(correction)
                    i += phrase_len
                    matched = True
                    break

            if matched:
                break

        if not matched:
            fixed_words.append(words[i])
            i += 1

    return " ".join(fixed_words)


def _edit_distance(s1: str, s2: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return _edit_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row

    return prev_row[-1]


class SymptomExtractRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


@app.post("/api/extract-symptoms")
def extract_symptoms_from_text(request: SymptomExtractRequest):
    """Extract symptoms from free-form text."""
    symptoms = extract_symptoms(request.text)
    return {"text": request.text, "symptoms": symptoms}


@app.post("/api/diagnose")
def diagnose(request: DiagnosisRequest):
    # Use provided symptoms or extract from text
    if request.symptoms:
        symptoms = [s.strip() for s in request.symptoms if s.strip()]
    else:
        symptoms = extract_symptoms(request.text)

    # Extract patient info from text if not provided
    if request.age is None or request.sex is None:
        patient = extract_patient_info(request.text)
        age = request.age if request.age is not None else patient.get("age")
        sex = request.sex if request.sex else patient.get("sex")
        duration = request.symptom_duration or (
            patient.get("duration", {}).get("description")
            if isinstance(patient.get("duration"), dict)
            else None
        )
    else:
        age = request.age
        sex = request.sex
        duration = request.symptom_duration

    # Safety check
    safety = check_emergency(symptoms)
    urgency = determine_urgency(
        emergency=safety["emergency"],
        symptoms=symptoms,
    )

    # Rank diseases
    conditions = rank_diseases(
        symptoms=symptoms,
        age=age,
        sex=sex,
        duration=duration,
        severity=request.severity,
    )

    # Collect tests
    tests = []
    for condition in conditions[:3]:
        tests.extend(condition.get("tests", []))
    tests = deduplicate_tests(tests)

    # Build clinical summary
    clinical_summary = build_clinical_summary(
        symptoms=symptoms,
        conditions=conditions,
        age=age,
        sex=sex,
        duration=duration,
        severity=request.severity,
        emergency=safety["emergency"],
        red_flags=safety["red_flags"],
    )

    # Build detailed conditions
    detailed_conditions = build_detailed_conditions(conditions)

    # Build diagnostic overview
    diagnostic_overview = build_diagnostic_overview(
        symptoms=symptoms,
        conditions=conditions,
        age=age,
        sex=sex,
        duration=duration,
        severity=request.severity,
        emergency=safety["emergency"],
        red_flags=safety["red_flags"],
    )

    # Build differential summary
    differential_summary = build_differential_summary(conditions)

    # Build medication guidance
    medication_guidance = build_medication_guidance(
        conditions=conditions,
        symptoms=symptoms,
        age=age,
        sex=sex,
        medical_history=request.existing_conditions,
        medications=request.current_medications,
        allergies=request.allergies,
        emergency=safety["emergency"],
    )

    response = {
        "symptoms": symptoms,
        "extraction_source": "deterministic_symptom_ranking",
        "possible_conditions": detailed_conditions,
        "clinical_summary": clinical_summary,
        "diagnostic_overview": diagnostic_overview,
        "differential_summary": differential_summary,
        "medication_guidance": medication_guidance,
        "tests_to_discuss": tests,
        "urgency": urgency,
        "emergency": safety["emergency"],
        "red_flags": safety["red_flags"],
        "safety_reasons": safety.get("reasons", []),
        "disclaimer": (
            "This system provides informational "
            "decision support and is not a "
            "medical diagnosis."
        ),
    }

    if safety["emergency"]:
        response["urgent_message"] = (
            "Potentially serious symptoms were detected. "
            "Seek urgent medical evaluation immediately."
        )
        response["emergency_guidance"] = {
            "priority": "immediate",
            "action": (
                "Seek emergency medical care or contact "
                "local emergency services."
            ),
            "do_not_delay_for_app_results": True,
        }
        response["condition_results_are_secondary"] = True

    return response
