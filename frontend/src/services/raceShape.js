const toFiniteNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeStartMethod = (startMethod) => {
  const normalized = String(startMethod || '').toLowerCase();
  return normalized.includes('volt') ? 'volt' : 'auto';
};

const getPostPosition = (horse) => {
  return toFiniteNumber(horse?.postPosition ?? horse?.number, 0) || 0;
};

const getStartSpeedScore = (horse) => {
  const postPosition = getPostPosition(horse);

  if (postPosition === 2 || postPosition === 3) {
    return 5;
  }
  if (postPosition >= 4 && postPosition <= 6) {
    return 4;
  }
  if (postPosition === 1) {
    return 3;
  }
  if (postPosition === 7 || postPosition === 8) {
    return 1;
  }
  if (postPosition >= 9) {
    return 0;
  }
  return 0;
};

const getTempoFlags = (horse) => {
  const tempoIndicator = horse?.tempoIndicator || horse?.horse?.tempoIndicator || null;
  const tempoSignals = horse?.tempoSignals || horse?.horse?.tempoSignals || null;
  const tempoMetrics = horse?.tempoMetrics || horse?.horse?.tempoMetrics || null;

  const indicatorLabel = typeof tempoIndicator === 'string'
    ? tempoIndicator
    : (tempoIndicator?.label || '');
  const indicatorStrength = typeof tempoIndicator?.strength === 'string' ? tempoIndicator.strength : '';

  const normalizedLabel = String(indicatorLabel).toLowerCase();
  const hasStartsnabb =
    normalizedLabel.includes('startsnabb') ||
    tempoSignals?.startsnabb === true ||
    Boolean(tempoSignals?.startsnabbStrength || tempoSignals?.startsnabb?.strength);
  const hasTempostark =
    normalizedLabel.includes('tempostark') ||
    tempoSignals?.tempostark === true ||
    Boolean(tempoSignals?.tempostarkStrength || tempoSignals?.tempostark?.strength);

  const startsnabbStrength =
    tempoSignals?.startsnabbStrength ||
    tempoSignals?.startsnabb?.strength ||
    (hasStartsnabb ? indicatorStrength : '');
  const tempostarkStrength =
    tempoSignals?.tempostarkStrength ||
    tempoSignals?.tempostark?.strength ||
    (hasTempostark ? indicatorStrength : '');

  const avgFirst200 = toFiniteNumber(tempoMetrics?.averageFirst200ms, null);
  const bestFirst200 = toFiniteNumber(tempoMetrics?.bestFirst200ms, null);
  const avgBest100 = toFiniteNumber(tempoMetrics?.averageBest100ms, null);

  return {
    hasStartsnabb,
    hasTempostark,
    startsnabbStrength,
    tempostarkStrength,
    avgFirst200,
    bestFirst200,
    avgBest100
  };
};

const getStrengthWeight = (strength) => {
  const normalized = String(strength || '').toLowerCase();
  if (normalized === 'stark') {
    return 1;
  }
  if (normalized === 'medel' || normalized === 'normal') {
    return 0.6;
  }
  return 0.3;
};

const getLeaderProfileBonus = (horse) => {
  const leadProfile = String(
    horse?.leadProfile ||
    horse?.horse?.leadProfile ||
    horse?.runningStyle ||
    horse?.horse?.runningStyle ||
    horse?.tipskommentar ||
    ''
  ).toLowerCase();

  if (/spets|ledning|front/.test(leadProfile)) {
    return 1.4;
  }
  if (/snabb ut|laddning/.test(leadProfile)) {
    return 0.8;
  }
  return 0;
};

const getAutoPostBonus = (postPosition) => {
  if (postPosition >= 1 && postPosition <= 3) {
    return 2.2;
  }
  if (postPosition >= 4 && postPosition <= 6) {
    return 1.2;
  }
  if (postPosition === 7) {
    return 0.3;
  }
  if (postPosition >= 8) {
    return -1.2;
  }
  return 0;
};

const getVoltPostBonus = (postPosition) => {
  if (postPosition >= 1 && postPosition <= 2) {
    return 1.5;
  }
  if (postPosition >= 3 && postPosition <= 5) {
    return 0.9;
  }
  if (postPosition >= 6 && postPosition <= 8) {
    return -0.3;
  }
  if (postPosition >= 9) {
    return -0.8;
  }
  return 0;
};

const getInsidePressurePenalty = (candidate, horses) => {
  const candidatePost = getPostPosition(candidate);
  if (!candidatePost) {
    return 0;
  }

  const pressureCount = (horses || []).filter((other) => {
    if (other === candidate) {
      return false;
    }
    const otherPost = getPostPosition(other);
    if (!otherPost || otherPost >= candidatePost) {
      return false;
    }

    const otherStart = getStartSpeedScore(other);
    const otherTempo = getTempoFlags(other);
    return otherStart >= 4 || otherTempo.hasStartsnabb;
  }).length;

  return pressureCount * 0.45;
};

