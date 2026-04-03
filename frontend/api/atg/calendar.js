export default async function handler(req, res) {
  try {
    const { date } = req.query;
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }

    const response = await fetch(
      `https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/calendar/day/${date}`
    );

    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
