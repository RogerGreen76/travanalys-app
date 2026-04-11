from fastapi import FastAPI, APIRouter, Query, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import requests as http_requests
import httpx
import json
import re
import asyncio
from urllib.parse import unquote
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timedelta, timezone
from kmtid_history_store import (
    get_all_history,
    get_horse_history,
    normalize_horse_name,
    sanitize_kmtid_tempo_value,
    save_starts,
)
from kmtid_tempo_metrics import get_horse_tempo_metrics

MAX_KMTID_IMPORT_RANGE_DAYS = 31

AUTO_KMTID_BACKFILL_ENABLED = os.environ.get("AUTO_KMTID_BACKFILL_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
AUTO_KMTID_BACKFILL_MONTHS = max(1, int(os.environ.get("AUTO_KMTID_BACKFILL_MONTHS", "12")))
AUTO_KMTID_THIN_DAYS_THRESHOLD = max(1, int(os.environ.get("AUTO_KMTID_THIN_DAYS_THRESHOLD", "60")))
# Guard: topup only tries dates up to N days in the future to prevent 404 storms
AUTO_KMTID_TOPUP_MAX_FUTURE_DAYS = max(1, int(os.environ.get("AUTO_KMTID_TOPUP_MAX_FUTURE_DAYS", "14")))
# Guard: stop topup if N consecutive 404s detected for future dates
AUTO_KMTID_CONSECUTIVE_404_LIMIT = max(1, int(os.environ.get("AUTO_KMTID_CONSECUTIVE_404_LIMIT", "3")))

_auto_kmtid_task_running = False


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


EMPTY_TEMPO_METRICS = {
    "sampleSize": 0,
    "averageFirst200ms": None,
    "bestFirst200ms": None,
    "averageBest100ms": None,
    "averageSlipstreamDistance": None,
}


def _empty_tempo_metrics() -> dict:
    return dict(EMPTY_TEMPO_METRICS)


def _normalize_tempo_metrics_object(metrics: dict | None) -> dict:
    if not isinstance(metrics, dict):
        return _empty_tempo_metrics()

    return {
        "sampleSize": int(metrics.get("sampleSize") or 0),
        "averageFirst200ms": metrics.get("averageFirst200ms"),
        "bestFirst200ms": metrics.get("bestFirst200ms"),
        "averageBest100ms": metrics.get("averageBest100ms"),
        "averageSlipstreamDistance": metrics.get("averageSlipstreamDistance"),
    }


def _build_tempo_metrics_for_horse_name(horse_name: str | None) -> dict:
    name = str(horse_name or "").strip()
    if not name:
        return _empty_tempo_metrics()

    try:
        normalized_name = normalize_horse_name(name)
        logger.info(f"TEMPO DEBUG horse={name} normalized={normalized_name}")
        if not normalized_name:
            logger.info(f"TEMPO DEBUG horse={name} normalized=(empty)")
            return _empty_tempo_metrics()

        metrics = get_horse_tempo_metrics(normalized_name)
        logger.info(f"TEMPO DEBUG horse={name} normalized={normalized_name} resolved_sampleSize={metrics.get('sampleSize', 0)}")
        return _normalize_tempo_metrics_object(metrics)
    except Exception as exc:
        logger.warning("Tempo metrics lookup failed horse=%s error=%s", name, exc)
        return _empty_tempo_metrics()


def _enrich_horse_object_with_tempo_metrics(horse_obj: dict) -> None:
    if not isinstance(horse_obj, dict):
        return
    horse_obj["tempoMetrics"] = _build_tempo_metrics_for_horse_name(horse_obj.get("name"))
    # tempoIndicator is pure metadata – mirrors frontend getTempoIndicator().
    # Has no effect on scoring, ranking, or sorting.
    horse_obj["tempoIndicator"] = _compute_tempo_indicator_label(horse_obj["tempoMetrics"])


def _attach_tempo_metrics_to_game_payload(node) -> None:
    if isinstance(node, dict):
        horse = node.get("horse")
        if isinstance(horse, dict):
            _enrich_horse_object_with_tempo_metrics(horse)

        for value in node.values():
            _attach_tempo_metrics_to_game_payload(value)
        return

    if isinstance(node, list):
        for item in node:
            _attach_tempo_metrics_to_game_payload(item)


def _to_number_or_none(value):
    try:
        number_value = float(value)
        return number_value
    except (TypeError, ValueError):
        return None


def _first_not_none(*values):
    for value in values:
        if value is not None:
            return value
    return None


def _compute_tempo_indicator_label(tempo_metrics: dict) -> str:
    """Mirror of frontend getTempoIndicator() – thresholds MUST stay in sync with HorseTable.jsx.

    Thresholds:
      Startsnabb : bestFirst200ms  <= 11000  (stark <= 10800, medel <= 11000)
      Tempostark : averageBest100ms <= 7000   (stark <=  6800, medel <=  7000)
      sampleSize < 3 always yields 'Ingen tydlig signal'

    Pure metadata – no effect on scoring, ranking, or sorting.
    """
    if not isinstance(tempo_metrics, dict):
        return "Ingen tydlig signal"
    sample_size = int(tempo_metrics.get("sampleSize") or 0)
    if sample_size < 3:
        return "Ingen tydlig signal"
    best_first_200 = _to_number_or_none(tempo_metrics.get("bestFirst200ms"))
    avg_best_100 = _to_number_or_none(tempo_metrics.get("averageBest100ms"))
    if best_first_200 is not None and best_first_200 <= 11000:
        return "Startsnabb"
    if avg_best_100 is not None and avg_best_100 <= 7000:
        return "Tempostark"
    return "Ingen tydlig signal"


def _build_kmtid_debug_stats(payload: dict) -> dict:
    """Walk the enriched game payload and return per-race KM-tid match statistics.

    Includes value distributions for bestFirst200ms and averageBest100ms so that
    threshold calibration can be done based on real data.

    All values are ms/km pace (milliseconds per kilometre).  Good trotters: ~64 000-68 000.
    Current thresholds: bestFirst200ms<=11000, averageBest100ms<=7000 (WRONG UNITS – for
    reference only until corrected).

    Only reads already-attached tempoMetrics/tempoIndicator fields.
    No scoring, ranking, or sorting effect.
    """
    races_source = payload.get("races") or []
    if not isinstance(races_source, list):
        races_source = []

    per_race: list[dict] = []
    total_horses = 0
    total_hit = 0
    total_sample_gte1 = 0
    total_sample_gte3 = 0
    total_startsnabb = 0
    total_tempostark = 0
    no_hit_names: list[str] = []

    # Across-game value lists for distribution analysis
    all_best_f200: list[float] = []
    all_avg_b100: list[float] = []

    # Threshold reference values (current code; known to need correction)
    CURRENT_THRESHOLD_F200 = 11_000
    CURRENT_THRESHOLD_B100 = 7_000
    # Candidate realistic thresholds (ms/km) for reference only – NOT applied here
    CANDIDATE_F200_FAST = 66_000  # ≈ 1:06/km at start → Startsnabb
    CANDIDATE_B100_FAST = 65_000  # ≈ 1:05/km top speed → Tempostark

    current_threshold_matches = 0
    candidate_threshold_matches = 0

    for race in races_source:
        if not isinstance(race, dict):
            continue
        race_number = race.get("number") or race.get("raceNumber") or "?"
        starts = race.get("starts") or []
        if not isinstance(starts, list):
            starts = []

        race_horses = 0
        race_hit = 0
        race_sample_gte1 = 0
        race_sample_gte3 = 0
        race_startsnabb = 0
        race_tempostark = 0
        race_f200_values: list[float] = []
        race_b100_values: list[float] = []

        for start in starts:
            if not isinstance(start, dict):
                continue
            horse = start.get("horse")
            if not isinstance(horse, dict):
                continue
            tempo = horse.get("tempoMetrics")
            if not isinstance(tempo, dict):
                continue

            race_horses += 1
            sample_size = int(tempo.get("sampleSize") or 0)
            if sample_size >= 1:
                race_hit += 1
                race_sample_gte1 += 1
            else:
                horse_name = horse.get("name") or ""
                if horse_name and len(no_hit_names) < 5:
                    no_hit_names.append(horse_name)
            if sample_size >= 3:
                race_sample_gte3 += 1

            indicator = horse.get("tempoIndicator", "")
            if indicator == "Startsnabb":
                race_startsnabb += 1
            elif indicator == "Tempostark":
                race_tempostark += 1

            # Collect value distributions for calibration
            bf200 = _to_number_or_none(tempo.get("bestFirst200ms"))
            ab100 = _to_number_or_none(tempo.get("averageBest100ms"))
            if bf200 is not None:
                race_f200_values.append(bf200)
                all_best_f200.append(bf200)
                if bf200 <= CURRENT_THRESHOLD_F200:
                    current_threshold_matches += 1
                if bf200 <= CANDIDATE_F200_FAST:
                    candidate_threshold_matches += 1
            if ab100 is not None:
                race_b100_values.append(ab100)
                all_avg_b100.append(ab100)
                if ab100 <= CURRENT_THRESHOLD_B100:
                    current_threshold_matches += 1
                if ab100 <= CANDIDATE_B100_FAST:
                    candidate_threshold_matches += 1

        race_entry: dict = {
            "raceNumber": race_number,
            "totalHorses": race_horses,
            "kmtidHit": race_hit,
            "sampleGte1": race_sample_gte1,
            "sampleGte3": race_sample_gte3,
            "startsnabb": race_startsnabb,
            "tempostark": race_tempostark,
        }

        if race_f200_values:
            race_entry["bestFirst200ms_stats"] = {
                "count": len(race_f200_values),
                "min": min(race_f200_values),
                "max": max(race_f200_values),
                "avg": sum(race_f200_values) / len(race_f200_values),
                "sample": sorted(race_f200_values)[:5],
            }
        if race_b100_values:
            race_entry["averageBest100ms_stats"] = {
                "count": len(race_b100_values),
                "min": min(race_b100_values),
                "max": max(race_b100_values),
                "avg": sum(race_b100_values) / len(race_b100_values),
                "sample": sorted(race_b100_values)[:5],
            }

        per_race.append(race_entry)

        total_horses += race_horses
        total_hit += race_hit
        total_sample_gte1 += race_sample_gte1
        total_sample_gte3 += race_sample_gte3
        total_startsnabb += race_startsnabb
        total_tempostark += race_tempostark

    result: dict = {
        "totalHorses": total_horses,
        "kmtidHit": total_hit,
        "sampleGte1": total_sample_gte1,
        "sampleGte3": total_sample_gte3,
        "startsnabb": total_startsnabb,
        "tempostark": total_tempostark,
        "perRace": per_race,
    }

    # Cross-game distributions – key diagnostic for threshold calibration
    if all_best_f200:
        result["gameWide_bestFirst200ms"] = {
            "unit": "ms/km (milliseconds per kilometre pace)",
            "count": len(all_best_f200),
            "min": min(all_best_f200),
            "max": max(all_best_f200),
            "avg": sum(all_best_f200) / len(all_best_f200),
            "sample_sorted_asc": sorted(all_best_f200)[:8],
            "currentThreshold": CURRENT_THRESHOLD_F200,
            "matchesCurrentThreshold": sum(1 for v in all_best_f200 if v <= CURRENT_THRESHOLD_F200),
            "candidateThreshold_1:06/km": CANDIDATE_F200_FAST,
            "matchesCandidateThreshold": sum(1 for v in all_best_f200 if v <= CANDIDATE_F200_FAST),
        }
    if all_avg_b100:
        result["gameWide_averageBest100ms"] = {
            "unit": "ms/km (milliseconds per kilometre pace)",
            "count": len(all_avg_b100),
            "min": min(all_avg_b100),
            "max": max(all_avg_b100),
            "avg": sum(all_avg_b100) / len(all_avg_b100),
            "sample_sorted_asc": sorted(all_avg_b100)[:8],
            "currentThreshold": CURRENT_THRESHOLD_B100,
            "matchesCurrentThreshold": sum(1 for v in all_avg_b100 if v <= CURRENT_THRESHOLD_B100),
            "candidateThreshold_1:05/km": CANDIDATE_B100_FAST,
            "matchesCandidateThreshold": sum(1 for v in all_avg_b100 if v <= CANDIDATE_B100_FAST),
        }
    if not all_best_f200 and not all_avg_b100:
        result["DIAGNOSIS"] = (
            "No tempo values found on any horse. "
            "Likely causes: (1) DB empty/wrong units – check sanitize range fix; "
            "(2) sampleSize=0 for all horses; (3) name normalisation mismatch."
        )

    if no_hit_names:
        result["noHitNameSample"] = no_hit_names
    return result


def _normalize_iso_date(input_date: str, fallback_date: str | None = None) -> str | None:
    text = str(input_date or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text

    compact = text.replace("-", "")
    if re.fullmatch(r"\d{8}", compact):
        return f"{compact[:4]}-{compact[4:6]}-{compact[6:8]}"
    if re.fullmatch(r"\d{6}", compact):
        return f"20{compact[:2]}-{compact[2:4]}-{compact[4:6]}"

    fallback = str(fallback_date or "").strip().replace("-", "")
    if re.fullmatch(r"\d{8}", fallback):
        return f"{fallback[:4]}-{fallback[4:6]}-{fallback[6:8]}"
    if re.fullmatch(r"\d{6}", fallback):
        return f"20{fallback[:2]}-{fallback[2:4]}-{fallback[4:6]}"

    return None


def _is_valid_iso_date(date_text: str) -> bool:
    text = str(date_text or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return False

    try:
        datetime.strptime(text, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _format_date_for_kmtid(date_text: str) -> str:
    compact = str(date_text or "").strip().replace("-", "")
    return compact[2:]


def _extract_balanced_array_literal(raw_text: str, array_start_index: int) -> str | None:
    depth = 0
    in_single_quote = False
    in_double_quote = False
    in_template = False
    in_line_comment = False
    in_block_comment = False

    for i in range(array_start_index, len(raw_text)):
        ch = raw_text[i]
        next_ch = raw_text[i + 1] if i + 1 < len(raw_text) else ""
        prev_ch = raw_text[i - 1] if i > 0 else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            continue
        if in_block_comment:
            if prev_ch == "*" and ch == "/":
                in_block_comment = False
            continue
        if in_single_quote:
            if ch == "'" and prev_ch != "\\":
                in_single_quote = False
            continue
        if in_double_quote:
            if ch == '"' and prev_ch != "\\":
                in_double_quote = False
            continue
        if in_template:
            if ch == "`" and prev_ch != "\\":
                in_template = False
            continue

        if ch == "/" and next_ch == "/":
            in_line_comment = True
            continue
        if ch == "/" and next_ch == "*":
            in_block_comment = True
            continue
        if ch == "'":
            in_single_quote = True
            continue
        if ch == '"':
            in_double_quote = True
            continue
        if ch == "`":
            in_template = True
            continue

        if ch == "[":
            depth += 1
            continue
        if ch == "]":
            depth -= 1
            if depth == 0:
                return raw_text[array_start_index:i + 1]

    return None


def _parse_kmtid_races_array(raw_text: str) -> list:
    if not isinstance(raw_text, str) or not raw_text.strip():
        return []

    races_decl_index = raw_text.find("const races")
    if races_decl_index < 0:
        return []

    array_start_index = raw_text.find("[", races_decl_index)
    if array_start_index < 0:
        return []

    array_text = _extract_balanced_array_literal(raw_text, array_start_index)
    if not array_text:
        return []

    try:
        races = json.loads(array_text)
        return races if isinstance(races, list) else []
    except Exception:
        return []


def _compute_timing_from_intervals(intervals: list) -> dict:
    if not isinstance(intervals, list) or len(intervals) < 2:
        return {}

    durations = [
        sanitize_kmtid_tempo_value(_to_number_or_none((item or {}).get("duration")), "best100ms")
        for item in intervals
    ]
    durations = [value for value in durations if value is not None]
    if len(durations) < 2:
        return {}

    first200ms = None
    if len(intervals) >= 2:
        d0 = sanitize_kmtid_tempo_value(_to_number_or_none((intervals[0] or {}).get("duration")), "best100ms")
        d1 = sanitize_kmtid_tempo_value(_to_number_or_none((intervals[1] or {}).get("duration")), "best100ms")
        if d0 is not None and d1 is not None:
            first200ms = sanitize_kmtid_tempo_value((d0 + d1) / 2, "first200ms")

    last200ms = None
    if len(intervals) >= 2:
        d_prev = sanitize_kmtid_tempo_value(_to_number_or_none((intervals[-2] or {}).get("duration")), "best100ms")
        d_last = sanitize_kmtid_tempo_value(_to_number_or_none((intervals[-1] or {}).get("duration")), "best100ms")
        if d_prev is not None and d_last is not None:
            last200ms = sanitize_kmtid_tempo_value((d_prev + d_last) / 2, "last200ms")

    best100ms = sanitize_kmtid_tempo_value(min(durations), "best100ms") if durations else None

    return {
        "first200ms": first200ms,
        "last200ms": last200ms,
        "best100ms": best100ms,
    }


def _extract_kmtid_start_rows(raw_text: str, requested_date: str) -> list[dict]:
    races = _parse_kmtid_races_array(raw_text)
    extracted_rows: list[dict] = []

    for race in races:
        race_obj = race if isinstance(race, dict) else {}
        race_date = _normalize_iso_date(race_obj.get("date"), requested_date)
        race_id = race_obj.get("id")
        race_number = _to_number_or_none(race_obj.get("number"))
        starts = race_obj.get("starts")

        if not isinstance(starts, list):
            continue

        for start in starts:
            start_obj = start if isinstance(start, dict) else {}
            horse_obj = start_obj.get("horse") if isinstance(start_obj.get("horse"), dict) else {}
            horse_name = str(horse_obj.get("name") or "").strip()
            if not horse_name:
                continue

            timings = start_obj.get("timings") if isinstance(start_obj.get("timings"), dict) else {}
            intervals = timings.get("intervals") if isinstance(timings.get("intervals"), list) else []
            computed_timing = _compute_timing_from_intervals(intervals)

            first200ms = sanitize_kmtid_tempo_value(
                _first_not_none(
                    _to_number_or_none(timings.get("first200ms")),
                    _to_number_or_none(timings.get("first200Ms")),
                    _to_number_or_none(computed_timing.get("first200ms")),
                ),
                "first200ms",
            )
            last200ms = sanitize_kmtid_tempo_value(
                _first_not_none(
                    _to_number_or_none(timings.get("last200ms")),
                    _to_number_or_none(timings.get("last200Ms")),
                    _to_number_or_none(computed_timing.get("last200ms")),
                ),
                "last200ms",
            )
            best100ms = sanitize_kmtid_tempo_value(
                _first_not_none(
                    _to_number_or_none(timings.get("best100ms")),
                    _to_number_or_none(timings.get("best100Ms")),
                    _to_number_or_none(computed_timing.get("best100ms")),
                ),
                "best100ms",
            )
            actual_km_time = sanitize_kmtid_tempo_value(
                _first_not_none(
                    _to_number_or_none(timings.get("actualKMTime")),
                    _to_number_or_none(timings.get("actualKmTime")),
                ),
                "actualKMTime",
            )
            slipstream_distance = sanitize_kmtid_tempo_value(
                _to_number_or_none(timings.get("slipstreamDistance")),
                "slipstreamDistance",
            )

            extracted_rows.append(
                {
                    "date": race_date,
                    "race_id": race_id,
                    "race_number": int(race_number) if race_number is not None else None,
                    "horse_name": horse_name,
                    "first200ms": first200ms,
                    "last200ms": last200ms,
                    "best100ms": best100ms,
                    "actual_km_time": actual_km_time,
                    "slipstream_distance": slipstream_distance,
                }
            )

    return extracted_rows


def _persist_kmtid_starts_best_effort(raw_text: str, requested_date: str) -> None:
    try:
        extracted_rows = _extract_kmtid_start_rows(raw_text, requested_date)
        if not extracted_rows:
            logger.info("KMTid persistence skipped: no parsed starts for date=%s", requested_date)
            return

        save_result = save_starts(extracted_rows)
        logger.info("KMTid persistence result date=%s result=%s", requested_date, save_result)
    except Exception as exc:
        logger.warning("KMTid persistence failed date=%s error=%s", requested_date, exc)


async def _fetch_kmtid_races_js(date_value: str) -> httpx.Response:
    url = f"https://kmtid.atgx.se/{date_value}/js/races.js"
    async with httpx.AsyncClient() as client:
        return await client.get(url)


async def _import_kmtid_for_date(requested_date: str) -> dict:
    result = {
        "date": requested_date,
        "fetched": False,
        "parsedStarts": 0,
        "inserted": 0,
        "skipped": 0,
    }

    try:
        kmtid_date = _format_date_for_kmtid(requested_date)
        response = await _fetch_kmtid_races_js(kmtid_date)

        if response.status_code != 200:
            logger.info(
                "KMTid import no data date=%s upstream_status=%s",
                requested_date,
                response.status_code,
            )
            result["error"] = f"no KM-tid data for date (upstream status {response.status_code})"
            return result

        result["fetched"] = True
        extracted_rows = _extract_kmtid_start_rows(response.text, requested_date)
        result["parsedStarts"] = len(extracted_rows)

        if not extracted_rows:
            logger.info("KMTid import parsed no starts date=%s", requested_date)
            return result

        save_result = save_starts(extracted_rows)
        result["inserted"] = int(save_result.get("inserted", 0))
        result["skipped"] = int(save_result.get("skipped", 0))
        logger.info("KMTid import result date=%s result=%s", requested_date, result)
        return result
    except Exception as exc:
        logger.warning("KMTid import failed date=%s error=%s", requested_date, exc)
        result["error"] = str(exc)
        return result


def _last_day_of_month(value_date):
    first_of_next_month = (value_date.replace(day=28) + timedelta(days=4)).replace(day=1)
    return first_of_next_month - timedelta(days=1)


async def _import_kmtid_range_core(start_date_text: str, end_date_text: str) -> dict:
    start_dt = datetime.strptime(start_date_text, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date_text, "%Y-%m-%d").date()
    requested_days = (end_dt - start_dt).days + 1
    today = datetime.now().date()

    failed_dates = []
    per_day = []
    total_parsed_starts = 0
    total_inserted = 0
    total_skipped = 0
    days_processed = 0
    days_with_data = 0  # Only days where parsedStarts > 0
    days_failed = 0
    consecutive_future_404s = 0  # Track consecutive 404s for dates beyond today
    latest_date_with_data = None  # Track senaste datum med faktisk data

    current_dt = start_dt
    while current_dt <= end_dt:
        current_date_text = current_dt.isoformat()
        days_processed += 1
        logger.info(
            "KMTid range import progress %s/%s date=%s",
            days_processed,
            requested_days,
            current_date_text,
        )

        day_result = await _import_kmtid_for_date(current_date_text)
        parsed_starts = int(day_result.get("parsedStarts", 0) or 0)
        has_data = parsed_starts > 0  # Only count days with actual data
        has_error = bool(day_result.get("error"))

        total_parsed_starts += parsed_starts
        total_inserted += int(day_result.get("inserted", 0) or 0)
        total_skipped += int(day_result.get("skipped", 0) or 0)

        per_day_item = {
            "date": current_date_text,
            "hasData": has_data,
            "hasError": has_error,
            "parsedStarts": parsed_starts,
            "inserted": int(day_result.get("inserted", 0) or 0),
            "skipped": int(day_result.get("skipped", 0) or 0),
        }
        if has_error:
            per_day_item["error"] = day_result.get("error")
        per_day.append(per_day_item)

        # Track days with actual data (parsedStarts > 0), regardless of error state
        if has_data:
            days_with_data += 1
            latest_date_with_data = current_dt

        if has_error:
            days_failed += 1
            failed_dates.append(
                {
                    "date": current_date_text,
                    "error": day_result.get("error"),
                }
            )
            # Guard: detect consecutive 404s for future dates (beyond today)
            is_future_date = current_dt > today
            if is_future_date and "404" in str(day_result.get("error", "")):
                consecutive_future_404s += 1
                if consecutive_future_404s >= AUTO_KMTID_CONSECUTIVE_404_LIMIT:
                    logger.info(
                        "KMTid topup stopped early: %d consecutive 404s for future dates (stopped at %s)",
                        consecutive_future_404s,
                        current_date_text,
                    )
                    break  # Stop loop early; upstream likely has no data for future dates
            else:
                consecutive_future_404s = 0  # Reset counter on non-404 errors
        else:
            consecutive_future_404s = 0  # Reset counter on no error

        logger.info(
            "KMTid range import day result date=%s hasData=%s hasError=%s parsed=%s inserted=%s skipped=%s",
            current_date_text,
            has_data,
            has_error,
            parsed_starts,
            per_day_item["inserted"],
            per_day_item["skipped"],
        )

        current_dt += timedelta(days=1)

    return {
        "startDate": start_date_text,
        "endDate": end_date_text,
        "daysProcessed": days_processed,
        "daysWithData": days_with_data,
        "daysFailed": days_failed,
        "totalParsedStarts": total_parsed_starts,
        "totalInserted": total_inserted,
        "totalSkipped": total_skipped,
        "latestDateWithData": latest_date_with_data.isoformat() if latest_date_with_data else None,
        "failedDates": failed_dates,
        "perDay": per_day,
    }


async def _import_kmtid_monthly_core(start_date_text: str, end_date_text: str) -> dict:
    start_dt = datetime.strptime(start_date_text, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date_text, "%Y-%m-%d").date()

    month_results = []
    failed_months = []
    total_days_processed = 0
    total_days_with_data = 0
    total_parsed_starts = 0
    total_inserted = 0
    total_skipped = 0
    months_processed = 0
    latest_date_with_data = None

    current_dt = start_dt
    while current_dt <= end_dt:
        block_start = current_dt
        block_end = min(_last_day_of_month(current_dt), end_dt)
        months_processed += 1

        logger.info(
            "KMTid monthly import block month=%s start=%s end=%s",
            block_start.strftime("%Y-%m"),
            block_start.isoformat(),
            block_end.isoformat(),
        )

        block_result = await _import_kmtid_range_core(block_start.isoformat(), block_end.isoformat())
        total_days_processed += int(block_result.get("daysProcessed", 0) or 0)
        total_days_with_data += int(block_result.get("daysWithData", 0) or 0)
        total_parsed_starts += int(block_result.get("totalParsedStarts", 0) or 0)
        total_inserted += int(block_result.get("totalInserted", 0) or 0)
        total_skipped += int(block_result.get("totalSkipped", 0) or 0)

        # Track latest date with actual data from this block
        block_latest = block_result.get("latestDateWithData")
        if block_latest:
            latest_date_with_data = datetime.strptime(block_latest, "%Y-%m-%d").date()

        month_item = {
            "month": block_start.strftime("%Y-%m"),
            "startDate": block_start.isoformat(),
            "endDate": block_end.isoformat(),
            "daysProcessed": int(block_result.get("daysProcessed", 0) or 0),
            "daysWithData": int(block_result.get("daysWithData", 0) or 0),
            "daysFailed": int(block_result.get("daysFailed", 0) or 0),
            "totalParsedStarts": int(block_result.get("totalParsedStarts", 0) or 0),
            "totalInserted": int(block_result.get("totalInserted", 0) or 0),
            "totalSkipped": int(block_result.get("totalSkipped", 0) or 0),
        }
        month_results.append(month_item)

        if month_item["daysFailed"] > 0:
            failed_months.append(
                {
                    "month": month_item["month"],
                    "failedDates": block_result.get("failedDates", []),
                }
            )

        current_dt = block_end + timedelta(days=1)

    return {
        "startDate": start_date_text,
        "endDate": end_date_text,
        "monthsProcessed": months_processed,
        "daysProcessed": total_days_processed,
        "daysWithData": total_days_with_data,
        "totalParsedStarts": total_parsed_starts,
        "totalInserted": total_inserted,
        "totalSkipped": total_skipped,
        "latestDateWithData": latest_date_with_data.isoformat() if latest_date_with_data else None,
        "failedMonths": failed_months,
        "monthResults": month_results,
    }


def _subtract_months(anchor_date, months_back: int):
    year = anchor_date.year
    month = anchor_date.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    day = min(anchor_date.day, _last_day_of_month(datetime(year, month, 1).date()).day)
    return datetime(year, month, day).date()


def _get_stored_kmtid_dates() -> set:
    try:
        history = get_all_history()
    except Exception as exc:
        logger.warning("Auto KMTid: failed to load stored history dates: %s", exc)
        return set()

    dates = set()
    for row in history if isinstance(history, list) else []:
        date_text = str((row or {}).get("date") or "").strip()
        if not date_text:
            continue
        try:
            parsed_date = datetime.strptime(date_text, "%Y-%m-%d").date()
            dates.add(parsed_date)
        except ValueError:
            continue

    return dates


async def _run_auto_kmtid_bootstrap() -> None:
    global _auto_kmtid_task_running
    if _auto_kmtid_task_running:
        logger.info("Auto KMTid bootstrap already running - skipping duplicate start")
        return

    _auto_kmtid_task_running = True
    try:
        if not AUTO_KMTID_BACKFILL_ENABLED:
            logger.info("Auto KMTid bootstrap is disabled by config")
            return

        today = datetime.now().date()
        stored_dates = _get_stored_kmtid_dates()
        unique_days = len(stored_dates)

        logger.info(
            "Auto KMTid bootstrap starting (stored_days=%s threshold=%s months_back=%s)",
            unique_days,
            AUTO_KMTID_THIN_DAYS_THRESHOLD,
            AUTO_KMTID_BACKFILL_MONTHS,
        )

        if unique_days < AUTO_KMTID_THIN_DAYS_THRESHOLD:
            backfill_end = today
            backfill_start = _subtract_months(backfill_end, AUTO_KMTID_BACKFILL_MONTHS)
            logger.info(
                "Auto KMTid bootstrap backfill range=%s..%s",
                backfill_start.isoformat(),
                backfill_end.isoformat(),
            )
            monthly_result = await _import_kmtid_monthly_core(
                backfill_start.isoformat(),
                backfill_end.isoformat(),
            )
            logger.info(
                "Auto KMTid bootstrap monthly summary months=%s daysWithData=%s inserted=%s skipped=%s",
                monthly_result.get("monthsProcessed", 0),
                monthly_result.get("daysWithData", 0),
                monthly_result.get("totalInserted", 0),
                monthly_result.get("totalSkipped", 0),
            )
            stored_dates = _get_stored_kmtid_dates()

        # Always attempt a lightweight top-up for missing recent dates.
        # Use latest date with actual data, not latest attempted date.
        latest_date = max(stored_dates) if stored_dates else None
        start_topup = (latest_date + timedelta(days=1)) if latest_date else _subtract_months(today, 1)
        # Guard: limit topup to sensible future range; avoid 404 storms on dates with no upstream data
        max_topup_date = today + timedelta(days=AUTO_KMTID_TOPUP_MAX_FUTURE_DAYS)
        if start_topup <= max_topup_date:
            logger.info(
                "Auto KMTid bootstrap top-up starting from latest date with data (max_future_days=%s)",
                AUTO_KMTID_TOPUP_MAX_FUTURE_DAYS,
            )
            topup_result = await _import_kmtid_range_core(start_topup.isoformat(), max_topup_date.isoformat())
            logger.info(
                "Auto KMTid bootstrap top-up summary daysWithData=%s inserted=%s skipped=%s latestDataDate=%s",
                topup_result.get("daysWithData", 0),
                topup_result.get("totalInserted", 0),
                topup_result.get("totalSkipped", 0),
                topup_result.get("latestDateWithData", "none"),
            )
        else:
            logger.info("Auto KMTid bootstrap top-up skipped: latest_date=%s already at/beyond max_topup_date=%s", (latest_date or "none").isoformat() if latest_date else "none", max_topup_date.isoformat())
    except Exception as exc:
        logger.exception("Auto KMTid bootstrap failed: %s", exc)
    finally:
        _auto_kmtid_task_running = False

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

@api_router.get("/atg/calendar")
def atg_calendar(date: str = Query(..., description="Date in YYYY-MM-DD format")):
    url = f"https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/calendar/day/{date}"
    resp = http_requests.get(url, timeout=15)
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@api_router.get("/atg/game")
def atg_game(gameId: str = Query(..., description="ATG game ID")):
    url = f"https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/games/{gameId}"
    resp = http_requests.get(url, timeout=15)
    if resp.status_code != 200:
        return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")

    try:
        payload = resp.json()
        _attach_tempo_metrics_to_game_payload(payload)
        debug_stats = _build_kmtid_debug_stats(payload)
        # Attach debug stats to response – pure observability, no scoring effect.
        payload["_kmtidDebug"] = debug_stats
        logger.info(
            "ATG game kmtid_debug gameId=%s totalHorses=%d kmtidHit=%d "
            "sampleGte1=%d sampleGte3=%d startsnabb=%d tempostark=%d noHitSample=%s",
            gameId,
            debug_stats["totalHorses"],
            debug_stats["kmtidHit"],
            debug_stats["sampleGte1"],
            debug_stats["sampleGte3"],
            debug_stats["startsnabb"],
            debug_stats["tempostark"],
            debug_stats.get("noHitNameSample", []),
        )
        if debug_stats["totalHorses"] > 0 and debug_stats["kmtidHit"] == 0:
            logger.warning(
                "ATG game NO kmtid hits gameId=%s – all %d horses missed. "
                "Likely causes: (1) historical DB empty/thin – run auto-bootstrap; "
                "(2) name normalisation mismatch between ATG and KM-tid source. "
                "Sample ATG names without match: %s",
                gameId,
                debug_stats["totalHorses"],
                debug_stats.get("noHitNameSample", []),
            )
        return JSONResponse(content=payload, status_code=resp.status_code)
    except Exception as exc:
        logger.warning("ATG game tempo enrichment failed gameId=%s error=%s", gameId, exc)
        return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@api_router.get("/atg/race")
def atg_race(
    gameType: str = Query(..., description="ATG game type, e.g. V85"),
    raceId: str = Query(..., description="ATG race ID"),
):
    url = f"https://www.atg.se/services/racinginfo/v1/api/games/{gameType}_{raceId}"
    resp = http_requests.get(url, timeout=15)
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@api_router.get("/atg/result")
def atg_result(
    gameId: str = Query(..., description="ATG game ID, e.g. V85_2026-04-05_23_5"),
):
    url = f"https://www.atg.se/services/racinginfo/v1/api/games/{gameId}"
    logger.info("ATG RESULT PROXY URL: %s", url)
    resp = http_requests.get(
        url,
        timeout=15,
        headers={
            "accept": "application/json, text/plain, */*",
            "user-agent": "Mozilla/5.0",
        },
    )
    logger.info("ATG RESULT PROXY STATUS: %s", resp.status_code)
    logger.info("ATG RESULT PROXY TEXT: %s", resp.text[:500])
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@app.get("/api/kmtid/{date}")
async def get_kmtid(date: str):
    print(f"[API] /api/kmtid/{date}")
    url = f"https://kmtid.atgx.se/{date}/js/races.js"

    async with httpx.AsyncClient() as client:
        r = await client.get(url)

    if r.status_code != 200:
        return Response(status_code=404)

    # Optional side effect: persist parsed starts if parsing succeeds.
    _persist_kmtid_starts_best_effort(r.text, date)

    return Response(
        content=r.text,
        media_type="application/javascript"
    )


@app.get("/api/kmtid-page/{date}")
async def get_kmtid_page(date: str):
    print("[KMTid page fetch]", date)
    url = f"https://kmtid.atgx.se/{date}/"
    logger.info("KMTid page incoming date=%s", date)
    logger.info("KMTid page upstream url=%s", url)
    resp = http_requests.get(url, timeout=15)
    logger.info("KMTid page upstream status=%s", resp.status_code)
    html = resp.text
    preview = html[:200] if isinstance(html, str) else ""
    logger.info("KMTid page upstream preview=%s", preview)

    if resp.status_code != 200:
        return JSONResponse(
            status_code=resp.status_code,
            content={
                "error": "kmtid page fetch failed",
                "upstream_url": url,
                "upstream_status": resp.status_code,
                "preview": preview,
            },
        )

    return Response(content=html, media_type="text/html")


@app.get("/api/kmtid/history")
async def get_kmtid_history_all():
    try:
        history = get_all_history()
        return history if isinstance(history, list) else []
    except Exception as exc:
        logger.exception("KMTid history fetch failed")
        return JSONResponse(
            status_code=500,
            content={"error": "failed to read KM-tid history", "details": str(exc)},
        )


@app.get("/api/kmtid/history/{normalized_horse_name}")
async def get_kmtid_history_for_horse(normalized_horse_name: str):
    try:
        decoded_name = unquote(normalized_horse_name or "").strip()
        if not decoded_name:
            return []

        history = get_horse_history(decoded_name)
        return history if isinstance(history, list) else []
    except Exception as exc:
        logger.exception("KMTid horse history fetch failed horse=%s", normalized_horse_name)
        return JSONResponse(
            status_code=500,
            content={"error": "failed to read KM-tid horse history", "details": str(exc)},
        )


@app.get("/api/kmtid/tempo/{normalized_horse_name}")
async def get_kmtid_tempo_for_horse(normalized_horse_name: str):
    empty_metrics = {
        "sampleSize": 0,
        "averageFirst200ms": None,
        "bestFirst200ms": None,
        "averageBest100ms": None,
        "averageSlipstreamDistance": None,
    }

    try:
        decoded_name = unquote(normalized_horse_name or "").strip()
        if not decoded_name:
            return empty_metrics

        metrics = get_horse_tempo_metrics(decoded_name)
        return metrics if isinstance(metrics, dict) else empty_metrics
    except Exception as exc:
        logger.exception("KMTid tempo fetch failed horse=%s", normalized_horse_name)
        return JSONResponse(
            status_code=500,
            content={"error": "failed to read KM-tid tempo metrics", "details": str(exc)},
        )


@app.post("/api/kmtid/import/{date}")
async def import_kmtid_history_for_date(date: str):
    requested_date = str(date or "").strip()
    if not _is_valid_iso_date(requested_date):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date format",
                "details": "expected YYYY-MM-DD",
                "date": requested_date,
            },
        )

    result = await _import_kmtid_for_date(requested_date)
    if result.get("error") and not result.get("fetched"):
        return JSONResponse(status_code=500, content=result)

    return result


@app.post("/api/kmtid/import-range")
async def import_kmtid_history_range(
    startDate: str = Query(..., description="Start date in YYYY-MM-DD format"),
    endDate: str = Query(..., description="End date in YYYY-MM-DD format"),
):
    start_date_text = str(startDate or "").strip()
    end_date_text = str(endDate or "").strip()

    if not _is_valid_iso_date(start_date_text) or not _is_valid_iso_date(end_date_text):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date format",
                "details": "expected YYYY-MM-DD",
                "startDate": start_date_text,
                "endDate": end_date_text,
            },
        )

    start_dt = datetime.strptime(start_date_text, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date_text, "%Y-%m-%d").date()
    if end_dt < start_dt:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date range",
                "details": "endDate must be on or after startDate",
                "startDate": start_date_text,
                "endDate": end_date_text,
            },
        )

    requested_days = (end_dt - start_dt).days + 1
    if requested_days > MAX_KMTID_IMPORT_RANGE_DAYS:
        return JSONResponse(
            status_code=400,
            content={
                "error": "date range too large",
                "details": f"max {MAX_KMTID_IMPORT_RANGE_DAYS} days per request",
                "startDate": start_date_text,
                "endDate": end_date_text,
                "requestedDays": requested_days,
                "maxDays": MAX_KMTID_IMPORT_RANGE_DAYS,
            },
        )

    return await _import_kmtid_range_core(start_date_text, end_date_text)


