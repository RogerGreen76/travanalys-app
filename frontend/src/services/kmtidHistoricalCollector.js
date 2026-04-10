import { fetchKMTidRaceData } from './fetchKMTidRaceData';
import {
  computeTimingFromIntervals,
  kmTimeMsToString,
  parseKMTidRacesArray
} from './parseKMTidToplist';

function normalizeHorseName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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

function normalizeIsoDate(input, fallbackKmtidDate) {
  const text = String(input || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{6}$/.test(text)) {
    const yy = text.slice(0, 2);
    const mm = text.slice(2, 4);
    const dd = text.slice(4, 6);
    return `20${yy}-${mm}-${dd}`;
  }

  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  if (fallbackKmtidDate && /^\d{6}$/.test(fallbackKmtidDate)) {
    const yy = fallbackKmtidDate.slice(0, 2);
    const mm = fallbackKmtidDate.slice(2, 4);
    const dd = fallbackKmtidDate.slice(4, 6);
    return `20${yy}-${mm}-${dd}`;
  }

  return null;
}

function toNumberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function median(values = []) {
  const sorted = values
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function average(values = []) {
  const numbers = values
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));

  if (numbers.length === 0) {
    return null;
  }

  const sum = numbers.reduce((acc, value) => acc + value, 0);
  return sum / numbers.length;
}

/**
 * Extract full horse starts from KM-tid races array for one date.
 * @param {Array} racesArray
 * @param {string} requestedDate
 * @param {string} kmtidDate
 * @returns {Array<object>}
 */
export function extractKMTidHistoricalStartsFromRaces(racesArray, requestedDate, kmtidDate) {
  const starts = [];

  for (const race of racesArray || []) {
    const raceDate = normalizeIsoDate(race?.date, kmtidDate) || normalizeIsoDate(requestedDate, kmtidDate);
    const raceId = race?.id ?? null;
    const raceNumber = toNumberOrNull(race?.number);

    for (const start of race?.starts || []) {
      const horseName = String(start?.horse?.name || '').trim();
      if (!horseName) {
        continue;
      }

      const intervals = start?.timings?.intervals || [];
      const timing = computeTimingFromIntervals(intervals);

      const first200ms = toNumberOrNull(
        start?.timings?.first200ms ??
        start?.timings?.first200Ms ??
        timing?.first200ms
      );
      const best100ms = toNumberOrNull(
        start?.timings?.best100ms ??
        start?.timings?.best100Ms ??
        timing?.best100ms
      );
      const last200ms = toNumberOrNull(
        start?.timings?.last200ms ??
        start?.timings?.last200Ms ??
        timing?.last200ms
      );

      const historicalStart = {
        date: raceDate,
        raceId,
        raceNumber,
        horseName,
        driverName: String(start?.driver?.name || '').trim() || null,
        result: toNumberOrNull(start?.result),
        first200ms,
        first200: kmTimeMsToString(first200ms),
        best100ms,
        best100: kmTimeMsToString(best100ms),
        last200ms,
        last200: kmTimeMsToString(last200ms),
        actualKMTime: (start?.timings?.actualKMTime ?? start?.timings?.actualKmTime ?? null),
        slipstreamDistance: toNumberOrNull(start?.timings?.slipstreamDistance)
      };

      starts.push(historicalStart);
    }
  }

  return starts;
}

/**
 * Fetch and parse historical KM-tid starts from multiple dates.
 * Dates can be YYYY-MM-DD, YYMMDD, or YYYYMMDD.
 * @param {string[]} dates
 * @returns {Promise<{ starts: Array<object>, perDate: Array<object>, missingDates: string[], failedDates: Array<object> }>}
 */
