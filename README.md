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

### 3. Beräkningar (exakta formler)

Appen beräknar automatiskt:

- **Odds** = `odds / 100`
- **Streck %** = `betDistribution / 10`
- **Implied %** = `(1 / odds) × 100`
- **Value Gap** = `(implied % / 100) - (streck % / 100)`

### 4. Färgkodning

| Färg | Betydelse | Value Gap |
|------|-----------|-----------|
| 🟢 Grön | **Spelvärd** - Underspelade | > 2% |
| 🟡 Gul | Neutral | 0% till 2% |
| 🔴 Röd | **Överspelad** - Undvik | < 0% |

### 5. Funktioner

**Tabell:**
- ✓ Sortera på alla kolumner
- ✓ Filtrera: Alla hästar / Spelvärda (>2%) / Favoriter (<10)
- ✓ Sök på hästnamn eller nummer
- ✓ Exportera till CSV

**Systemförslag:**
- **Automatiskt läge**: Appen väljer automatiskt baserat på value gap
  - 1 Spik (högsta value, rimligt odds)
  - 2 Lås (bra value)
  - 3-5 Gardering (acceptabelt value)
- **Manuellt läge**: Kopiera och justera förslaget manuellt

## Tips för användning

1. **Fokusera på value gap** - Positiv value gap betyder att hästen är underspelade
2. **Kombinera med egen kunskap** - Appen ersätter inte din egen analys
3. **Var kritisk till höga odds** - Underspelade hästar med mycket höga odds kan vara riskabla
4. **Testa med exempeldata först** - Lär dig hur appen fungerar innan du använder riktig data

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
