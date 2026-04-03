/**
 * ATG API Service
 * Handles fetching raw game data for different game types
 */

import { normalizeHorse } from './normalizeRaceData';
import { analyzeRaceData } from './analyzeRaceData';

let hasLoggedDdRawResponse = false;

/**
 * Derive horse-level market share from the DD combination odds matrix.
 * NOTE: DD betDistribution computed here is inferred from comboOdds,
 *       NOT official ATG horse-level streck data.
 *
 * @param {number[][]} comboOdds - rows = DD-1 horses, cols = DD-2 horses (values are ATG-encoded odds × 100)
 * @returns {{ leg1: (number|null)[], leg2: (number|null)[] }} normalized percentage per horse per leg
 */
function computeDdDistributions(comboOdds) {
  if (!Array.isArray(comboOdds) || !comboOdds.length) {
    return { leg1: [], leg2: [] };
  }

  const weights = comboOdds.map(row =>
    row.map(value => {
      const odd = Number(value);
      return Number.isFinite(odd) && odd > 0 ? 1 / odd : 0;
    })
  );

  const rowSums = weights.map(row => row.reduce((sum, v) => sum + v, 0));

  const colCount = Math.max(...weights.map(row => row.length));
  const colSums = Array.from({ length: colCount }, (_, colIndex) =>
    weights.reduce((sum, row) => sum + (row[colIndex] || 0), 0)
  );

  const totalRow = rowSums.reduce((sum, v) => sum + v, 0);
  const totalCol = colSums.reduce((sum, v) => sum + v, 0);

  const leg1 = rowSums.map(v =>
    totalRow > 0 ? Number(((v / totalRow) * 100).toFixed(1)) : null
  );

  const leg2 = colSums.map(v =>
    totalCol > 0 ? Number(((v / totalCol) * 100).toFixed(1)) : null
  );

  return { leg1, leg2 };
}

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

    const calendarDate = date || getSwedenDate();
    const calendarUrl = `/api/atg/calendar?date=${encodeURIComponent(calendarDate)}`;

    console.log('[ATG] URL:', calendarUrl);
    console.log(`[ATG] === CALENDAR FETCH ===`);
    console.log(`[ATG] GameType: ${gameType}`);

    const calendarResponse = await fetch(calendarUrl, {
      headers: { accept: 'application/json' }
    });

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      throw new Error(`Calendar route returned ${calendarResponse.status}: ${errorText.slice(0, 200)}`);
    }

    const calendar = await calendarResponse.json();
    console.log('[ATG] Calendar JSON:', calendar);

      const selectedGameType = gameType;
      const game = calendar?.games?.[selectedGameType];
      console.log('[ATG] Selected game:', game);
      console.log('[ATG] Game keys:', Object.keys(game || {}));

    if (!game) {
        console.error(`[ATG] ❌ Game ${selectedGameType} NOT FOUND in calendar`);
        throw new Error(`Game type ${selectedGameType} not found in calendar for ${calendarDate}`);
    }

    const raceIds = game?.races || [];
    console.log('[ATG] Race IDs:', raceIds);

    return { calendar, game, raceIds };
  } catch (error) {
    console.error(`[ATG] Error finding game in calendar: ${error.message}`);
    throw error;
  }
};