export async function collectKMTidHistoricalStartsForDates(dates = []) {
  const uniqueDates = [...new Set((dates || []).map(date => String(date || '').trim()).filter(Boolean))];

  const perDate = [];
  const failedDates = [];
  const missingDates = [];
  const starts = [];

  for (const inputDate of uniqueDates) {
    const kmtidDate = formatDateForKMTid(inputDate);
    if (!kmtidDate) {
      failedDates.push({ date: inputDate, error: 'invalid-date-format' });
      continue;
    }

    try {
      const rawText = await fetchKMTidRaceData(kmtidDate);
      if (!rawText) {
        missingDates.push(inputDate);
        continue;
      }

      const racesArray = parseKMTidRacesArray(rawText);
      const startsForDate = extractKMTidHistoricalStartsFromRaces(racesArray, inputDate, kmtidDate);

      perDate.push({
        requestedDate: inputDate,
        kmtidDate,
        raceCount: racesArray.length,
        startCount: startsForDate.length
      });

      starts.push(...startsForDate);
    } catch (error) {
      failedDates.push({
        date: inputDate,
        kmtidDate,
        error: error?.message || String(error)
      });
    }
  }

  return {
    starts,
    perDate,
    missingDates,
    failedDates
  };
}

/**
 * Build horse-keyed historical dataset from starts.
 * Key is normalized horse name; value contains canonical display name and starts list.
 * @param {Array<object>} starts
 * @returns {Map<string, { horseName: string, starts: Array<object> }>}
 */
export function buildKMTidHistoricalHorseDataset(starts = []) {
  const byHorse = new Map();

  for (const start of starts || []) {
    const horseName = String(start?.horseName || '').trim();
    const key = normalizeHorseName(horseName);
    if (!key) {
      continue;
    }

    if (!byHorse.has(key)) {
      byHorse.set(key, {
        horseName,
        starts: []
      });
    }

    byHorse.get(key).starts.push(start);
  }

  for (const [, entry] of byHorse) {
    entry.starts.sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
  }

  return byHorse;
}

/**
 * Compute simple historical KM-tid metrics for one horse from its starts array.
 * @param {Array<object>} starts
 * @returns {{ averageFirst200ms: number|null, medianFirst200ms: number|null, bestFirst200ms: number|null, averageBest100ms: number|null, averageSlipstreamDistance: number|null, sampleSize: number }}
 */
export function computeKMTidHistoricalMetrics(starts = []) {
  const first200Values = starts.map(start => start?.first200ms).filter(Number.isFinite);
  const best100Values = starts.map(start => start?.best100ms).filter(Number.isFinite);
  const slipstreamValues = starts.map(start => start?.slipstreamDistance).filter(Number.isFinite);

  return {
    averageFirst200ms: average(first200Values),
    medianFirst200ms: median(first200Values),
    bestFirst200ms: first200Values.length ? Math.min(...first200Values) : null,
    averageBest100ms: average(best100Values),
    averageSlipstreamDistance: average(slipstreamValues),
    sampleSize: starts.length
  };
}

/**
 * Build horse dataset and attach computed metrics.
 * @param {Map<string, { horseName: string, starts: Array<object> }>} byHorse
 * @returns {Map<string, { horseName: string, starts: Array<object>, metrics: object }>}
 */
export function attachKMTidHistoricalMetrics(byHorse = new Map()) {
  const result = new Map();

  for (const [horseKey, horseData] of byHorse.entries()) {
    result.set(horseKey, {
      ...horseData,
      metrics: computeKMTidHistoricalMetrics(horseData?.starts || [])
    });
  }

  return result;
}

/**
 * End-to-end helper: fetch historical KM-tid dates and build horse-keyed dataset with metrics.
 * @param {string[]} dates
 * @returns {Promise<{ byHorse: Map<string, object>, starts: Array<object>, perDate: Array<object>, missingDates: string[], failedDates: Array<object> }>}
 */
export async function collectKMTidHistoricalDataset(dates = []) {
  const collection = await collectKMTidHistoricalStartsForDates(dates);
  const byHorse = buildKMTidHistoricalHorseDataset(collection.starts);
  const byHorseWithMetrics = attachKMTidHistoricalMetrics(byHorse);

  return {
    byHorse: byHorseWithMetrics,
    starts: collection.starts,
    perDate: collection.perDate,
    missingDates: collection.missingDates,
    failedDates: collection.failedDates
  };
}

export default {
  extractKMTidHistoricalStartsFromRaces,
  collectKMTidHistoricalStartsForDates,
  buildKMTidHistoricalHorseDataset,
  computeKMTidHistoricalMetrics,
  attachKMTidHistoricalMetrics,
  collectKMTidHistoricalDataset
};
