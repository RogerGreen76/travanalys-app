/**
 * Fetch KM-tid race data script and parse it into a usable object.
 * @param {string} date - Date in YYMMDD format, e.g. "260409".
 * @returns {Promise<Object|Array|null>} Parsed race data or null when unavailable/unparseable.
 */
export async function fetchKMTidRaceData(date) {
  const url = `https://kmtid.atgx.se/${date}/js/races.js`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn('[KMTid] races.js not found', { date, status: response.status, url });
      return null;
    }

    const scriptText = await response.text();
    if (!scriptText || !scriptText.trim()) {
      console.warn('[KMTid] races.js is empty', { date, url });
      return null;
    }

    // Attempt 1: JSON file content (rare but cheap to test)
    try {
      const parsedJson = JSON.parse(scriptText);
      console.log('[KMTid] races.js fetched and parsed as JSON', { date, url });
      return parsedJson;
    } catch {
      // Continue with JS parsing fallbacks
    }

    // Attempt 2: variable assignment like "races = {...};" or "window.races = {...};"
    const assignmentMatch = scriptText.match(/(?:var\s+|let\s+|const\s+)?(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);?\s*$/);
    if (assignmentMatch) {
      const varName = assignmentMatch[1];
      const rhs = assignmentMatch[2];

      try {
        const parsedFromAssignment = new Function(`return (${rhs});`)();
        console.log('[KMTid] races.js parsed from assignment', { date, varName, url });
        return parsedFromAssignment;
      } catch {
        // Continue with full-script execution fallback
      }
    }

    // Attempt 3: execute script in a tiny sandbox and read common global keys
    try {
      const sandbox = {};
      const readParsed = new Function(
        'sandbox',
        `${scriptText}
        return (
          (typeof races !== 'undefined' && races) ||
          sandbox.races ||
          sandbox.Races ||
          sandbox.raceData ||
          sandbox.data ||
          null
        );`
      );

      const parsedFromScript = readParsed(sandbox);
      if (parsedFromScript !== null && parsedFromScript !== undefined) {
        console.log('[KMTid] races.js parsed from script execution', { date, url });
        return parsedFromScript;
      }
    } catch (parseError) {
      console.warn('[KMTid] failed to execute races.js parser fallback', {
        date,
        url,
        error: parseError?.message || String(parseError)
      });
    }

    console.warn('[KMTid] races.js fetched but could not be parsed', { date, url });
    return null;
  } catch (error) {
    console.warn('[KMTid] fetch failed', {
      date,
      url,
      error: error?.message || String(error)
    });
    return null;
  }
}
