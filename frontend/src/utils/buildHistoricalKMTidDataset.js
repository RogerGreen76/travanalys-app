import { fetchKMTidRaceData } from '../services/fetchKMTidRaceData';
import { parseKMTidRacesArray, computeTimingFromIntervals } from '../services/parseKMTidToplist';

function toFiniteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeHorseName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+/g, '')
    .replace(/[\u2019\u2018]/g, "'");
}

function formatDateForKMTid(date) {
  const normalized = String(date || '').trim();
  const compact = normalized.replace(/-/g, '');

  if (/^\d{6}$/.test(compact)) {
    return compact;
  }

  if (/^\d{8}$/.test(compact)) {
    return compact.slice(2);
  }

  return null;
}

function toIsoDateFromCompact(compactDate) {
  const compact = String(compactDate || '').trim();
  if (!/^\d{6}$/.test(compact)) {
    return null;
  }
  return `20${compact.slice(0, 2)}-${compact.slice(2, 4)}-${compact.slice(4, 6)}`;
}

function getPreviousIsoDates(baseDate, days) {
  const compactBase = formatDateForKMTid(baseDate);
  const totalDays = Math.max(0, Number(days) || 0);
  if (!compactBase || totalDays === 0) {
    return [];
  }

  const year = Number(`20${compactBase.slice(0, 2)}`);
  const monthIndex = Number(compactBase.slice(2, 4)) - 1;
  const dayOfMonth = Number(compactBase.slice(4, 6));
  const base = new Date(year, monthIndex, dayOfMonth);
  if (!Number.isFinite(base.getTime())) {
    return [];
  }

  const dates = [];
  for (let offset = 0; offset < totalDays; offset += 1) {
    const current = new Date(base);
    current.setDate(base.getDate() - offset);
    const yy = String(current.getFullYear()).slice(-2);
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const iso = toIsoDateFromCompact(`${yy}${mm}${dd}`);
    if (iso) dates.push(iso);
  }

  return dates;
}

async function collectAvailableHistoricalEntries(dates, fetchRaw) {
  const entries = [];

  for (const date of dates) {
    try {
      const rawText = await fetchRaw(date);
      if (typeof rawText === 'string' && rawText.trim()) {
        console.log(`[KMTid] available date: ${date}`);
        console.log(`[KMTid] fetched raw length for ${date}:`, rawText?.length ?? 0);
        entries.push({ date, rawText });
      } else {
        console.log(`[KMTid] missing date: ${date}`);
      }
    } catch {
      // Missing/unavailable dates are expected and should never block the flow.
      console.log(`[KMTid] missing date: ${date}`);
    }
  }

  return entries;
}

export function summarizeNumeric(values = []) {
  const numericValues = values
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));

  if (numericValues.length === 0) {
    return {
      count: 0,
      mean: null,
      min: null
    };
  }

  const sum = numericValues.reduce((acc, value) => acc + value, 0);

  return {
    count: numericValues.length,
    mean: sum / numericValues.length,
    min: Math.min(...numericValues)
  };
}

export function computeStartMetrics(start) {
  const intervals = start?.timings?.intervals ?? [];
  const intervalDerived = computeTimingFromIntervals(intervals);

  // actualKMTime from intervals: mean of all interval durations.
  // Each interval covers 100m at ms/km pace, so mean(durations) ≈ overall race pace (ms/km).
  // slipstreamDistance is a positional field — not derivable from interval timings.
  let intervalDerivedKMTime = null;
  if (Array.isArray(intervals) && intervals.length > 0) {
    const durations = intervals.map(iv => Number(iv?.duration)).filter(d => Number.isFinite(d));
    if (durations.length > 0) {
      intervalDerivedKMTime = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    }
  }

  const first200ms = toFiniteNumberOrNull(
    start?.timings?.first200ms ??
    start?.timings?.first200Ms ??
    intervalDerived?.first200ms
  );

  const last200ms = toFiniteNumberOrNull(
    start?.timings?.last200ms ??
    start?.timings?.last200Ms ??
    intervalDerived?.last200ms
  );

  const best100ms = toFiniteNumberOrNull(
    start?.timings?.best100ms ??
    start?.timings?.best100Ms ??
    intervalDerived?.best100ms
  );

  return {
    first200ms,
    last200ms,
    best100ms,
    actualKMTime: toFiniteNumberOrNull(
      start?.timings?.actualKMTime ??
      start?.timings?.actualKmTime ??
      intervalDerivedKMTime
    ),
    slipstreamDistance: toFiniteNumberOrNull(start?.timings?.slipstreamDistance)
  };
}

export function extractHorseStartsFromRaces(races = [], date = null) {
  const starts = [];

  for (const race of races) {
    const raceId = race?.id ?? null;
    const raceNumber = toFiniteNumberOrNull(race?.number);
    const raceDate = String(race?.date || date || '').trim() || null;

    for (const start of race?.starts || []) {
      const horseName = String(start?.horse?.name || '').trim();
      const normalizedHorseName = normalizeHorseName(horseName);

      if (!normalizedHorseName) {
        continue;
      }

      const metrics = computeStartMetrics(start);

      starts.push({
        date: raceDate,
        raceId,
        raceNumber,
        horseName,
        normalizedHorseName,
        driverName: String(start?.driver?.name || '').trim() || null,
        ...metrics
      });
    }
  }

  return starts;
}

