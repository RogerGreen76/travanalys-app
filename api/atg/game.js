export default async function handler(req, res) {
  const { gameId } = req.query;

  const response = await fetch(
    `https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/games/${gameId}`
  );

  const data = await response.text();

  res.setHeader("Content-Type", "application/json");
  res.status(response.status).send(data);
}