@app.post("/api/kmtid/backfill")
async def kmtid_manual_backfill(
    startDate: str = Query(..., description="Start date in YYYY-MM-DD format"),
    endDate: str = Query(..., description="End date in YYYY-MM-DD format"),
):
    """
    Manual backfill endpoint for importing historical KM-tid data.
    No maximum date range limit, automatically splits into months for stability.
    Only stores days with actual data (parsedStarts > 0).
    
    Example: /api/kmtid/backfill?startDate=2025-01-01&endDate=2025-12-31
    """
    start_date_text = str(startDate or "").strip()
    end_date_text = str(endDate or "").strip()

    if not _is_valid_iso_date(start_date_text) or not _is_valid_iso_date(end_date_text):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date format",
                "details": "expected YYYY-MM-DD",
                "startDate": start_date_text,
                "endDate": end_date_text,
            },
        )

    start_dt = datetime.strptime(start_date_text, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date_text, "%Y-%m-%d").date()
    if end_dt < start_dt:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date range",
                "details": "endDate must be on or after startDate",
                "startDate": start_date_text,
                "endDate": end_date_text,
            },
        )

    logger.info(
        "KMTid manual backfill starting startDate=%s endDate=%s",
        start_date_text,
        end_date_text,
    )

    result = await _import_kmtid_monthly_core(start_date_text, end_date_text)
    
    logger.info(
        "KMTid manual backfill completed startDate=%s endDate=%s daysWithData=%s inserted=%s",
        start_date_text,
        end_date_text,
        result.get("daysWithData", 0),
        result.get("totalInserted", 0),
    )
    
    return result


@app.post("/api/kmtid/import-monthly")
async def import_kmtid_history_monthly(
    startDate: str = Query(..., description="Start date in YYYY-MM-DD format"),
    endDate: str = Query(..., description="End date in YYYY-MM-DD format"),
):
    start_date_text = str(startDate or "").strip()
    end_date_text = str(endDate or "").strip()

    if not _is_valid_iso_date(start_date_text) or not _is_valid_iso_date(end_date_text):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date format",
                "details": "expected YYYY-MM-DD",
                "startDate": start_date_text,
                "endDate": end_date_text,
            },
        )

    start_dt = datetime.strptime(start_date_text, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date_text, "%Y-%m-%d").date()
    if end_dt < start_dt:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid date range",
                "details": "endDate must be on or after startDate",
                "startDate": start_date_text,
                "endDate": end_date_text,
            },
        )

    return await _import_kmtid_monthly_core(start_date_text, end_date_text)


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_kmtid_bootstrap():
    # Run bootstrap in background so API startup is not blocked by long backfill jobs.
    asyncio.create_task(_run_auto_kmtid_bootstrap())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()