const buildLeaderRanking = (horses = [], startMethod = 'auto') => {
  return horses
    .map((horse) => {
      const tempo = getTempoFlags(horse);
      const postPosition = getPostPosition(horse);
      const startScore = getStartSpeedScore(horse);
      const startsnabbBonus = tempo.hasStartsnabb ? (1.8 + getStrengthWeight(tempo.startsnabbStrength)) : 0;
      const profileBonus = getLeaderProfileBonus(horse);
      const postBonus = startMethod === 'volt'
        ? getVoltPostBonus(postPosition)
        : getAutoPostBonus(postPosition);
      const insidePressurePenalty = getInsidePressurePenalty(horse, horses);

      const leaderScore = Number((
        startScore * 1.35 +
        startsnabbBonus +
        profileBonus +
        postBonus -
        insidePressurePenalty
      ).toFixed(2));

      const isFastStarter = leaderScore >= 7.5 || (tempo.hasStartsnabb && startScore >= 4);

      return {
        horseNumber: horse?.number,
        horseName: horse?.name || '',
        leaderScore,
        isFastStarter,
        startSpeedScore: startScore,
        hasStartsnabb: tempo.hasStartsnabb
      };
    })
    .sort((a, b) => b.leaderScore - a.leaderScore);
};

const classifyTempoRisk = (leaderRanking = []) => {
  const fastStarters = leaderRanking.filter((candidate) => candidate.isFastStarter).length;

  if (fastStarters >= 3) {
    return { tempoRisk: 'high', fastStarterCount: fastStarters };
  }
  if (fastStarters === 2) {
    return { tempoRisk: 'medium', fastStarterCount: fastStarters };
  }
  return { tempoRisk: 'low', fastStarterCount: fastStarters };
};

const getLeaderDependentSignal = (horse) => {
  const text = String(
    horse?.tipskommentar ||
    horse?.leadProfile ||
    horse?.horse?.leadProfile ||
    ''
  ).toLowerCase();

  return /måste.*ledning|måste.*spets|spets.*slut|trivs i ledning/.test(text);
};

const getCloserSignal = (horse) => {
  const tempo = getTempoFlags(horse);
  const text = String(horse?.tipskommentar || '').toLowerCase();
  return tempo.hasTempostark || /avslut|spurta|stark till slut|speedig/.test(text);
};

export const buildRaceShape = (horses = [], raceContext = {}) => {
  const startMethod = normalizeStartMethod(raceContext?.startMethod);
  const leaderRanking = buildLeaderRanking(horses, startMethod);
  const leaderCandidate = leaderRanking[0] || null;
  const { tempoRisk, fastStarterCount } = classifyTempoRisk(leaderRanking);

  return {
    startMethod,
    leaderCandidate,
    leaderRanking,
    tempoRisk,
    fastStarterCount
  };
};

const getPositionRisk = (horse, raceShape) => {
  const postPosition = getPostPosition(horse);
  const startSpeedScore = getStartSpeedScore(horse);
  const method = normalizeStartMethod(raceShape?.startMethod);
  const isOutside = method === 'volt' ? postPosition >= 6 : postPosition >= 8;
  const isSlowAway = startSpeedScore <= 2;
  const tempo = getTempoFlags(horse);
  const hasStartsnabb = tempo.hasStartsnabb;

  let riskScore = 0;
  if (isSlowAway) {
    riskScore += 1.4;
  }
  if (isOutside) {
    riskScore += 1.2;
  }
  if (!hasStartsnabb) {
    riskScore += 0.7;
  }
  if (raceShape?.tempoRisk === 'low' && isSlowAway) {
    riskScore += 0.6;
  }

  if (riskScore >= 2.7) {
    return 'high';
  }
  if (riskScore >= 1.6) {
    return 'medium';
  }
  return 'low';
};

export const evaluateHorseRaceShapeImpact = (horse, raceShape) => {
  const leaderHorseNumber = raceShape?.leaderCandidate?.horseNumber;
  const isLeaderCandidate = Number(leaderHorseNumber) === Number(horse?.number);
  const needsLead = getLeaderDependentSignal(horse);
  const isCloser = getCloserSignal(horse);
  const positionRisk = getPositionRisk(horse, raceShape);

  let winnerStrengthAdjustment = 0;

  if (isLeaderCandidate) {
    winnerStrengthAdjustment += 5;
  }
  if (needsLead && !isLeaderCandidate) {
    winnerStrengthAdjustment -= 6;
  }
  if (raceShape?.tempoRisk === 'high' && isCloser) {
    winnerStrengthAdjustment += 4;
  }
  if (raceShape?.tempoRisk === 'low' && isCloser) {
    winnerStrengthAdjustment -= 4;
  }
  if (positionRisk === 'high') {
    winnerStrengthAdjustment -= 2;
  } else if (positionRisk === 'medium') {
    winnerStrengthAdjustment -= 1;
  }

  return {
    isLeaderCandidate,
    isCloser,
    needsLead,
    positionRisk,
    winnerStrengthAdjustment: Math.max(-8, Math.min(8, winnerStrengthAdjustment))
  };
};