export function aggregateHorseHistory(starts = []) {
  const grouped = {};

  for (const start of starts) {
    const key = start?.normalizedHorseName;
    if (!key) {
      continue;
    }

    if (!grouped[key]) {
      grouped[key] = {
        horseName: start.horseName,
        sampleSize: 0,
        averageFirst200ms: null,
        bestFirst200ms: null,
        averageBest100ms: null,
        averageSlipstreamDistance: null,
        starts: []
      };
    }

    grouped[key].starts.push(start);
  }

  for (const horseKey of Object.keys(grouped)) {
    const horseHistory = grouped[horseKey];
    const first200Summary = summarizeNumeric(horseHistory.starts.map(start => start.first200ms));
    const best100Summary = summarizeNumeric(horseHistory.starts.map(start => start.best100ms));
    const slipstreamSummary = summarizeNumeric(horseHistory.starts.map(start => start.slipstreamDistance));

    // sampleSize: starts that have at least one usable metric (not all starts)
    horseHistory.sampleSize = horseHistory.starts.filter(
      start => start.first200ms !== null || start.best100ms !== null || start.slipstreamDistance !== null
    ).length;
    horseHistory.metricCounts = {
      first200ms: first200Summary.count,
      best100ms: best100Summary.count,
      slipstreamDistance: slipstreamSummary.count
    };
    horseHistory.averageFirst200ms = first200Summary.mean;
    horseHistory.bestFirst200ms = first200Summary.min;
    horseHistory.averageBest100ms = best100Summary.mean;
    horseHistory.averageSlipstreamDistance = slipstreamSummary.mean;
  }

  return grouped;
}

export function buildHistoricalKMTidDatasetFromEntries(entries = []) {
  const allStarts = [];

  for (const entry of entries || []) {
    const date = entry?.date ?? null;
    const rawText = entry?.rawText;

    if (typeof rawText !== 'string' || !rawText.trim()) {
      continue;
    }

    let races = [];
    try {
      races = parseKMTidRacesArray(rawText);
    } catch {
      races = [];
    }

    console.log(`[KMTid] parsed races for ${date}:`, Array.isArray(races) ? races.length : 0);

    if (!Array.isArray(races) || races.length === 0) {
      continue;
    }

    const starts = extractHorseStartsFromRaces(races, date);
    console.log(`[KMTid] extracted starts for ${date}:`, starts.length);
    allStarts.push(...starts);
  }

  const dataset = aggregateHorseHistory(allStarts);
  const horseKeys = Object.keys(dataset);
  console.log('[KMTid] total extracted starts:', allStarts.length);
  console.log('[KMTid] aggregated horses:', horseKeys.length);
  if (horseKeys[0]) {
    const firstKey = horseKeys[0];
    console.log('[KMTid] sample aggregated horse:', dataset[firstKey]);
  }
  return dataset;
}

export async function buildHistoricalKMTidDataset(dates = [], fetchRawForDate = null) {
  const incomingDates = [...new Set((dates || []).map(date => String(date || '').trim()).filter(Boolean))];
  const uniqueDates = incomingDates.length > 0
    ? incomingDates
    : getPreviousIsoDates(new Date().toISOString().slice(0, 10), 7);

  const fetchRaw = typeof fetchRawForDate === 'function'
    ? fetchRawForDate
    : async (date) => {
        const kmtidDate = formatDateForKMTid(date);
        if (!kmtidDate) {
          return null;
        }
        return fetchKMTidRaceData(kmtidDate);
      };

  const entries = await collectAvailableHistoricalEntries(uniqueDates, fetchRaw);

  return buildHistoricalKMTidDatasetFromEntries(entries);
}

/**
 * Debug/demo helper. Not used by production flow.
 *
 * Example usage:
 * const dates = ['2026-04-08', '2026-04-09', '2026-04-10'];
 * const dataset = await buildHistoricalKMTidDataset(dates);
 * const keys = Object.keys(dataset);
 * console.log('[KMTid Historical] horse count:', keys.length);
 * console.log('[KMTid Historical] sample 1:', dataset[keys[0]]);
 * console.log('[KMTid Historical] sample 2:', dataset[keys[1]]);
 *
 * Risks:
 * - normalized-name collisions can merge different horses with similar names
 * - very low sampleSize gives unstable averages
 * - missing interval data reduces metric completeness for some starts
 */
export async function runHistoricalKMTidDatasetDemo(dates = []) {
  const dataset = await buildHistoricalKMTidDataset(dates);
  const keys = Object.keys(dataset);
  console.log('[KMTid Historical] horse count:', keys.length);
  if (keys[0]) {
    console.log('[KMTid Historical] sample horse #1:', dataset[keys[0]]);
  }
  if (keys[1]) {
    console.log('[KMTid Historical] sample horse #2:', dataset[keys[1]]);
  }
  return dataset;
}

export default {
  normalizeHorseName,
  parseKMTidRacesArray,
  summarizeNumeric,
  computeStartMetrics,
  extractHorseStartsFromRaces,
  aggregateHorseHistory,
  buildHistoricalKMTidDatasetFromEntries,
  buildHistoricalKMTidDataset,
  runHistoricalKMTidDatasetDemo
};
