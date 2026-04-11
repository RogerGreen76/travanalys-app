from __future__ import annotations

import logging
from typing import Any

from kmtid_history_store import find_similar_horse_names, get_horse_history, sanitize_kmtid_tempo_value

logger = logging.getLogger(__name__)


def _to_float_or_none(value: Any) -> float | None:
    try:
        number = float(value)
        return number
    except (TypeError, ValueError):
        return None


def safe_average(values: list[Any]) -> float | None:
    numbers = [number for number in (_to_float_or_none(value) for value in values) if number is not None]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def safe_min(values: list[Any]) -> float | None:
    numbers = [number for number in (_to_float_or_none(value) for value in values) if number is not None]
    if not numbers:
        return None
    return min(numbers)


def get_horse_tempo_metrics(normalized_horse_name: str) -> dict[str, Any]:
    history = get_horse_history(normalized_horse_name)
    history_count = len(history) if history else 0
    if not history:
        similar = find_similar_horse_names(normalized_horse_name[:8])
        logger.info(
            'KM lookup normalized="%s" foundStarts=0 similarInDB=%s',
            normalized_horse_name,
            similar,
        )
        return {
            "sampleSize": 0,
            "averageFirst200ms": None,
            "bestFirst200ms": None,
            "averageBest100ms": None,
            "averageSlipstreamDistance": None,
        }

    logger.info(
        'KMTID metrics raw_rows=%s normalized="%s" sample=%s',
        len(history), normalized_horse_name,
        [{"d": r.get("date"), "f200": r.get("first200ms"), "b100": r.get("best100ms")} for r in history[:3]],
    )

    first200_values = [
        sanitize_kmtid_tempo_value(row.get("first200ms"), "first200ms")
        for row in history
    ]
    best100_values = [
        sanitize_kmtid_tempo_value(row.get("best100ms"), "best100ms")
        for row in history
    ]
    slipstream_values = [
        sanitize_kmtid_tempo_value(row.get("slipstreamDistance"), "slipstreamDistance")
        for row in history
    ]

    non_null_f200 = sum(1 for v in first200_values if v is not None)
    non_null_b100 = sum(1 for v in best100_values if v is not None)
    logger.info(
        'KMTID metrics normalized="%s" rows=%s non_null_first200=%s non_null_best100=%s',
        normalized_horse_name, len(history), non_null_f200, non_null_b100,
    )

    result = {
        "sampleSize": len(history),
        "averageFirst200ms": safe_average(first200_values),
        "bestFirst200ms": safe_min(first200_values),
        "averageBest100ms": safe_average(best100_values),
        "averageSlipstreamDistance": safe_average(slipstream_values),
    }
    logger.info('KM lookup normalized="%s" foundStarts=%s result=%s', normalized_horse_name, result["sampleSize"], result)
    return result
