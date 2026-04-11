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
from urllib.parse import unquote
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timedelta, timezone
from kmtid_history_store import get_all_history, get_horse_history, normalize_horse_name, save_starts
from kmtid_tempo_metrics import get_horse_tempo_metrics

MAX_KMTID_IMPORT_RANGE_DAYS = 31


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
        if not normalized_name:
            return _empty_tempo_metrics()

        metrics = get_horse_tempo_metrics(normalized_name)
        return _normalize_tempo_metrics_object(metrics)
    except Exception as exc:
        logger.warning("Tempo metrics lookup failed horse=%s error=%s", name, exc)
        return _empty_tempo_metrics()


def _enrich_horse_object_with_tempo_metrics(horse_obj: dict) -> None:
    if not isinstance(horse_obj, dict):
        return
    horse_obj["tempoMetrics"] = _build_tempo_metrics_for_horse_name(horse_obj.get("name"))


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

    durations = [_to_number_or_none((item or {}).get("duration")) for item in intervals]
    durations = [value for value in durations if value is not None]
    if len(durations) < 2:
        return {}

    first200ms = None
    if len(intervals) >= 2:
        d0 = _to_number_or_none((intervals[0] or {}).get("duration"))
        d1 = _to_number_or_none((intervals[1] or {}).get("duration"))
        if d0 is not None and d1 is not None:
            first200ms = (d0 + d1) / 2

    last200ms = None
    if len(intervals) >= 2:
        d_prev = _to_number_or_none((intervals[-2] or {}).get("duration"))
        d_last = _to_number_or_none((intervals[-1] or {}).get("duration"))
        if d_prev is not None and d_last is not None:
            last200ms = (d_prev + d_last) / 2

    best100ms = min(durations) if durations else None

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

            first200ms = _to_number_or_none(
                timings.get("first200ms")
                or timings.get("first200Ms")
                or computed_timing.get("first200ms")
            )
            last200ms = _to_number_or_none(
                timings.get("last200ms")
                or timings.get("last200Ms")
                or computed_timing.get("last200ms")
            )
            best100ms = _to_number_or_none(
                timings.get("best100ms")
                or timings.get("best100Ms")
                or computed_timing.get("best100ms")
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
                    "actual_km_time": timings.get("actualKMTime") or timings.get("actualKmTime"),
                    "slipstream_distance": _to_number_or_none(timings.get("slipstreamDistance")),
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

    failed_dates = []
    per_day = []
    total_parsed_starts = 0
    total_inserted = 0
    total_skipped = 0
    days_processed = 0
    days_succeeded = 0
    days_failed = 0

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
        total_parsed_starts += int(day_result.get("parsedStarts", 0) or 0)
        total_inserted += int(day_result.get("inserted", 0) or 0)
        total_skipped += int(day_result.get("skipped", 0) or 0)

        success = not bool(day_result.get("error"))
        per_day_item = {
            "date": current_date_text,
            "success": success,
            "parsedStarts": int(day_result.get("parsedStarts", 0) or 0),
            "inserted": int(day_result.get("inserted", 0) or 0),
            "skipped": int(day_result.get("skipped", 0) or 0),
        }
        if day_result.get("error"):
            per_day_item["error"] = day_result.get("error")
        per_day.append(per_day_item)

        if day_result.get("error"):
            days_failed += 1
            failed_dates.append(
                {
                    "date": current_date_text,
                    "error": day_result.get("error"),
                }
            )
        else:
            days_succeeded += 1

        logger.info(
            "KMTid range import day result date=%s success=%s parsed=%s inserted=%s skipped=%s",
            current_date_text,
            success,
            per_day_item["parsedStarts"],
            per_day_item["inserted"],
            per_day_item["skipped"],
        )

        current_dt += timedelta(days=1)

    return {
        "startDate": start_date_text,
        "endDate": end_date_text,
        "daysProcessed": days_processed,
        "daysSucceeded": days_succeeded,
        "daysFailed": days_failed,
        "totalParsedStarts": total_parsed_starts,
        "totalInserted": total_inserted,
        "totalSkipped": total_skipped,
        "failedDates": failed_dates,
        "perDay": per_day,
    }


async def _import_kmtid_monthly_core(start_date_text: str, end_date_text: str) -> dict:
    start_dt = datetime.strptime(start_date_text, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date_text, "%Y-%m-%d").date()

    month_results = []
    failed_months = []
    total_days_processed = 0
    total_parsed_starts = 0
    total_inserted = 0
    total_skipped = 0
    months_processed = 0

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
        total_parsed_starts += int(block_result.get("totalParsedStarts", 0) or 0)
        total_inserted += int(block_result.get("totalInserted", 0) or 0)
        total_skipped += int(block_result.get("totalSkipped", 0) or 0)

        month_item = {
            "month": block_start.strftime("%Y-%m"),
            "startDate": block_start.isoformat(),
            "endDate": block_end.isoformat(),
            "daysProcessed": int(block_result.get("daysProcessed", 0) or 0),
            "daysSucceeded": int(block_result.get("daysSucceeded", 0) or 0),
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
        "totalParsedStarts": total_parsed_starts,
        "totalInserted": total_inserted,
        "totalSkipped": total_skipped,
        "failedMonths": failed_months,
        "monthResults": month_results,
    }

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()