/**
 * KM-tid Tempo Profile Utility
 *
 * Computes simple tempo characteristics per horse from a historical KM-tid dataset
 * as returned by buildHistoricalKMTidDataset().
 *
 * Pure functions only — no API calls, no UI code, no scoring integration.
 */

// ─── Internal helpers ──────────────────────────────────────────────────────────

function toFiniteNumbers(values) {
  return (values || []).map(v => Number(v)).filter(v => Number.isFinite(v));
}

function computeMean(values) {
  const nums = toFiniteNumbers(values);
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function computeStdDev(values) {
  const nums = toFiniteNumbers(values);
  if (nums.length < 2) return null;
  const mean = nums.reduce((sum, v) => sum + v, 0) / nums.length;
  const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear normalization: maps value from [domainMin, domainMax] onto [0, 1].
 * Returns null if value is not finite.
 */
export function normalizeScore(value, domainMin, domainMax) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (domainMax === domainMin) return 0;
  return clamp((v - domainMin) / (domainMax - domainMin), 0, 1);
}

// ─── Individual component calculators ──────────────────────────────────────────

/**
 * Start speed score based on bestFirst200ms and averageFirst200ms.
 * Lower ms = faster = higher score. Both inputs contribute equally when available.
 * Formula: clamp( (9000 - ms) / 1500, 0, 1 )
 * Typical competitive range: ~63000–67000 ms → maps to low values because the
 * formula uses raw ms/km units where 9000 is far below any real value.
 *
 * NOTE: KM-tid durations are ms/km (e.g. ~64000–72000). The normalization
 * formula below is written to work in that domain:
 *   clamp( (72000 - ms) / 9000, 0, 1 )
 * This maps 63000 → 1.0, 72000 → 0.0.
 */
function computeStartSpeedScore(bestFirst200ms, averageFirst200ms) {
  const scoreFrom = (ms) => {
    if (!Number.isFinite(Number(ms))) return null;
    return clamp((72000 - Number(ms)) / 9000, 0, 1);
  };

  const bestScore = scoreFrom(bestFirst200ms);
  const avgScore = scoreFrom(averageFirst200ms);

  if (bestScore !== null && avgScore !== null) {
    // Weight best performance slightly higher than average
    return Number((bestScore * 0.55 + avgScore * 0.45).toFixed(4));
  }
  if (bestScore !== null) return Number(bestScore.toFixed(4));
  if (avgScore !== null) return Number(avgScore.toFixed(4));
  return null;
}

/**
 * Late speed score based on averageBest100ms.
 * Lower ms = faster = higher score.
 * Domain: 60000 (elite) – 72000 (slow).
 */
function computeLateSpeedScore(averageBest100ms) {
  const ms = Number(averageBest100ms);
  if (!Number.isFinite(ms)) return null;
  return Number(clamp((72000 - ms) / 12000, 0, 1).toFixed(4));
}

/**
 * Consistency score based on standard deviation of first200ms values across starts.
 * Lower stdDev = more consistent = higher score.
 * clamp( 1 - (stdDev / 1200), 0, 1 )
 */
function computeConsistencyScore(starts) {
  const first200Values = (starts || [])
    .map(s => Number(s?.first200ms))
    .filter(v => Number.isFinite(v));

  if (first200Values.length < 2) return null;

  const stdDev = computeStdDev(first200Values);
  if (stdDev === null) return null;

  return Number(clamp(1 - stdDev / 1200, 0, 1).toFixed(4));
}

/**
 * Reliability score based on sample size.
 * 1 → 0.2, 2 → 0.4, 3 → 0.6, 4 → 0.8, 5+ → 1.0
 */
function computeReliability(sampleSize) {
  const n = Number(sampleSize);
  if (!Number.isFinite(n) || n < 1) return 0;
  if (n >= 5) return 1.0;
  return Number((n * 0.2).toFixed(1));
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute a tempo profile for every horse in the historical KM-tid dataset.
 *
 * @param {Object} dataset - Output of buildHistoricalKMTidDataset()
 * @returns {Object} { [normalizedHorseName]: { horseName, sampleSize, startSpeedScore,
 *                     lateSpeedScore, consistencyScore, reliability } }
 */
export function computeTempoProfile(dataset) {
  if (!dataset || typeof dataset !== 'object') return {};

  const result = {};

  for (const key of Object.keys(dataset)) {
    const entry = dataset[key];
    if (!entry) continue;

    const sampleSize = Number(entry.sampleSize);
    if (!Number.isFinite(sampleSize) || sampleSize < 1) continue;

    const startSpeedScore = computeStartSpeedScore(
      entry.bestFirst200ms,
      entry.averageFirst200ms
    );

    const lateSpeedScore = computeLateSpeedScore(entry.averageBest100ms);

    const consistencyScore = computeConsistencyScore(entry.starts);

    const reliability = computeReliability(sampleSize);

    result[key] = {
      horseName: entry.horseName ?? key,
      sampleSize,
      startSpeedScore,
      lateSpeedScore,
      consistencyScore,
      reliability
    };
  }

  return result;
}

// ─── Debug helper ──────────────────────────────────────────────────────────────

/**
 * Debug helper — logs the first 5 horses from a tempo profile.
 * Not used in the production flow.
 *
 * @param {Object} dataset - Output of buildHistoricalKMTidDataset()
 */
export function debugTempoProfile(dataset) {
  const profile = computeTempoProfile(dataset);
  const keys = Object.keys(profile);
  console.log('[KMTid TempoProfile] horse count:', keys.length);
  keys.slice(0, 5).forEach((key, i) => {
    console.log(`[KMTid TempoProfile] horse #${i + 1}:`, profile[key]);
  });
  return profile;
}

export default {
  normalizeScore,
  computeTempoProfile,
  debugTempoProfile
};
