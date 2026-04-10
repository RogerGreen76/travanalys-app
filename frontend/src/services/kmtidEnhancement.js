import { fetchKMTidRaceData } from './fetchKMTidRaceData';
import { extractKMTidTimingEntries, parseKMTidRacesArray, kmTimeMsToString, computeTimingFromIntervals } from './parseKMTidToplist';

function normalizeHorseName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildKMTidEntryMap(entries = []) {
  const entryMap = new Map();

  for (const entry of entries) {
    const horseName = normalizeHorseName(entry?.horseName);
    if (!horseName || entryMap.has(horseName)) {
      continue;
    }

    entryMap.set(horseName, entry);
  }

  return entryMap;
}

export function getKMTidStartSpeedScore(first200ms) {
  const value = Number(first200ms);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (value < 65000) {
    return 5;
  }

  if (value < 67000) {
    return 4;
  }

  if (value < 69000) {
    return 3;
  }

  if (value < 72000) {
    return 2;
  }

  return 1;
}

export function enrichHorseWithKMTid(horse, kmtidEntryMap) {
  // kmtidEntryMap can be:
  //   (a) Map<raceId, Map<normalizedHorseName, entry>>  — new race-keyed map
  //   (b) Map<normalizedHorseName, entry>               — old flat map (fallback)
  // raceId is optional; when provided we look up the specific race sub-map first.
  const horseName = normalizeHorseName(horse?.name);
  if (!horseName) return horse;

  let match = null;

  if (arguments.length >= 3) {
    // New path: race-keyed map with raceId
    const raceId = arguments[2];
    const raceSubMap = kmtidEntryMap.get(raceId);
    if (raceSubMap) {
      match = raceSubMap.get(horseName) ?? null;
    }
    if (!match) {
      // Fallback: try raceNumber extracted from raceId (e.g. "2026-03-07_18_7" → "num:7")
      const raceNum = raceId ? Number(String(raceId).split('_').pop()) : NaN;
      if (Number.isFinite(raceNum)) {
        const numSubMap = kmtidEntryMap.get(`num:${raceNum}`);
        if (numSubMap) match = numSubMap.get(horseName) ?? null;
      }
    }
  } else {
    // Old flat-map path (backward compat)
    match = kmtidEntryMap.get(horseName) ?? null;
  }

  if (!match) return horse;

  return {
    ...horse,
    kmtidFirst200: match.first200 ?? null,
    kmtidStartSpeedScore: getKMTidStartSpeedScore(match.first200ms),
    kmtidFirst200ms: match.first200ms ?? null
  };
}

/**
 * Build a race-keyed horse map from the parsed `races` array (Loppstatistik source).
 * Returns Map<raceId, Map<normalizedHorseName, entry>>
 * Also indexes by "num:{raceNumber}" as a fallback key.
 */
export function buildKMTidRaceHorseMap(racesArray) {
  const raceMap = new Map();

  for (const race of (racesArray || [])) {
    const raceId = race?.id ?? null;
    const raceNumber = race?.number ?? null;

    const horseMap = new Map();
    for (const start of (race?.starts || [])) {
      const horseName = normalizeHorseName(start?.horse?.name);
      if (!horseName) continue;

      const intervals = start?.timings?.intervals ?? [];
      const { first200ms, last200ms, best100ms } = computeTimingFromIntervals(intervals);

      horseMap.set(horseName, {
        horseName: start?.horse?.name ?? null,
        driverName: start?.driver?.name ?? null,
        startNumber: start?.number ?? null,
        result: start?.result ?? null,
        raceId,
        raceNumber,
        first200ms,
        first200: kmTimeMsToString(first200ms),
        last200ms,
        last200: kmTimeMsToString(last200ms),
        best100ms,
        best100: kmTimeMsToString(best100ms)
      });
    }

    if (raceId) raceMap.set(raceId, horseMap);
    if (raceNumber != null) raceMap.set(`num:${raceNumber}`, horseMap);
  }

  return raceMap;
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

export async function fetchKMTidEntryMap(date) {
  const kmtidDate = formatDateForKMTid(date);
  console.log('[KMTid] derived date:', kmtidDate ?? `(null — could not parse "${date}")`);
  if (!kmtidDate) {
    return new Map();
  }

  try {
    const rawText = await fetchKMTidRaceData(kmtidDate);
    if (!rawText) {
      return new Map();
    }

    // Prefer the complete races array (all starters per race, race-keyed)
    const racesArray = parseKMTidRacesArray(rawText);
    if (racesArray.length > 0) {
      console.log(`[KMTid] parsed ${racesArray.length} race(s) from races array`);
      return buildKMTidRaceHorseMap(racesArray);
    }

    // Fallback: toplist-based flat map (only fastest horses)
    console.warn('[KMTid] races array empty, falling back to toplist flat map');
    const entries = extractKMTidTimingEntries(rawText);
    return buildKMTidEntryMap(entries);
  } catch (error) {
    console.warn('[KMTid] optional enhancement unavailable', {
      date: kmtidDate,
      error: error?.message || String(error)
    });
    return new Map();
  }
}