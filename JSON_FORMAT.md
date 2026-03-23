# JSON-format för V85 Travanalys

Appen stödjer två JSON-format:

## 1. Standardformat (eget format)

```json
{
  "race": {
    "name": "V85-1",
    "track": "Solvalla",
    "date": "2024-01-20",
    "distance": 2140
  },
  "horses": [
    {
      "number": 1,
      "name": "Hästnamn",
      "odds": 450,
      "betDistribution": 220,
      "driver": "Kusk Name",
      "trainer": "Tränare Name"
    }
  ]
}
```

**Obligatoriska fält per häst:**
- `number` - Startnummer
- `name` - Hästnamn
- `odds` - Odds × 100 (t.ex. 4.50 = 450)
- `betDistribution` - Streckprocent × 10 (t.ex. 22.0% = 220)

**Valfria fält:**
- `driver` - Kusk
- `trainer` - Tränare

## 2. ATG-format (rå JSON från API)

Appen kan läsa in rå JSON direkt från ATG:s API eller DevTools.

### Exempel på ATG-struktur:

```json
{
  "race": {
    "id": "2024_85_1",
    "name": "V85-1",
    "track": {
      "name": "Solvalla"
    },
    "startTime": "2024-01-20T15:20:00",
    "distance": 2140,
    "starts": [
      {
        "number": 1,
        "postPosition": 1,
        "horse": {
          "name": "Hästnamn"
        },
        "driver": {
          "firstName": "Förnamn",
          "lastName": "Efternamn"
        },
        "trainer": {
          "firstName": "Förnamn",
          "lastName": "Efternamn"
        },
        "pools": {
          "vinnare": {
            "odds": 450
          },
          "V85": {
            "betDistribution": 220
          }
        }
      }
    ]
  }
}
```

### Vad appen extraherar från ATG-format:

**Loppinfo:**
- `race.name` eller `name` → Loppnamn
- `race.track.name` eller `track` → Bana
- `race.startTime` eller `startTime` → Datum/tid
- `race.distance` eller `distance` → Distans

**Hästdata (från `race.starts[]` eller `starts[]`):**
- `number` eller `postPosition` eller `startNumber` → Startnummer
- `horse.name` eller `name` → Hästnamn
- `pools.vinnare.odds` eller `pools.V86.odds` eller `odds` → Odds
- `pools.V85.betDistribution` eller `pools.V86.betDistribution` → Streckprocent
- `driver.firstName + driver.lastName` eller `driver.name` → Kusk
- `trainer.firstName + trainer.lastName` eller `trainer.name` → Tränare

### Flexibilitet

Parsern försöker hitta data på flera platser:
- Hästar kan finnas i `race.starts`, `starts`, `horses`, eller direkt som array
- Odds kan finnas i `pools.vinnare`, `pools.V86`, `pools.V75`, eller direkt som `odds`
- BetDistribution kan finnas i `pools.V85`, `pools.V86`, `pools.V75`, eller som `betDistribution`

### Felhantering

Om en häst saknar `odds` eller `betDistribution` hoppar appen över den hästen och fortsätter med resten.

En varning visas i konsolen: `"Häst X (Namn) saknar odds eller streckprocent, hoppar över"`

## Hur du använder ATG-JSON

1. Öppna ATG:s webbplats
2. Öppna DevTools (F12) → Network-fliken
3. Hitta API-anropet som returnerar loppdata
4. Kopiera Response-JSON
5. Klistra in direkt i appen
6. Tryck "Analysera"

Appen känner automatiskt av formatet och extraherar rätt data!

## Tips

- Om du får felmeddelande, kontrollera att JSON är giltig
- Appen tål saknade fält - den hoppar över hästar som inte kan parsas
- Både V85, V86 och V75-format fungerar
- Du kan blanda standardformat och ATG-format mellan olika analyser
