import { fetchKMTidRaceData } from './fetchKMTidRaceData';
import { extractKMTidTimingEntries } from './parseKMTidToplist';

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
  const match = kmtidEntryMap.get(normalizeHorseName(horse?.name));
  if (!match) {
    return horse;
  }

  return {
    ...horse,
    kmtidFirst200: match.first200 ?? null,
    kmtidStartSpeedScore: getKMTidStartSpeedScore(match.first200ms),
    kmtidFirst200ms: match.first200ms ?? null
  };
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