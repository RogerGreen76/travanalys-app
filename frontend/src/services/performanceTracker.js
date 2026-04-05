const STORAGE_KEY = 'travanalys_performance_history';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const buildFallbackKey = (obj = {}) => {
  const date = obj.date || '';
  const gameType = obj.gameType || '';
  const raceLabel = obj.raceLabel || '';
  return `${date}__${gameType}__${raceLabel}`;
};

const findEntryIndex = (history, payload = {}) => {
  if (!Array.isArray(history) || history.length === 0) {
    return -1;
  }

  if (payload.raceId) {
    const raceIdIndex = history.findIndex(item =>
      item?.raceId && item.raceId === payload.raceId
    );

    if (raceIdIndex >= 0) {
      return raceIdIndex;
    }
  }

  const fallbackKey = buildFallbackKey(payload);
  if (!fallbackKey || fallbackKey === '__') {
    return -1;
  }

  return history.findIndex(item => buildFallbackKey(item) === fallbackKey);
};

const normalizeHorses = (horses = []) => {
  if (!Array.isArray(horses)) {
    return [];
  }

  return horses.map(horse => ({
    number: safeNumber(horse?.number),
    name: horse?.name || '',
    odds: safeNumber(horse?.odds),
    streckPercent: safeNumber(horse?.streckPercent),
    rankingScore: safeNumber(horse?.rankingScore),
    finalScore: safeNumber(horse?.finalScore),
    valueRatio: safeNumber(horse?.valueRatio),
    play: horse?.play || 'No play',
    valueStatus: horse?.valueStatus || 'Neutral'
  }));
};

const readHistory = () => {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }

    return parsed;
  } catch (error) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
};

const writeHistory = (history) => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

const computeWinnerModelData = (prediction, result) => {
  const horses = Array.isArray(prediction?.horses) ? prediction.horses : [];
  const winnerNumber = safeNumber(result?.winnerNumber);

  if (!horses.length || winnerNumber === null) {
    return {
      winnerModelRank: null,
      winnerHorse: null,
      winnerInTop1: false,
      winnerInTop3: false,
      winnerInTop5: false
    };
  }

  const sortedByModel = [...horses].sort((a, b) => {
    const finalDiff = (safeNumber(b.finalScore) || 0) - (safeNumber(a.finalScore) || 0);
    if (finalDiff !== 0) {
      return finalDiff;
    }

    return (safeNumber(b.rankingScore) || 0) - (safeNumber(a.rankingScore) || 0);
  });

  const winnerIndex = sortedByModel.findIndex(h => safeNumber(h.number) === winnerNumber);
  const winnerModelRank = winnerIndex >= 0 ? winnerIndex + 1 : null;
  const winnerHorse = horses.find(h => safeNumber(h.number) === winnerNumber) || null;

  return {
    winnerModelRank,
    winnerHorse,
    winnerInTop1: winnerModelRank === 1,
    winnerInTop3: winnerModelRank !== null && winnerModelRank <= 3,
    winnerInTop5: winnerModelRank !== null && winnerModelRank <= 5
  };
};

export const mergePredictionWithResult = (prediction, result) => {
  if (!prediction && !result) {
    return null;
  }

  const normalizedPrediction = prediction
    ? {
        ...prediction,
        horses: normalizeHorses(prediction.horses),
        createdAt: prediction.createdAt || new Date().toISOString()
      }
    : null;

  const normalizedResult = result
    ? {
        ...result,
        winnerNumber: safeNumber(result.winnerNumber),
        top3Numbers: Array.isArray(result.top3Numbers)
          ? result.top3Numbers.map(safeNumber).filter(v => v !== null)
          : [],
        resultFetchedAt: result.resultFetchedAt || new Date().toISOString()
      }
    : null;

  const winnerData = computeWinnerModelData(normalizedPrediction, normalizedResult);

  return {
    date: normalizedPrediction?.date || normalizedResult?.date || '',
    gameType: normalizedPrediction?.gameType || normalizedResult?.gameType || '',
    raceId: normalizedPrediction?.raceId || normalizedResult?.raceId || null,
    raceLabel: normalizedPrediction?.raceLabel || normalizedResult?.raceLabel || '',
    track: normalizedPrediction?.track || '',
    prediction: normalizedPrediction,
    result: normalizedResult,
    ...winnerData,
    updatedAt: new Date().toISOString()
  };
};

