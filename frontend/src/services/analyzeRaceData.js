/**
 * Race Data Analysis Service
 * Analyzes normalized race data and adds scoring metrics
 */

/**
 * Analyze normalized race data and add scoring metrics to horses
 * @param {Object} normalizedData - Normalized race data
 * @returns {Object} Analyzed race data with scoring metrics
 */
export const analyzeRaceData = (normalizedData) => {
  try {
    if (!normalizedData || !normalizedData.races) {
      throw new Error('Invalid normalized data: missing races array');
    }

    // Analyze each race
    const analyzedRaces = normalizedData.races.map(race => {
      if (!race.horses || !Array.isArray(race.horses)) {
        console.warn(`Race ${race.raceNumber} missing horses array, skipping analysis`);
        return race;
      }

      const raceContext = buildRaceContext(race, race.horses);

      // Analyze horses in this race
      const analyzedHorses = analyzeHorses(race.horses, raceContext);

      return {
        ...race,
        horses: analyzedHorses
      };
    });

    return {
      ...normalizedData,
      races: analyzedRaces
    };

  } catch (error) {
    console.error('Error analyzing race data:', error);
    throw new Error(`Failed to analyze race data: ${error.message}`);
  }
};

/**
 * Analyze horses in a single race
 * @param {Array} horses - Array of normalized horse objects
 * @returns {Array} Array of analyzed horse objects with scoring metrics
 */
const analyzeHorses = (horses, raceContext) => {
  return horses.map(horse => analyzeHorse(horse, raceContext, horses));
};

const buildRaceContext = (race, horses) => {
  const raceType = classifyRaceType(horses);
  const { modelWeight, marketWeight } = getCalibrationWeights(raceType);
  const avgOdds = horses.reduce((sum, h) => sum + h.odds, 0) / horses.length;

  return {
    raceType,
    modelWeight,
    marketWeight,
    avgOdds,
    distance: race?.distance ?? null,
    startMethod: race?.startMethod ?? null
  };
};

const analyzeHorse = (horse, raceContext, horses) => {
  const componentScores = getComponentScores(horse, raceContext, horses);
  const aggregateScores = getExistingAggregateScores(horse, componentScores, raceContext);

  console.log(
  horse.name,
  {
    startSpeed: componentScores.startSpeedScore,
    strength: componentScores.strengthScore,
    pace: componentScores.paceScenarioScore,
    ranking: aggregateScores.rankingScore,
    final: aggregateScores.finalScore
  }
);

  return {
    ...horse,
    ...aggregateScores,
    startSpeedScore: componentScores.startSpeedScore,
    strengthScore: componentScores.strengthScore,
    distanceScore: componentScores.distanceScore,
    formScore: componentScores.formScore,
    driverScore: componentScores.driverScore,
    paceScenarioScore: componentScores.paceScenarioScore,
    gallopRiskScore: componentScores.gallopRiskScore,
    leadPotentialScore: componentScores.leadPotentialScore,
    leadCompetitionScore: componentScores.leadCompetitionScore
  };
};

const getHorseBaseMetrics = (horse, raceContext) => {
  const odds = horse.odds / 100; // e.g. 450 -> 4.50
  const streckPercent = horse.betDistribution / 100; // e.g. 1405 -> 14.05%
  const impliedProbability = (1 / odds) * 100; // in percent
  const streckDecimal = streckPercent / 100;
  const valueGap = (impliedProbability / 100) - streckDecimal;

  // Market probability
  const marketProbability = (1 / odds) * 100;

  // Value ratio as decimal (e.g. 1.18 instead of 118.27)
  const valueRatio = impliedProbability / streckPercent;

  // Relative strength compared to the field
  const relativeStrength = raceContext.avgOdds / horse.odds;

  return {
    odds,
    streckPercent,
    impliedProbability,
    streckDecimal,
    valueGap,
    marketProbability,
    valueRatio,
    relativeStrength
  };
};

const getStartSpeedScore = (horse) => {
  const startPosition = horse.postPosition || horse.number || 0;

  if (startPosition === 2 || startPosition === 3) {
    return 5;
  }

  if (startPosition >= 4 && startPosition <= 6) {
    return 4;
  }

  if (startPosition === 1) {
    return 3;
  }

  if (startPosition === 7 || startPosition === 8) {
    return 1;
  }

  if (startPosition >= 9) {
    return 0;
  }

  return 0;
};

