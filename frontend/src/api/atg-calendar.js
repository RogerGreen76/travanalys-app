// This is a Vercel serverless proxy route for ATG calendar to avoid CORS issues
// Requested by the frontend in atgApi.js

export default async function handler(req, res) {
  try {
    const date = req.query.date || new Date().toLocaleDateString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const url = `https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/calendar/day/${date}`;

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `ATG calendar fetch failed: ${response.status}`, details: text });
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
    res.status(500).json({ error: 'ATG calendar proxy error', message: error.message });
  }
}