export const fetchGameData = async (selectedGameType) => {
  const isDD = selectedGameType?.toUpperCase() === 'DD';
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm"
  });

  // Step 1: Calendar – resolve game key, race IDs, and master game ID
  const calRes = await fetch(`/api/atg/calendar?date=${today}`);
  const calendar = await calRes.json();

  const games = calendar?.games || {};
  const matchedKey =
    Object.keys(games).find(key => key === selectedGameType) ||
    Object.keys(games).find(key => key.toLowerCase() === selectedGameType.toLowerCase());

  const rawGameEntry = matchedKey ? games[matchedKey] : null;
  const rawGame = Array.isArray(rawGameEntry) ? rawGameEntry[0] : rawGameEntry;

  if (!rawGame) return [];

  const raceIds = Array.isArray(rawGame.races) ? rawGame.races : [];
  const gameId = rawGame.id;

  // Build V85 race index for DD linkage
  let v85RaceIds = [];
  if (isDD) {
    const v85Key = Object.keys(games).find(k => k.toUpperCase() === 'V85');
    if (v85Key) {
      const v85Entry = games[v85Key];
      const v85Game = Array.isArray(v85Entry) ? v85Entry[0] : v85Entry;
      v85RaceIds = Array.isArray(v85Game?.races) ? v85Game.races : [];
    }
  }

  // Step 2: Full game fetch – horses, track, distance, odds
  let fullRaceMap = {};
  let ddComboOdds = null;
  if (gameId) {
    try {
      const detailsUrl = isDD
        ? `/api/atg/dd-game?id=${encodeURIComponent(gameId)}`
        : `/api/atg/game?gameId=${encodeURIComponent(gameId)}`;

      const gameRes = await fetch(detailsUrl);
      if (gameRes.ok) {
        const gameData = await gameRes.json();
        const ddResponse = gameData;

        if (isDD) {
          ddComboOdds = gameData?.pools?.dd?.comboOdds || null;
        }

        if (isDD && !hasLoggedDdRawResponse) {
          console.log('DD endpoint raw response:', JSON.stringify(ddResponse, null, 2));
          console.log('DD response keys:', Object.keys(ddResponse || {}));
          console.log('DD pools.dd keys:', Object.keys(ddResponse?.pools?.dd || {}));
          console.log('DD starts:', JSON.stringify(ddResponse?.starts, null, 2));
          console.log('DD races:', JSON.stringify(ddResponse?.races, null, 2));
          console.log('DD horses:', JSON.stringify(ddResponse?.horses, null, 2));
          console.log('DD dd pool full:', JSON.stringify(ddResponse?.pools?.dd, null, 2));
          hasLoggedDdRawResponse = true;
        }

        for (const race of (gameData.races || [])) {
          fullRaceMap[race.id] = race;
        }
      }
    } catch (e) {
      console.warn('Game fetch failed:', e.message);
    }
  }

  // Compute DD horse-level market share from comboOdds (raw response already logged above)
  const ddDistributions = isDD ? computeDdDistributions(ddComboOdds) : null;
  if (isDD) {
    console.log('DD comboOdds rows:', ddComboOdds?.length, 'cols:', ddComboOdds?.[0]?.length);
    console.log('DD leg1 distributions:', ddDistributions?.leg1);
    console.log('DD leg2 distributions:', ddDistributions?.leg2);
  }

  // Step 3: Build race objects with normalized horses
  return raceIds.map((raceId, index) => {
    const fullRace = fullRaceMap[raceId];

    const normalizedHorses = (fullRace?.starts || [])
      .map(start => normalizeHorse(start, matchedKey || selectedGameType))
      .filter(Boolean);

    // For DD only: override betDistribution with values inferred from comboOdds matrix.
    // NOTE: These are NOT official ATG streck percentages — derived from combination odds per leg.
    // Values are scaled to ATG encoding (e.g. 14.3% → stored as 1430) so analyzeRaceData's
    // `betDistribution / 100` correctly yields streckPercent.
    if (isDD && ddDistributions) {
      const legDist = index === 0 ? ddDistributions.leg1 : ddDistributions.leg2;
      normalizedHorses.forEach(horse => {
        const pct = legDist[horse.number - 1];
        horse.betDistribution = (pct != null) ? Math.round(pct * 100) : null;
      });
    }

    const hasRealBetDistribution = normalizedHorses.some(horse =>
      horse.betDistribution !== null && horse.betDistribution !== undefined
    );

    const horses = hasRealBetDistribution
      ? analyzeRaceData({
          gameType: selectedGameType,
          races: [{
            raceNumber: fullRace?.number || index + 1,
            distance: fullRace?.distance || null,
            horses: normalizedHorses
          }]
        }).races[0].horses
      : normalizedHorses;

    const actualRaceNumber = Number(String(raceId).split('_').pop()) || null;
    const v85Index = v85RaceIds.indexOf(raceId);
    const linkedV85Number = v85Index >= 0 ? v85Index + 1 : null;

    return {
      id: raceId,
      number: index + 1,
      actualRaceNumber,
      linkedV85Number,
      name: `${selectedGameType}-${index + 1}`,
      track: fullRace?.track?.name || '',
      date: fullRace?.startTime?.split('T')[0] || today,
      distance: fullRace?.distance || null,
      horses
    };
  });
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