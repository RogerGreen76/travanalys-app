/**
 * Standalone runner: fetch today's V64 from ATG and run normalize+analyze pipeline.
 * All debug logging (RaceFinalDistribution, RankingScaleDebug, etc.) fires normally.
 * Usage: node run_v64_debug.mjs [optional-gameId]
 */

import { normalizeRaceData } from './frontend/src/services/normalizeRaceData.js';
import { analyzeRaceData }   from './frontend/src/services/analyzeRaceData.js';

const GAME_ID = process.argv[2] ?? 'V64_2026-04-09_32_4';
const ATG_BASE = 'https://horse-betting-info.prod.c1.atg.cloud/api-public/v0';

async function main() {
  console.log(`\n=== Fetching game: ${GAME_ID} ===\n`);

  const res = await fetch(`${ATG_BASE}/games/${GAME_ID}`);
  if (!res.ok) throw new Error(`ATG fetch failed: ${res.status} ${res.statusText}`);
  const raw = await res.json();

  const gameType = GAME_ID.split('_')[0]; // e.g. "V64"
  console.log(`gameType: ${gameType}  races: ${raw.races?.length ?? 0}\n`);

  // Inject betDistribution from the V64 pool into each start so the normalizer sees it
  for (const race of raw.races ?? []) {
    for (const start of race.starts ?? []) {
      if (!start.pools) continue;
      const v64Pool = start.pools[gameType] ?? start.pools[gameType.toLowerCase()] ?? start.pools[gameType.toUpperCase()];
      if (v64Pool?.betDistribution !== undefined) {
        start._v64BetDistribution = v64Pool.betDistribution; // informational
      }
    }
  }

  const normalized = normalizeRaceData(raw, gameType);
  analyzeRaceData(normalized);
}

main().catch(err => { console.error(err); process.exit(1); });
