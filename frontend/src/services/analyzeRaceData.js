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

      // Analyze horses in this race
      const analyzedHorses = analyzeHorses(race.horses);

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
const analyzeHorses = (horses) => {
  // Calculate average odds in the race
  const avgOdds = horses.reduce((sum, h) => sum + h.odds, 0) / horses.length;

  return horses.map(horse => {
    // Basic calculations
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
    const relativeStrength = avgOdds / horse.odds;

    // Ranking Score
    const rankingScore = impliedProbability + relativeStrength * 15 + valueRatio * 8;

    // ===== HORSE SCORE (Sports ranking 0-100) =====
    let horseScore = 0;

    // 1. Post position (0-25 points) - Lower positions = better
    if (horse.postPosition) {
      const postScore = Math.max(0, 25 - (horse.postPosition - 1) * 2);
      horseScore += postScore;
    }

    // Normalize Horse Score to 0-100
    horseScore = Math.min(100, Math.max(0, horseScore));

    // ===== PACE / SPETS MODEL =====
    const startPosition = horse.postPosition || horse.number || 0;
    let startSpeedScore = 0;
    if (startPosition === 2 || startPosition === 3) {
      startSpeedScore = 5;
    } else if (startPosition >= 4 && startPosition <= 6) {
      startSpeedScore = 4;
    } else if (startPosition === 1) {
      startSpeedScore = 3;
    } else if (startPosition === 7 || startPosition === 8) {
      startSpeedScore = 1;
    } else if (startPosition >= 9) {
      startSpeedScore = 0;
    }

    const spetsChanceScore = startSpeedScore + relativeStrength * 2;

    let paceBonus = 0;
    if (spetsChanceScore > 7) {
      paceBonus = 8;
    } else if (spetsChanceScore > 5) {
      paceBonus = 4;
    }

    const paceScore = startSpeedScore * 3 + spetsChanceScore * 2 + paceBonus;

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
    const marketEdge = (valueRatio - 1) * 100;
    const adjustedMarketEdge = marketEdge * favoritBiasFactor;
    const confidence = Math.sqrt(streckPercent * 100);
    const finalScore =
      winStrength + adjustedMarketEdge * 0.25 + confidence * 1.5 + paceScore * 0.8;

    // Play recommendation - finalScore is the main driver, valueRatio adjusts
    let play = "No play";

    if (finalScore >= 95 && valueRatio >= 1.0) {
      play = "Möjlig play";
    }

    if (finalScore >= 105 && valueRatio >= 1.1) {
      play = "Stark play";
    }

    if (valueRatio < 0.9) {
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
      ...horse,
      odds: odds,
      streckPercent: streckPercent,
      impliedProbability: impliedProbability,
      marketProbability: marketProbability,
      valueGap: valueGap,
      valueRatio: valueRatio,
      rankingScore: rankingScore,
      horseScore: horseScore,
      startSpeedScore: startSpeedScore,
      spetsChanceScore: spetsChanceScore,
      paceScore: paceScore,
      finalScore: finalScore,
      play: play,
      valueStatus: valueStatus,
      skrallSignal: skrallSignal
    };
  });
};