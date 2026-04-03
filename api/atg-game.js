export default async function handler(req, res) {
  try {
    const gameId = req.query.gameId;
    if (!gameId) {
      res.status(400).json({ error: 'gameId query parameter is required' });
      return;
    }

    const url = `https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/games/${gameId}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `ATG game fetch failed: ${response.status}`, details: text });
      return;
    }

    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'ATG game proxy error', message: error.message });
  }
}
