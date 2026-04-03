export default async function handler(req, res) {
  try {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const response = await fetch(
      `https://www.atg.se/services/racinginfo/v1/api/games/${id}`
    );

    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
