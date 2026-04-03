/**
 * ATG API Service
 * Handles fetching raw game data for different game types
 */

// Game type configurations
const GAME_CONFIGS = {
  'V85': { races: 8 },
  'V86': { races: 8 },
  'V64': { races: 6 },
  'V65': { races: 6 },
  'V5': { races: 5 },
  'DD': { races: 2 }
};

/**
 * Get gameId for a specific game type from ATG calendar
 * Fetches calendar without hardcoding date, filters by gameType,
 * and returns the latest/nearest active game's ID
 * @param {string} gameType - The game type (V85, V86, V64, V65, V5, DD)
 * @returns {Promise<string>} Game ID
 */
export const getGameIdFromCalendar = async (gameType) => {
  try {
    // Try to get calendar with current date
    const today = new Date().toISOString().split('T')[0];
    const calendarUrl = `https://horse-betting-info.prod.cl.atg.cloud/api-public/v0/calendar/day/${today}`;

    const calendarResponse = await fetch(calendarUrl, {
      headers: {
        accept: 'application/json'
      }
    });

    if (!calendarResponse.ok) {
      throw new Error(`Failed to fetch ATG calendar: ${calendarResponse.status}`);
    }

    const calendarData = await calendarResponse.json();
    const games = calendarData?.games || [];

    // Filter games by type and sort by startTime (newest first)
    const matchingGames = games
      .filter(g => g?.game === gameType || g?.type === gameType)
      .sort((a, b) => {
        const dateA = new Date(b?.startTime || 0).getTime();
        const dateB = new Date(a?.startTime || 0).getTime();
        return dateA - dateB;
      });

    if (matchingGames.length === 0) {
      throw new Error(`Game type ${gameType} not found in calendar`);
    }

    const gameId = matchingGames[0].id;
    console.log(`Found gameId for ${gameType}: ${gameId}`);
    return gameId;
  } catch (error) {
    console.error(`Error fetching gameId from calendar: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch raw game data for a specific game type
 * @param {string} gameType - The game type (V85, V86, V64, V65, V5, DD)
 * @param {string} date - Optional date in YYYY-MM-DD format (deprecated, kept for compatibility)
 * @returns {Promise<Object>} Raw game data
 */
export const fetchGameData = async (gameType, date = '2024-01-20') => {
  // Get gameId from calendar instead of using hardcoded date
  const gameId = await getGameIdFromCalendar(gameType);

  const url = `https://www.atg.se/services/racinginfo/v1/api/games/${gameId}`;

  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ATG data: ${response.status}`);
  }

  return await response.json();
};

/**
 * Generate mock game data for development
 * @param {string} gameType
 * @param {string} date
 * @returns {Object} Mock game data
 */
const generateMockGameData = (gameType, date) => {
  const config = GAME_CONFIGS[gameType];
  if (!config) {
    throw new Error(`Unknown game type: ${gameType}`);
  }

  const numRaces = config.races;

  // Generate mock races
  const races = [];
  for (let i = 0; i < numRaces; i++) {
    races.push({
      number: i + 1,
      name: `${gameType}-${i + 1}`,
      track: {
        name: i % 2 === 0 ? 'Solvalla' : 'Åby'
      },
      startTime: `${date}T15:${20 + i * 10}:00`,
      distance: 2140 + i * 40,
      starts: generateMockHorses(i + 1)
    });
  }

  return {
    gameType: gameType,
    date: date,
    races: races
  };
};

/**
 * Generate mock horses for a race
 * @param {number} raceNumber
 * @returns {Array} Array of horse objects
 */
const generateMockHorses = (raceNumber) => {
  const horseNames = [
    ['Staro Broline', 'Global Badman', 'Donatos', 'Perfect Kronos', 'Muscle Hustle'],
    ['Racing Beauty', 'Super Nova', 'Eagle Eye', 'Thunder Strike', 'Golden Arrow'],
    ['Mighty Max', 'Quick Silver', 'Star Runner', 'Blue Diamond', 'Red Baron'],
    ['Speed King', 'Dream Dancer', 'Lucky Star', 'Wild Wind', 'Brave Heart'],
    ['Royal Flash', 'Silver Bullet', 'Magic Moment', 'Flying Star', 'Bold Eagle'],
    ['Night Rider', 'Storm Cloud', 'Fire Storm', 'Ice Queen', 'Golden Dream'],
    ['Power Play', 'Swift Arrow', 'Bright Future', 'Dark Horse', 'True Spirit'],
    ['Fast Lane', 'High Flyer', 'Noble Knight', 'Pure Gold', 'Sharp Shooter']
  ];

  const drivers = [
    ['Örjan', 'Kihlström'],
    ['Björn', 'Goop'],
    ['Magnus A', 'Djuse'],
    ['Erik', 'Adielsson'],
    ['Stefan', 'Persson']
  ];

  const trainers = [
    ['Daniel', 'Redén'],
    ['Stefan', 'Melander'],
    ['Jerry', 'Riordan'],
    ['Robert', 'Bergh'],
    ['Timo', 'Nurmos']
  ];

  const formExamples = [
    '1-1-2-3-1',
    '2-1-3-1-2',
    '3-2-1-4-2',
    '1-2-2-1-3',
    '4-3-2-5-1',
    '2-3-1-2-4',
    '5-4-3-2-1',
    '1-3-2-4-3'
  ];

  const horseSet = horseNames[(raceNumber - 1) % horseNames.length];
  const numHorses = 8 + (raceNumber % 4); // 8-11 horses per race

  return Array.from({ length: Math.min(numHorses, horseSet.length) }, (_, i) => {
    const baseOdds = 400 + i * 200 + Math.random() * 300;
    const baseStreck = 800 + i * 200 + Math.random() * 500;

    return {
      postPosition: i + 1,
      horse: {
        name: horseSet[i],
        trainer: {
          firstName: trainers[i % trainers.length][0],
          lastName: trainers[i % trainers.length][1]
        },
        record: {
          starts: 20 + Math.floor(Math.random() * 30),
          wins: 3 + Math.floor(Math.random() * 8),
          places: 5 + Math.floor(Math.random() * 10)
        }
      },
      driver: {
        firstName: drivers[i % drivers.length][0],
        lastName: drivers[i % drivers.length][1]
      },
      pools: {
        vinnare: {
          odds: Math.round(baseOdds)
        },
        V85: {
          betDistribution: Math.round(baseStreck)
        }
      },
      form: formExamples[i % formExamples.length],
      distance: 2140,
      startMethod: i % 2 === 0 ? 'volt' : 'auto',
      shoes: i % 3 === 0 ? 'barfota' : 'beskod'
    };
  });
};

/**
 * Parse manually imported JSON text from user
 * @param {string} jsonText - Raw JSON text to parse
 * @returns {Object} Parsed JSON data
 * @throws {Error} If JSON is invalid or missing required structure
 */
export const parseManualImport = (jsonText) => {
  if (!jsonText || typeof jsonText !== 'string') {
    throw new Error('JSON text must be a non-empty string');
  }

  const trimmed = jsonText.trim();
  if (trimmed.length === 0) {
    throw new Error('JSON text is empty');
  }

  try {
    const parsed = JSON.parse(trimmed);

    // Validate that it has races array or is in expected format
    if (!parsed.races || !Array.isArray(parsed.races) || parsed.races.length === 0) {
      throw new Error('JSON must contain a "races" array with at least one race');
    }

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON syntax: ${error.message}`);
    }
    throw error;
  }
};