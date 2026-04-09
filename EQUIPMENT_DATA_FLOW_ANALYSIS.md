# Equipment Data Flow Analysis

## Current Data Flow Chain

```
Raw API Response (atgApi.js)
    ↓
Mock Data: generateMockHorses()
    ↓
normalizeRaceData.js → normalizeHorse()
    ↓
analyzeRaceData.js → enriches with scores
    ↓
HorseTable.jsx (receives horses array)
    ↓
EquipmentIndicator.jsx (tries to render)
```

---

## Stage-by-Stage Analysis

### 1. ✅ RAW DATA LAYER (atgApi.js, lines 346-425)

**Status: Equipment data EXISTS**

Mock data structure in `generateMockHorses()`:

```javascript
// Line 421
shoes: i % 3 === 0 ? "barfota" : "beskod";
```

Also includes potential fields:

- `horse.trainer` ✅
- `horse.driver` ✅
- `pools` ✅
- `form` ✅
- `distance` ✅
- `startMethod` ✅
- **`shoes`** ✅ **← Equipment field IS HERE**

**Raw start object keys typical structure:**

```
{
  postPosition: 1,
  horse: { name, trainer, record },
  driver: { firstName, lastName },
  pools: { vinnare: { odds }, V85: { betDistribution } },
  form: "1-1-2-3-1",
  distance: 2140,
  startMethod: "volt",
  shoes: "barfota"  ✅ FIELD EXISTS
}
```

---

### 2. ❌ NORMALIZATION LAYER (normalizeRaceData.js, lines 66-150)

**Status: Equipment data NOT EXTRACTED**

The `normalizeHorse()` function extracts:

- ✅ `number`
- ✅ `name`
- ✅ `driver` (firstName + lastName combined)
- ✅ `trainer` (firstName + lastName combined)
- ✅ `odds`
- ✅ `betDistribution`
- ✅ `postPosition`
- ❌ `shoes` **NOT EXTRACTED**
- ❌ `sulky` **NOT EXTRACTED**
- ❌ `cart` **NOT EXTRACTED**
- ❌ `bike` **NOT EXTRACTED**
- ❌ `equipment` **NOT EXTRACTED**

**Normalized horse object returned:**

```javascript
{
  number: 1,
  name: "Staro Broline",
  driver: "Örjan Kihlström",
  trainer: "Daniel Redén",
  odds: 650,
  betDistribution: 1205,
  postPosition: 1
  // ❌ NO EQUIPMENT FIELDS HERE
}
```

**🔴 CHAIN BREAK POINT #1: Equipment fields are stripped during normalization**

---

### 3. ✅ ENRICHMENT LAYER (analyzeRaceData.js)

**Status: Equipment IS used for scoring, BUT not passed through**

Lines ~519, 576:

```javascript
const equipmentScore = getEquipmentSignal(horse, tipskommentar);
upsetScore += equipmentScore;
```

Equipment is read (looking for same fields that were never extracted) and used for `upsetScore`, then returned:

```javascript
equipmentScore,  // ← Returned in output object
```

However, the horse object passed to this function is already the **normalized** object (without equipment fields), so `getEquipmentSignal()` always returns 0 because there's no data to parse.

**🔴 CHAIN BREAK POINT #2: Equipment fields needed by analyzeRaceData aren't present in the normalized horse**

---

### 4. ✅ TABLE RENDERING (HorseTable.jsx)

**Status: Component rendered, but receives horse without equipment**

The table receives the enriched horse object from analyzeRaceData, which includes:

- ✅ `play`, `isPotentialUpset`, `valueStatus` (scores)
- ❌ No equipment fields

The component:

```jsx
<EquipmentIndicator horse={horse} /> // ← Component is rendered
```

But the horse object passed has no equipment data.

**Result: EquipmentIndicator receives empty data, doesn't render anything**

---

### 5. ✅ COMPONENT LAYER (EquipmentIndicator.jsx)

**Status: Component EXISTS and handles missing data gracefully**

The component correctly:

- ✅ Looks for all possible equipment field names
- ✅ Returns `null` if no data found
- ✅ Won't break if fields are missing

But receives an empty horse object (from stage 4).

---

## Summary Table

| Stage        | Component                             | Equipment Data           | Status                |
| ------------ | ------------------------------------- | ------------------------ | --------------------- |
| 1. Raw API   | atgApi.js (generateMockHorses)        | `shoes: 'barfota'`       | ✅ EXISTS             |
| 2. Normalize | normalizeRaceData.js (normalizeHorse) | Not extracted            | ❌ **REMOVED HERE**   |
| 3. Analyze   | analyzeRaceData.js                    | Not available            | ❌ Can't process      |
| 4. Table     | HorseTable.jsx                        | Not in horse object      | ❌ Missing            |
| 5. Component | EquipmentIndicator.jsx                | Looks for missing fields | ✅ Handles gracefully |

---

## Debug Output Messages

When you run the app and open the browser console, you will see:

```
[normalizeHorse DEBUG] Raw start object for Staro Broline
  {shoes: "barfota", shoeInfo: undefined, ...}
  → ✅ Raw data HAS shoes field

[normalizeHorse DEBUG] Normalized horse: Staro Broline
  {normalizedKeys: array(7), hasShoes: false, hasSulky: false}
  → ❌ Shoes removed by normalization

[HorseTable INIT DEBUG] First horse from props:
  {shoes: undefined, sulky: undefined, equipment: undefined, hasEquipmentData: false}
  → ❌ Still missing at table render time

[EquipmentIndicator DEBUG] Parsing equipment for Staro Broline
  {shoesText: "", sulkyText: "", combined: "", hasData: false}
  → ❌ Component receives empty data
```

---

## Solution Path

**To fix this, we need to:**

1. **Extract equipment in normalizeHorse()** (normalizeRaceData.js)
   - Add `shoes`, `sulky`, etc. to the normalized object
   - Pass these fields through the pipeline

2. **Verify analyzeRaceData receives them**
   - Equipment fields will then be available for `getEquipmentSignal()`
   - Scoring will work correctly

3. **EquipmentIndicator will then render**
   - Component already exists and is wired up
   - Just needs data to arrive

---

## Files Modified for Debug

1. `normalizeRaceData.js` - Added logs to show raw vs. normalized
2. `HorseTable.jsx` - Added logs to show what horse receives
3. `EquipmentIndicator.jsx` - Added logs to show parsing attempts

**All logs are contained and won't spam console heavily - only first horse per render.**
