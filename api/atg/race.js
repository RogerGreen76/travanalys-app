export default async function handler(req, res) {
  const { raceId } = req.query;

  if (!raceId) {
    res.status(400).json({ error: 'raceId is required' });
    return;
  }

  const response = await fetch(
    `https://www.atg.se/services/racinginfo/v1/api/races/${raceId}`
  );

  const data = await response.text();

  res.setHeader('Content-Type', 'application/json');
  res.status(response.status).send(data);
}