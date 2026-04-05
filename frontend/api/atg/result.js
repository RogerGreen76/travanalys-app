export default async function handler(req, res) {
  try {
    const { gameType, raceId } = req.query;

    const response = await fetch(
      `https://www.atg.se/services/racinginfo/v1/api/games/${gameType}_${raceId}`
    );

    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(text);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}