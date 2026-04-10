/**
 * Fetch KM-tid race data script as raw text via backend proxy.
 * @param {string} date - Date in YYMMDD format, e.g. "260409".
 * @returns {Promise<string|null>} Raw races.js content or null when unavailable.
 */
export async function fetchKMTidRaceData(date) {
  const url = `/api/kmtid-page/${date}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn('[KMTid] request failed', { date, status: response.status, url });
      let err;
      try {
        err = await response.json();
      } catch (parseError) {
        err = {
          error: 'failed to parse backend error json',
          message: parseError?.message || String(parseError)
        };
      }
      console.error('[KMTid backend error]', err);

      return null;
    }

    const scriptText = await response.text();
    if (!scriptText || !scriptText.trim()) {
      console.warn('[KMTid] races.js is empty', { date, url });
      return null;
    }
    return scriptText;
  } catch (error) {
    console.warn('[KMTid] fetch failed', {
      date,
      url,
      error: error?.message || String(error)
    });
    return null;
  }
}
