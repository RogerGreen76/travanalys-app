# V85 Travanalys

En webbapp för att analysera V85-travlopp och hitta spelvärda hästar baserat på odds vs streckprocent.

## Översikt

Appen hjälper dig att:
- Identifiera **underspelade hästar** (positiv value gap)
- Upptäcka **överspelade favoriter** (negativ value gap)
- Få **systemförslag** (spik, lås, gardering)

## Så här fungerar det

### 1. Ladda in data
Klistra in JSON-data för ett lopp eller använd "Ladda exempeldata" för att testa.

### 2. JSON-format

Appen stödjer **två JSON-format**:

#### A) Standardformat (eget format)
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
      "driver": "Kusk",
      "trainer": "Tränare"
    }
  ]
}
```

**Viktiga fält:**
- `odds`: Oddset × 100 (t.ex. 4.50 → 450)
- `betDistribution`: Streckprocent × 10 (t.ex. 22.0% → 220)

#### B) ATG-format (rå JSON från API)

Appen kan läsa **rå JSON direkt från ATG**:

```json
{
  "race": {
    "name": "V85-1",
    "track": { "name": "Solvalla" },
    "starts": [
      {
        "number": 1,
        "horse": { "name": "Hästnamn" },
        "driver": { "firstName": "Förnamn", "lastName": "Efternamn" },
        "pools": {
          "vinnare": { "odds": 450 },
          "V85": { "betDistribution": 220 }
        }
      }
    ]
  }
}
```

**Så här använder du ATG-JSON:**
1. Öppna ATG:s webbplats
2. Öppna DevTools (F12) → Network-fliken
3. Hitta API-anropet med loppdata
4. Kopiera Response-JSON
5. Klistra in direkt i appen
6. Tryck "Analysera"

Parsern känner **automatiskt** av formatet och extraherar rätt data!

Se [JSON_FORMAT.md](/app/JSON_FORMAT.md) för fullständig dokumentation.

### 3. Beräkningar (exakta formler)

Appen beräknar automatiskt:

**Grundläggande:**
- **Odds** = `odds / 100`
- **Streck %** = `betDistribution / 10`
- **Implied %** = `(1 / odds) × 100`

**Value-analys (nya):**
- **Value Ratio** = `implied_probability / (streck_procent / 100)`
- **Value Score** = `(implied_probability × 100) / streck_procent`
  - +1 om odds > 10
  - +1 om streck < 10%
  - -1 om streck > 40%
- **Play** = YES om value_ratio > 1.2 OCH odds > 4, annars NO

### 4. Färgkodning

| Färg | Betydelse | Value Ratio |
|------|-----------|-----------|
| 🟢 Grön | **Spelvärd** - Stark value | > 1.2 |
| 🟡 Gul | Neutral - Acceptabel | 0.9 - 1.2 |
| 🔴 Röd | **Överspelad** - Undvik | < 0.9 |

### 5. Funktioner

**Tabell:**
- ✓ Sortera på alla kolumner (inkl. Value Ratio, Value Score, Play)
- ✓ Filtrera: Alla hästar / Spelvärda (>2%) / Favoriter (<10)
- ✓ Sök på hästnamn eller nummer
- ✓ Exportera till CSV (inkl. alla nya kolumner)

**Systemförslag:**
- **Automatiskt läge**: Appen väljer baserat på value score
  - 1 Spik (högsta value score, eller favorit om inte överspelad)
  - 2 Lås (topp 2 value score)
  - 3-5 Gardering (value ratio > 1.1 eller streck < 5%)
- **Manuellt läge**: Kopiera och justera förslaget manuellt

**Nya kolumner:**
- **Value Ratio**: Visar förhållandet mellan implied probability och streck
- **Value Score**: Poäng-baserad värdering med justeringar
- **Play**: Tydlig YES/NO rekommendation

## Tips för användning

1. **Fokusera på Value Ratio** - Över 1.2 betyder att hästen är underspelade (grön = bra)
2. **Använd Value Score** - Högre score = bättre värde relativt streck
3. **Play-kolumnen** - "YES" betyder rekommenderad spelbar häst
4. **Kombinera med egen kunskap** - Appen ersätter inte din egen analys
5. **Var kritisk till extremvärden** - Mycket höga ratios kan indikera risk
6. **Testa med exempeldata först** - Lär dig hur appen fungerar

## Teknisk info

- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Ingen backend** - All beräkning sker i webbläsaren
- **Ingen data sparas** - Allt är session-baserat
- **Mörkt tema** - Optimerat för läsbarhet av mycket data

## Utveckling

```bash
# Installera dependencies
cd frontend
yarn install

# Starta utvecklingsserver
yarn start
```

## Begränsningar

- Ingen AI som tippar vinnare
- Ingen historisk analys
- Fokuserar enbart på odds vs streck (value)
- Ett lopp i taget

## Framtida förbättringar

Möjliga tilllägg i framtiden:
- Spara/ladda analyser
- Jämföra flera lopp
- Historik av tidigare analyser
- Export av systemförslag till spelformat
- Mobil-optimering

---

**V85 Travanalys** - Fokus på value, inte gissningar.
