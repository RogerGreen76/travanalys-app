from __future__ import annotations

from typing import Any

from kmtid_history_store import get_horse_history


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
    if not history:
        return {
            "sampleSize": 0,
            "averageFirst200ms": None,
            "bestFirst200ms": None,
            "averageBest100ms": None,
            "averageSlipstreamDistance": None,
        }

    first200_values = [row.get("first200ms") for row in history]
    best100_values = [row.get("best100ms") for row in history]
    slipstream_values = [row.get("slipstreamDistance") for row in history]

    return {
        "sampleSize": len(history),
        "averageFirst200ms": safe_average(first200_values),
        "bestFirst200ms": safe_min(first200_values),
        "averageBest100ms": safe_average(best100_values),
        "averageSlipstreamDistance": safe_average(slipstream_values),
    }
