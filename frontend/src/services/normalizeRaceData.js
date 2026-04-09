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
    if (!rawData || !(rawData.races || rawData.games)) {
      throw new Error('Invalid raw data: missing races array');
    }

    const racesSource = rawData.races || rawData.games;
    if (!Array.isArray(racesSource)) {
      throw new Error('Invalid raw data: races is not an array');
    }

    const filteredRaces = racesSource;

    // Normalize each filtered race
    const normalizedRaces = filteredRaces.map((race, index) => {
      console.log('RACE DEBUG', gameType, race);
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
export const normalizeHorse = (start, gameType) => {
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
    const number = start.number || start.postPosition;
    const name = start.horse.name;

    // DEBUG: Log raw start object (first 3 horses per race)
    if (number <= 3) {
      console.log('[normalizeHorse DEBUG] Raw start object for', name, {
        number,
        startKeys: Object.keys(start || {}),
        shoes: start.shoes,
        shoeInfo: start.shoeInfo,
        sko: start.sko,
        sulky: start.sulky,
        vagn: start.vagn,
        cart: start.cart,
        bike: start.bike,
        equipment: start.equipment,
        horseKeys: Object.keys(start?.horse || {}),
        horseShoes: start?.horse?.shoes,
        horseSulky: start?.horse?.sulky,
        _allKeys: Object.keys(start).filter(k => !['postPosition', 'horse', 'driver', 'pools', 'form', 'distance', 'startMethod'].includes(k))
      });
    }

    // Extract odds
    let odds = null;
    if (start.pools?.vinnare?.odds !== undefined) {
      odds = start.pools.vinnare.odds;
    }

    // Extract bet distribution from the actual pool objects returned by ATG.
    let betDistribution = null;
    const poolKeys = [gameType, gameType?.toUpperCase(), gameType?.toLowerCase()].filter(Boolean);
    for (const key of poolKeys) {
      if (start.pools?.[key]?.betDistribution !== undefined) {
        betDistribution = start.pools[key].betDistribution;
        break;
      }
    }

    if (betDistribution === null) {
      for (const pool of Object.values(start.pools || {})) {
        if (pool?.betDistribution !== undefined) {
          betDistribution = pool.betDistribution;
          break;
        }
      }
    }

    if (odds !== null && (isNaN(odds) || odds <= 0)) {
      console.warn(`Horse ${number} (${name}) has invalid odds value, clearing to null`);
      odds = null;
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

    const normalized = {
      number,
      name,
      driver,
      trainer,
      odds,
      betDistribution,
      postPosition,
      // Forward equipment fields without transformation - let downstream components interpret
      shoes: start.shoes || null,
      shoeInfo: start.shoeInfo || null,
      sko: start.sko || null,
      sulky: start.sulky || null,
      vagn: start.vagn || null,
      cart: start.cart || null,
      bike: start.bike || null,
      equipment: start.equipment || null
    };

    // DEBUG: Log normalized object (first 3 horses per race)
    if (number <= 3) {
      console.log('[normalizeHorse DEBUG] Normalized horse:', name, {
        normalizedKeys: Object.keys(normalized),
        hasShoes: !!normalized.shoes,
        hasSulky: !!normalized.sulky,
        shoes: normalized.shoes,
        sulky: normalized.sulky,
        equipment: normalized.equipment
      });
    }

    return normalized;

  } catch (error) {
    console.warn('Error normalizing horse:', error);
    return null;
  }
};