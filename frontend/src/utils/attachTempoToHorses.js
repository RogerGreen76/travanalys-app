import { normalizeHorseName } from './buildHistoricalKMTidDataset';

function buildTempoPayload(profileEntry) {
  if (!profileEntry || typeof profileEntry !== 'object') {
    return null;
  }

  return {
    startSpeedScore: profileEntry.startSpeedScore ?? null,
    lateSpeedScore: profileEntry.lateSpeedScore ?? null,
    consistencyScore: profileEntry.consistencyScore ?? null,
    reliability: profileEntry.reliability ?? null
  };
}

export function attachTempoToHorses(race, tempoProfile) {
  if (!race || typeof race !== 'object') {
    return race;
  }

  const starts = Array.isArray(race.starts) ? race.starts : [];
  const profile = tempoProfile && typeof tempoProfile === 'object' ? tempoProfile : {};

  return {
    ...race,
    starts: starts.map(horse => {
      const normalizedHorseName = normalizeHorseName(horse?.name);
      const profileEntry = normalizedHorseName ? profile[normalizedHorseName] : null;

      return {
        ...horse,
        tempo: buildTempoPayload(profileEntry)
      };
    })
  };
}

export function attachTempoToRaces(races, tempoProfile) {
  if (!Array.isArray(races)) {
    return [];
  }

  return races.map(race => attachTempoToHorses(race, tempoProfile));
}

export default {
  attachTempoToHorses,
  attachTempoToRaces
};
