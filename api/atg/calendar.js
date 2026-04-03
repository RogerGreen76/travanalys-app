// Minimal API route verification, then switch to ATG proxy.
// Step 1: Simple return for sanity check
// Use browser on /api/atg/calendar?date=2026-04-03 and confirm JSON
// { ok: true, route: 'calendar' }

export default async function handler(req, res) {
  if (req.query.test === 'true') {
    res.status(200).json({ ok: true, route: 'calendar', requestedDate: req.query.date || null });
    return;
  }

  try {
    const date = req.query.date || new Date().toLocaleDateString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const response = await fetch(
      `https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/calendar/day/${date}`
    );

    const text = await response.text();

    // Safety check: if HTML/invalid is returned, we surface a clear error
    if (!text || !text.trim().startsWith('{')) {
      res.status(502).json({
        error: 'ATG API did not return JSON',
        responseBody: text.slice(0, 500) // safety limit
      });
      return;
    }

    const data = JSON.parse(text);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
