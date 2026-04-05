export default async function handler(req, res) {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }

    const atgUrl = `https://www.atg.se/services/racinginfo/v1/api/games/${gameId}`;
    console.log('ATG RESULT PROXY URL:', atgUrl);

    const response = await fetch(atgUrl, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0'
      }
    });

    const text = await response.text();

    console.log('ATG RESULT PROXY STATUS:', response.status);
    console.log('ATG RESULT PROXY TEXT:', text.slice(0, 500));

    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(text);
  } catch (error) {
    console.error('ATG RESULT PROXY ERROR:', error);
    res.status(500).json({ error: error.message });
  }
}