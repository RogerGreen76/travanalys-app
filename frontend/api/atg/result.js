export default async function handler(req, res) {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }

    const response = await fetch(
      `https://www.atg.se/services/racinginfo/v1/api/games/${gameId}`
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}