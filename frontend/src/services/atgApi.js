/**
 * ATG API Service
 * Handles fetching raw game data for different game types
 */

// Backend base URL — in production set REACT_APP_API_BASE_URL to the deployed backend origin
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

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
 * Get today's date formatted as YYYY-MM-DD in Swedish local time (Europe/Stockholm)
 * This ensures the correct date is used even when running on UTC servers
 * @returns {string} Date in YYYY-MM-DD format in Swedish timezone
 */
function getSwedenDate() {
  const now = new Date();
  return now.toLocaleDateString('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * Fetch calendar for a specific date and find the game matching the game type
 * @param {string} gameType - The game type (V85, V86, V64, V65, V5, DD)
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<Object>} Game object from calendar
 */
export const findGameInCalendar = async (gameType, date = null) => {
  try {
    if (!gameType) {
      throw new Error('gameType is required');
    }

    if (!API_BASE_URL) {
      throw new Error('Missing REACT_APP_API_BASE_URL. Point it to your FastAPI backend domain.');
    }

    const calendarDate = date || getSwedenDate();
    const calendarUrl = `${API_BASE_URL}/api/atg/calendar?date=${encodeURIComponent(calendarDate)}`;

    console.log('ATG backend URL:', calendarUrl);
    console.log(`[ATG] === CALENDAR FETCH ===`);
    console.log(`[ATG] GameType: ${gameType}`);
    console.log(`[ATG] URL: ${calendarUrl}`);

    const calendarResponse = await fetch(calendarUrl, {
      headers: { accept: 'application/json' }
    });

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      throw new Error(`Calendar route returned ${calendarResponse.status}: ${errorText.slice(0, 200)}`);
    }

    const text = await calendarResponse.text();
    if (!text.trim().startsWith('{')) {
      throw new Error(`Calendar route did not return JSON. Got: ${text.slice(0, 100)}`);
    }

    const calendarData = JSON.parse(text);
    console.log(`[ATG] Calendar games count: ${calendarData?.games?.length}`);

    const games = calendarData?.games || [];
    if (!Array.isArray(games)) {
      throw new Error('Calendar response has invalid games structure');
    }

    console.log(`[ATG] Available game types:`, games.map(g => ({ betType: g?.betType, game: g?.game, name: g?.name, type: g?.type, id: g?.id })));

    const game = games.find(g => {
      if (!g) return false;
      return g?.betType === gameType || g?.game === gameType || g?.name === gameType || g?.type === gameType;
    });

    if (!game) {
      console.error(`[ATG] ❌ Game ${gameType} NOT FOUND in calendar`);
      throw new Error(`Game type ${gameType} not found in calendar for ${calendarDate}`);
    }

    if (!game.id) {
      console.error(`[ATG] ❌ Matched game missing ID:`, game);
      throw new Error(`Game found for ${gameType} but missing ID`);
    }

    console.log(`[ATG] ✅ Found game ${gameType} with ID: ${game.id}`);
    return game;
  } catch (error) {
    console.error(`[ATG] Error finding game in calendar: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch raw game data using official ATG endpoint
 * @param {string} gameId - The game ID
 * @returns {Promise<Object>} Raw game data
 */
export const fetchGameDataById = async (gameId) => {
  try {
    if (!gameId) {
      throw new Error('gameId is required');
    }

    if (!API_BASE_URL) {
      throw new Error('Missing REACT_APP_API_BASE_URL. Point it to your FastAPI backend domain.');
    }

    const url = `${API_BASE_URL}/api/atg/game?gameId=${encodeURIComponent(gameId)}`;

    console.log(`[ATG] === GAME FETCH ===`);
    console.log(`[ATG] GameID: ${gameId}`);
    console.log(`[ATG] URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[ATG] Game fetch failed with status: ${response.status}`);
      throw new Error(`Game fetch failed: ${response.status}`);
    }

    const gameData = await response.json();
    console.log(`[ATG] === GAME RESPONSE ===`);
    console.log(`[ATG] Response status: ${response.status}`);
    console.log(`[ATG] Races count: ${gameData?.game?.races?.length || 0}`);

    // Validate the response structure
    if (!gameData?.game) {
      console.error(`[ATG] Response missing 'game' object:`, gameData);
      throw new Error('Game response missing game object');
    }

    if (!Array.isArray(gameData.game.races)) {
      console.error(`[ATG] Response missing 'game.races' array:`, gameData.game);
      throw new Error('Game response missing races array');
    }

    console.log(`[ATG] Game data has ${gameData.game.races.length} races`);
    return gameData;
  } catch (error) {
    console.error(`[ATG] Error fetching game data: ${error.message}`);
    throw error;
  }
};

/**
 * Main function to load game data for a specific game type
 * Orchestrates calendar lookup and game data fetching with comprehensive error handling
 * @param {string} gameType - The game type (V85, V86, V64, V65, V5, DD)
 * @returns {Promise<Object>} Game data with races
 */
export const fetchGameData = async (gameType) => {
  try {
    if (!gameType) {
      console.warn('[ATG] fetchGameData called without gameType');
      throw new Error('gameType is required');
    }

    console.log(`[ATG] Starting fetchGameData for: ${gameType}`);

    // Step 1: Find game in calendar
    const game = await findGameInCalendar(gameType);

    // Step 2: Fetch game data using the gameId
    const gameData = await fetchGameDataById(game.id);

    // Step 3: Validate races exist
    const races = gameData?.game?.races || [];
    if (races.length === 0) {
      console.warn(`[ATG] No races found for game ${gameType}`);
      throw new Error(`No races found for ${gameType}`);
    }

    console.log(`[ATG] Successfully loaded ${races.length} races for ${gameType}`);
    return gameData;
  } catch (error) {
    console.error(`[ATG] Error fetching game data for ${gameType}: ${error.message}`);
    throw error;
  }
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