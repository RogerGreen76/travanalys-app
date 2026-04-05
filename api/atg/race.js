export default async function handler(req, res) {
  const { gameType, raceId } = req.query;

  if (!gameType || !raceId) {
    res.status(400).json({ error: 'gameType and raceId are required' });
    return;
  }

  const response = await fetch(
    `https://www.atg.se/services/racinginfo/v1/api/games/${gameType}_${raceId}`
  );

  const data = await response.text();

  res.setHeader('Content-Type', 'application/json');
  res.status(response.status).send(data);
}