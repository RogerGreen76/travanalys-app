/**
 * Race Data Normalization Service
 * Converts raw ATG data into a consistent normalized format
 */

/**
 * Normalize raw ATG race data into a consistent format
 * @param {Object} rawData - Raw data from ATG API
 * @param {string} gameType - The game type (V85, V86, etc.)
 * @returns {Object} Normalized race data
 */
export const normalizeRaceData = (rawData, gameType) => {
  try {
    if (!rawData || !rawData.races) {
      throw new Error('Invalid raw data: missing races array');
    }

    // Normalize each race
    const normalizedRaces = rawData.races.map((race, index) => {
      if (!race.starts || !Array.isArray(race.starts)) {
        console.warn(`Race ${index + 1} missing starts array, skipping`);
        return null;
      }

      // Extract race information
      const normalizedRace = {
        raceNumber: race.number || race.raceNumber || (index + 1),
        distance: race.distance || null,
        startMethod: race.startMethod || 'auto', // Default to auto if not specified
        horses: []
      };

      // Normalize each horse
      normalizedRace.horses = race.starts
        .map(start => normalizeHorse(start, gameType))
        .filter(horse => horse !== null); // Remove invalid horses

      return normalizedRace;
    }).filter(race => race !== null); // Remove invalid races

    return {
      gameType,
      races: normalizedRaces
    };

  } catch (error) {
    console.error('Error normalizing race data:', error);
    throw new Error(`Failed to normalize race data: ${error.message}`);
  }
};

/**
 * Normalize a single horse from ATG format
 * @param {Object} start - Raw horse data from ATG
 * @param {string} gameType - Game type for bet distribution key
 * @returns {Object|null} Normalized horse data or null if invalid
 */
const normalizeHorse = (start, gameType) => {
  try {
    // Validate required fields
    if (!start.postPosition && !start.number) {
      console.warn('Horse missing postPosition/number, skipping');
      return null;
    }

    if (!start.horse || !start.horse.name) {
      console.warn('Horse missing name, skipping');
      return null;
    }

    // Extract basic horse info
    const number = start.postPosition || start.number;
    const name = start.horse.name;

    // Extract odds
    let odds = null;
    if (start.pools?.vinnare?.odds !== undefined) {
      odds = start.pools.vinnare.odds;
    }

    // Extract bet distribution (try different pool types)
    let betDistribution = null;
    const poolKeys = ['V85', 'V86', 'V75', 'V65', 'V64', 'V5'];
    for (const key of poolKeys) {
      if (start.pools?.[key]?.betDistribution !== undefined) {
        betDistribution = start.pools[key].betDistribution;
        break;
      }
    }

    // Validate odds and bet distribution
    if (odds === null || betDistribution === null) {
      console.warn(`Horse ${number} (${name}) missing odds or bet distribution, skipping`);
      return null;
    }

    if (isNaN(odds) || odds <= 0 || isNaN(betDistribution) || betDistribution <= 0) {
      console.warn(`Horse ${number} (${name}) has invalid odds or bet distribution, skipping`);
      return null;
    }

    // Extract driver info
    let driver = null;
    if (start.driver?.firstName && start.driver?.lastName) {
      driver = `${start.driver.firstName} ${start.driver.lastName}`;
    } else if (start.driver?.name) {
      driver = start.driver.name;
    }

    // Extract trainer info
    let trainer = null;
    if (start.horse.trainer?.firstName && start.horse.trainer?.lastName) {
      trainer = `${start.horse.trainer.firstName} ${start.horse.trainer.lastName}`;
    } else if (start.horse.trainer?.name) {
      trainer = start.horse.trainer.name;
    }

    // Extract post position
    const postPosition = start.postPosition || start.number;

    return {
      number,
      name,
      driver,
      trainer,
      odds,
      betDistribution,
      postPosition
    };

  } catch (error) {
    console.warn('Error normalizing horse:', error);
    return null;
  }
};