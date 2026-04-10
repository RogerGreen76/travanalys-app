import { normalizeHorseName } from './buildHistoricalKMTidDataset';

function buildHistoryPayload(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    sampleSize: entry.sampleSize ?? null,
    averageFirst200ms: entry.averageFirst200ms ?? null,
    bestFirst200ms: entry.bestFirst200ms ?? null,
    averageBest100ms: entry.averageBest100ms ?? null
  };
}

export function attachKMTidHistoryToRace(race, historicalDataset) {
  if (!race || typeof race !== 'object') {
    return race;
  }

  const starts = Array.isArray(race.starts) ? race.starts : [];
  const dataset = historicalDataset && typeof historicalDataset === 'object'
    ? historicalDataset
    : {};

  return {
    ...race,
    starts: starts.map(horse => {
      const key = normalizeHorseName(horse?.name);
      const entry = key ? dataset[key] : null;

      return {
        ...horse,
        kmtidHistory: buildHistoryPayload(entry)
      };
    })
  };
}

export function attachKMTidHistoryToRaces(races, historicalDataset) {
  if (!Array.isArray(races)) {
    return [];
  }

  return races.map(race => attachKMTidHistoryToRace(race, historicalDataset));
}

export default {
  attachKMTidHistoryToRace,
  attachKMTidHistoryToRaces
};
