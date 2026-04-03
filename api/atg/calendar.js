export default function handler(req, res) {
  res.status(200).json({ ok: true, route: 'calendar' });
}

// TODO: After confirming route path works, restore ATG proxy below:
// export default async function handler(req, res) {
//   try {
//     const date = req.query.date || new Date().toLocaleDateString('sv-SE', {
//       timeZone: 'Europe/Stockholm',
//       year: 'numeric',
//       month: '2-digit',
//       day: '2-digit'
//     });
//
//     const response = await fetch(
//       `https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/calendar/day/${date}`
//     );
//
//     const text = await response.text();
//     if (!text.trim().startsWith('{')) {
//       res.status(502).json({
//         error: 'ATG API did not return JSON',
//         responseBody: text.slice(0, 500)
//       });
//       return;
//     }
//
//     const data = JSON.parse(text);
//
//     res.status(200).json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// }