const getOptionalNumericValue = (...values) => {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

const normalizeStartMethod = (startMethod) => {
  const normalized = String(startMethod || '').toLowerCase();

  if (normalized.includes('volt')) {
    return 'VOLT';
  }

  return 'AUTO';
};

const calculateLeadCompetitionScore = (horses = []) => {
  const highStartSpeedLeaders = (horses || []).filter(candidate => getStartSpeedScore(candidate) >= 4).length;
  const extraLeaders = Math.max(0, highStartSpeedLeaders - 1);

  return Math.min(extraLeaders, 4) / 4;
};

const calculateLeadPotentialScore = (horse, raceContext, horses, startSpeedScore, paceScenarioScore, leadCompetitionScore) => {
  const postPosition = Number(horse?.postPosition ?? horse?.number ?? 0);
  const method = normalizeStartMethod(raceContext?.startMethod);
  const competitionPenalty = leadCompetitionScore * 0.9;
  const nearbyPressure = (horses || [])
    .filter(other => other !== horse)
    .filter(other => {
      const otherPost = Number(other?.postPosition ?? other?.number ?? 0);
      if (!Number.isFinite(otherPost) || !Number.isFinite(postPosition)) {
        return false;
      }

      const otherStartSpeed = getStartSpeedScore(other);
      return Math.abs(otherPost - postPosition) <= 2 && otherStartSpeed >= 4;
    })
    .length;

  if (method === 'AUTO') {
    const earlyPositionAdvantage = Number.isFinite(postPosition)
      ? Math.max(0, 2.2 - Math.max(postPosition - 1, 0) * 0.25)
      : 0;

    const leadPotentialAuto =
      startSpeedScore * 1.2 +
      earlyPositionAdvantage +
      paceScenarioScore * 0.08 -
      nearbyPressure * 0.7 -
      competitionPenalty;

    return Number(Math.min(Math.max(leadPotentialAuto, 0), 10).toFixed(2));
  }

  const startReliability = getOptionalNumericValue(
    horse?.startReliabilityScore,
    horse?.analysis?.startReliabilityScore,
    horse?.startReliability
  );
  const reliabilityBonus = startReliability !== null
    ? Math.min(Math.max(startReliability, 0), 10) * 0.2
    : 0;

  const gallopRisk = getOptionalNumericValue(
    horse?.gallopRiskScore,
    horse?.analysis?.gallopRiskScore,
    horse?.galoppRisk,
    horse?.gallopRisk
  );
  const gallopPenalty = gallopRisk !== null
    ? Math.min(Math.max(gallopRisk, 0), 10) * 0.25
    : 0;

  const springLaneAdvantage = getOptionalNumericValue(
    horse?.springLaneAdvantage,
    horse?.analysis?.springLaneAdvantage,
    horse?.voltPositionAdvantage,
    horse?.analysis?.voltPositionAdvantage
  );
  const springLaneBonus = springLaneAdvantage !== null
    ? Math.min(Math.max(springLaneAdvantage, 0), 10) * 0.2
    : 0;

  const leadPotentialVolt =
    startSpeedScore * 0.85 +
    paceScenarioScore * 0.04 +
    reliabilityBonus +
    springLaneBonus -
    gallopPenalty -
    nearbyPressure * 0.4 -
    competitionPenalty;

  return Number(Math.min(Math.max(leadPotentialVolt, 0), 10).toFixed(2));
};

const getComponentScores = (horse, raceContext, horses) => {
  const { relativeStrength } = getHorseBaseMetrics(horse, raceContext);
  const startSpeedScore = getStartSpeedScore(horse);
  const spetsChanceScore = startSpeedScore + relativeStrength * 2;

  let paceBonus = 0;
  if (spetsChanceScore > 7) {
    paceBonus = 8;
  } else if (spetsChanceScore > 5) {
    paceBonus = 4;
  }

  const paceScore = startSpeedScore * 3 + spetsChanceScore * 2 + paceBonus;
  const leadCompetitionScore = calculateLeadCompetitionScore(horses);
  const leadPotentialScore = calculateLeadPotentialScore(
    horse,
    raceContext,
    horses,
    startSpeedScore,
    paceScore,
    leadCompetitionScore
  );

  return {
    startSpeedScore,
    strengthScore: relativeStrength * 15,
    distanceScore: getOptionalNumericValue(horse.distanceScore, horse.analysis?.distanceScore),
    formScore: getOptionalNumericValue(horse.formScore, horse.analysis?.formScore),
    driverScore: getOptionalNumericValue(horse.driverScore, horse.analysis?.driverScore),
    paceScenarioScore: paceScore,
    gallopRiskScore: getOptionalNumericValue(horse.gallopRiskScore, horse.analysis?.gallopRiskScore),
    leadCompetitionScore,
    leadPotentialScore,
    spetsChanceScore,
    paceBonus,
    paceScore
  };
};

const getExistingAggregateScores = (horse, componentScores, raceContext) => {
  const {
    odds,
    streckPercent,
    impliedProbability,
    valueGap,
    marketProbability,
    valueRatio,
    relativeStrength
  } = getHorseBaseMetrics(horse, raceContext);
  const { modelWeight, marketWeight, raceType } = raceContext;

  // Ranking Score (minimal additive pace/start influence, bounded to avoid dominance)
  const startSpeedContribution = componentScores.startSpeedScore * 0.4;
  const normalizedPaceScenario = Math.min(Math.max(componentScores.paceScenarioScore, 0), 30) / 30;
  const paceScenarioContribution = normalizedPaceScenario * 0.8;
  const rankingScore = impliedProbability + relativeStrength * 15 + valueRatio * 8 + startSpeedContribution + paceScenarioContribution;

  // ===== HORSE SCORE (Sports ranking 0-100) =====
  let horseScore = 0;

  // 1. Post position (0-25 points) - Lower positions = better
  if (horse.postPosition) {
    const postScore = Math.max(0, 25 - (horse.postPosition - 1) * 2);
    horseScore += postScore;
  }

  // Normalize Horse Score to 0-100
  horseScore = Math.min(100, Math.max(0, horseScore));

  // ===== FAVORITE BIAS CORRECTION =====
  // Reduce exaggerated value effects for horses with extremely low streck
  let favoritBiasFactor = 1.0;
  
  if (streckPercent < 1) {
    favoritBiasFactor = 0.35;
  } else if (streckPercent < 2) {
    favoritBiasFactor = 0.5;
  } else if (streckPercent < 5) {
    favoritBiasFactor = 0.75;
  } else {
    favoritBiasFactor = 1.0;
  }

  // ===== FINAL SCORE =====
  const winStrength = (0.65 * rankingScore + 0.35 * horseScore) / 2;
  const cappedValueRatio = Math.min(Math.max(valueRatio, 0.8), 1.6);
  const marketEdge = (cappedValueRatio - 1) * 100;
  const adjustedMarketEdge = marketEdge * favoritBiasFactor;
  const confidence = Math.sqrt(Math.max(streckPercent, 0));
  const finalScore =
    winStrength + adjustedMarketEdge * 0.20 + confidence * 0.8 + componentScores.paceScore * 0.5;

  const calibratedFinalScore =
    winStrength * modelWeight +
    adjustedMarketEdge * 0.25 * marketWeight +
    confidence * 1.0 * marketWeight +
    componentScores.paceScore * 0.6 * modelWeight;

  // Play recommendation - finalScore is the main driver, valueRatio adjusts
  let play = "No play";

  if (finalScore >= 95 && valueRatio >= 1.15) {
    play = "Stark play";
  } 
  else if (finalScore >= 65 && valueRatio >= 1.05) {
    play = "Möjlig play";
  } 
  else {
    play = "No play";
  }

  // Value status - adjusted thresholds
  let valueStatus = 'Neutral';
  if (valueRatio > 1.20) {
    valueStatus = 'Spelvärd';
  } else if (valueRatio < 1.05) {
    valueStatus = 'Överspelad';
  }

  // Surprise indicator
  const skrallSignal = (valueRatio > 1.20 && streckPercent < 0.08) ? "💎 Skrällbud" : null;

  return {
    odds,
    streckPercent,
    impliedProbability,
    marketProbability,
    valueGap,
    valueRatio,
    rankingScore,
    horseScore,
    startSpeedScore: componentScores.startSpeedScore,
    spetsChanceScore: componentScores.spetsChanceScore,
    paceScore: componentScores.paceScore,
    finalScore,
    calibratedFinalScore,
    raceType,
    modelWeight,
    marketWeight,
    play,
    valueStatus,
    skrallSignal
  };
};

const classifyRaceType = (horses = []) => {
  if (!Array.isArray(horses) || horses.length === 0) {
    return 'Rörigt lopp';
  }

  const marketSignals = horses
    .map(horse => {
      const oddsDecimal = Number(horse?.odds) / 100;
      const streckPercent = Number(horse?.betDistribution) / 100;

      if (!Number.isFinite(oddsDecimal) || oddsDecimal <= 0 || !Number.isFinite(streckPercent) || streckPercent <= 0) {
        return null;
      }

      const impliedProbability = (1 / oddsDecimal) * 100;
      const valueRatio = impliedProbability / streckPercent;

      return {
        streckPercent,
        valueRatio
      };
    })
    .filter(Boolean);

  if (marketSignals.length === 0) {
    return 'Rörigt lopp';
  }

  const byStreck = [...marketSignals].sort((a, b) => b.streckPercent - a.streckPercent);
  const topStreck = byStreck[0]?.streckPercent || 0;
  const secondStreck = byStreck[1]?.streckPercent || 0;
  const goodValueCount = marketSignals.filter(signal => signal.valueRatio > 1.20).length;

  if (topStreck > 30 && (topStreck - secondStreck) > 10) {
    return 'Favoritlopp';
  }

  if (goodValueCount >= 3) {
    return 'Värdelopp';
  }

  return 'Rörigt lopp';
};

const getCalibrationWeights = (raceType) => {
  let modelWeight = 1.0;
  let marketWeight = 1.0;

  if (raceType === 'Favoritlopp') {
    modelWeight = 0.9;
    marketWeight = 1.15;
  } else if (raceType === 'Rörigt lopp') {
    modelWeight = 1.15;
    marketWeight = 0.9;
  } else if (raceType === 'Värdelopp') {
    modelWeight = 1.1;
    marketWeight = 1.0;
  }

  return {
    modelWeight,
    marketWeight
  };
};