export const saveRacePrediction = (snapshot) => {
  console.log('saveRacePrediction called with:', snapshot);

  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const history = readHistory();

  const normalizedPrediction = {
    date: snapshot.date || '',
    gameType: snapshot.gameType || '',
    raceId: snapshot.raceId || null,
    raceLabel: snapshot.raceLabel || '',
    track: snapshot.track || '',
    horses: normalizeHorses(snapshot.horses),
    createdAt: snapshot.createdAt || new Date().toISOString()
  };

  const existingIndex = findEntryIndex(history, normalizedPrediction);
  const existing = existingIndex >= 0 ? history[existingIndex] : null;

  const mergedEntry = mergePredictionWithResult(
    normalizedPrediction,
    existing?.result || null
  );

  if (existingIndex >= 0) {
    history[existingIndex] = mergedEntry;
  } else {
    history.push(mergedEntry);
  }

  writeHistory(history);
  console.log('Saved history:', JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  return mergedEntry;
};

export const saveRaceResult = (result) => {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const history = readHistory();

  const normalizedResult = {
    date: result.date || '',
    gameType: result.gameType || '',
    raceId: result.raceId || null,
    raceLabel: result.raceLabel || '',
    winnerNumber: safeNumber(result.winnerNumber),
    top3Numbers: Array.isArray(result.top3Numbers)
      ? result.top3Numbers.map(safeNumber).filter(v => v !== null)
      : [],
    resultFetchedAt: result.resultFetchedAt || new Date().toISOString()
  };

  const existingIndex = findEntryIndex(history, normalizedResult);
  const existing = existingIndex >= 0 ? history[existingIndex] : null;

  const mergedEntry = mergePredictionWithResult(
    existing?.prediction || null,
    normalizedResult
  );

  if (existingIndex >= 0) {
    history[existingIndex] = mergedEntry;
  } else {
    history.push(mergedEntry);
  }

  writeHistory(history);
  return mergedEntry;
};

export const fetchRaceResult = async (gameId) => {
  if (!gameId) {
    return null;
  }

  try {
    const url = `/api/atg/result?gameId=${encodeURIComponent(gameId)}`;
    console.log('Result URL:', url);

    const response = await fetch(url, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    console.log('Frontend result raw text:', text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse result JSON:', text);
      return null;
    }

    console.log('Frontend result parsed:', data);
    const status = String(data?.status || '').toLowerCase();
    if (status !== 'results') {
      console.log('No finished result for:', gameId, data?.status);
      return null;
    }

    const winnerNumber = safeNumber(
      data?.pools?.vinnare?.result?.winners?.[0]?.number
    );
    if (winnerNumber === null) {
      return null;
    }

    const first = safeNumber(data?.pools?.plats?.result?.winners?.first?.[0]?.number);
    const second = safeNumber(data?.pools?.plats?.result?.winners?.second?.[0]?.number);
    const third = safeNumber(data?.pools?.plats?.result?.winners?.third?.[0]?.number);

    const top3Numbers = [first, second, third].filter(v => v !== null);

    return {
      winnerNumber,
      top3Numbers,
      resultFetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn('[PerformanceTracker] fetchRaceResult failed:', error);
    return null;
  }
};

export const syncMissingResults = async (historyInput = null) => {
  const history = Array.isArray(historyInput) ? historyInput : getPerformanceHistory();
  const candidates = history.filter(item =>
    item?.prediction && safeNumber(item?.result?.winnerNumber) === null
  );

  let checked = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of candidates) {
    console.log('Checking history row:', item);
    checked += 1;

    if (!item?.raceId || !item?.gameType) {
      skipped += 1;
      continue;
    }

    const gameId = `${item.gameType}_${item.raceId}`;
    console.log('Fetching result for:', item.gameType, item.raceId);
    const fetched = await fetchRaceResult(gameId);
    if (!fetched || safeNumber(fetched.winnerNumber) === null) {
      skipped += 1;
      continue;
    }

    console.log('Saving result:', {
      raceId: item.raceId,
      winnerNumber: fetched.winnerNumber,
      top3Numbers: fetched.top3Numbers
    });

    saveRaceResult({
      date: item.date,
      gameType: item.gameType,
      raceId: item.raceId,
      raceLabel: item.raceLabel,
      winnerNumber: fetched.winnerNumber,
      top3Numbers: fetched.top3Numbers,
      resultFetchedAt: fetched.resultFetchedAt || new Date().toISOString()
    });

    updated += 1;
  }

  return {
    checked,
    updated,
    skipped
  };
};

export const getPerformanceHistory = () => {
  const history = readHistory();
  console.log('Loaded history from localStorage:', history);

  return [...history].sort((a, b) => {
    const aTime = new Date(a?.result?.resultFetchedAt || a?.prediction?.createdAt || a?.updatedAt || 0).getTime();
    const bTime = new Date(b?.result?.resultFetchedAt || b?.prediction?.createdAt || b?.updatedAt || 0).getTime();
    return bTime - aTime;
  });
};

export const getPerformanceStats = () => {
  const history = getPerformanceHistory();
  // totalRaces = every stored prediction regardless of result
  const totalRaces = history.filter(item => item?.prediction).length;
  // completed = entries where a winner number has been recorded
  const completed = history.filter(item => item?.prediction && safeNumber(item?.result?.winnerNumber) !== null);
  const winnerTop1 = completed.filter(item => item.winnerInTop1).length;
  const winnerTop3 = completed.filter(item => item.winnerInTop3).length;
  const winnerTop5 = completed.filter(item => item.winnerInTop5).length;
  const valueWinners = completed.filter(item => item?.winnerHorse?.valueStatus === 'Spelvärd').length;
  const starkPlayWinners = completed.filter(item => item?.winnerHorse?.play === 'Stark play').length;
  const möjligPlayWinners = completed.filter(item => item?.winnerHorse?.play === 'Möjlig play').length;

  const winnerRanks = completed
    .map(item => safeNumber(item.winnerModelRank))
    .filter(v => v !== null);

  const winnerFinalScores = completed
    .map(item => safeNumber(item?.winnerHorse?.finalScore))
    .filter(v => v !== null);

  const averageWinnerRank = winnerRanks.length
    ? Number((winnerRanks.reduce((sum, v) => sum + v, 0) / winnerRanks.length).toFixed(2))
    : null;

  const averageWinnerFinalScore = winnerFinalScores.length
    ? Number((winnerFinalScores.reduce((sum, v) => sum + v, 0) / winnerFinalScores.length).toFixed(2))
    : null;

  return {
    totalRaces,
    winnerTop1,
    winnerTop3,
    winnerTop5,
    valueWinners,
    starkPlayWinners,
    möjligPlayWinners,
    averageWinnerRank,
    averageWinnerFinalScore
  };
};
