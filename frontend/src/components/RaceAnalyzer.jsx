import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import HorseTable from './HorseTable';
import SystemBuilder from './SystemBuilder';
import { AlertCircle, Upload, FileJson } from 'lucide-react';

const RaceAnalyzer = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [raceData, setRaceData] = useState(null);
  const [analyzedHorses, setAnalyzedHorses] = useState([]);
  const [error, setError] = useState(null);

  const sampleJSON = {
    race: {
      name: 'V85-1',
      track: 'Solvalla',
      date: '2024-01-20',
      distance: 2140
    },
    horses: [
      {
        number: 1,
        name: 'Staro Broline',
        odds: 450,
        betDistribution: 220,
        driver: 'Örjan Kihlström',
        trainer: 'Daniel Redén'
      },
      {
        number: 2,
        name: 'Global Badman',
        odds: 890,
        betDistribution: 95,
        driver: 'Björn Goop',
        trainer: 'Stefan Melander'
      },
      {
        number: 3,
        name: 'Donatos',
        odds: 1250,
        betDistribution: 68,
        driver: 'Magnus A Djuse',
        trainer: 'Jerry Riordan'
      }
    ]
  };

  const analyzeHorses = (horses) => {
    return horses.map(horse => {
      // Grundläggande beräkningar
      const odds = horse.odds / 100; // t.ex. 450 -> 4.50
      const streckPercent = horse.betDistribution / 10; // t.ex. 220 -> 22.0
      const impliedProbability = (1 / odds) * 100; // i procent
      const streckDecimal = streckPercent / 100;
      const valueGap = (impliedProbability / 100) - streckDecimal;

      // Marknadens chans
      const marketProbability = (1 / odds) * 100;

      // Value ratio - nu som decimal (t.ex. 1.18 istället för 118.27)
      const valueRatio = impliedProbability / streckPercent;
      
      // Ranking Score
      let rankingScore = (impliedProbability * 100) / streckPercent;
      if (odds > 10) rankingScore += 1;
      if (streckPercent < 10) rankingScore += 1;
      if (streckPercent > 40) rankingScore -= 1;

      // Play rekommendation - justerade tröskelvärden
      let play = 'No play';
      if (valueRatio > 1.25) {
        play = 'Stark play';
      } else if (valueRatio >= 1.15) {
        play = 'Möjlig play';
      }

      // Value status - justerade tröskelvärden
      let valueStatus = 'Neutral';
      if (valueRatio > 1.20) {
        valueStatus = 'Spelvärd';
      } else if (valueRatio < 1.05) {
        valueStatus = 'Överspelad';
      }

      return {
        ...horse,
        odds: odds,
        streckPercent: streckPercent,
        impliedProbability: impliedProbability,
        marketProbability: marketProbability,
        valueGap: valueGap,
        valueRatio: valueRatio,
        rankingScore: rankingScore,
        play: play,
        valueStatus: valueStatus
      };
    });
  };

  // Rekursiv funktion för att hitta hästposter i JSON
  const findHorseObjects = (obj, found = []) => {
    if (!obj || typeof obj !== 'object') {
      return found;
    }

    // Kolla om detta objekt är en hästpost
    const isHorseObject = (
      (obj.postPosition !== undefined || obj.number !== undefined) &&
      (obj.horse?.name || obj.name) &&
      (obj.pools || obj.odds !== undefined || obj.betDistribution !== undefined)
    );

    if (isHorseObject) {
      found.push(obj);
    }

    // Fortsätt söka rekursivt i alla properties
    if (Array.isArray(obj)) {
      obj.forEach(item => findHorseObjects(item, found));
    } else {
      Object.values(obj).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          findHorseObjects(value, found);
        }
      });
    }

    return found;
  };

  // Rekursiv funktion för att hitta race metadata
  const findRaceMetadata = (obj) => {
    if (!obj || typeof obj !== 'object') return null;

    // Om detta objekt har race properties, returnera det
    if (obj.name && (obj.track || obj.startTime)) {
      return {
        name: obj.name,
        track: obj.track?.name || obj.track,
        startTime: obj.startTime,
        distance: obj.distance
      };
    }

    // Leta rekursivt i properties
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const found = findRaceMetadata(value);
        if (found) return found;
      }
    }

    return null;
  };

  const parseJSON = (jsonString) => {
    const data = JSON.parse(jsonString);
    
    // Kolla först om det är standardformat
    const isStandardFormat = data.horses && Array.isArray(data.horses);
    
    if (isStandardFormat) {
      // Standardformat - returnera som det är
      return {
        race: data.race || {},
        horses: data.horses
      };
    }

    // Annars: sök rekursivt efter hästposter i hela strukturen
    const horseObjects = findHorseObjects(data);
    
    if (horseObjects.length === 0) {
      throw new Error('Inga hästposter hittades i JSON-data. Kontrollera att data innehåller postPosition, horse.name och pools.');
    }

    // Extrahera loppinfo rekursivt
    const raceMetadata = findRaceMetadata(data);
    const race = {
      name: raceMetadata?.name || data.race?.name || data.name || data.raceName || 'V85-lopp',
      track: raceMetadata?.track || data.race?.track?.name || data.track?.name || data.track || 'Okänd bana',
      date: raceMetadata?.startTime || data.race?.startTime || data.startTime || new Date().toISOString().split('T')[0],
      distance: raceMetadata?.distance || data.race?.distance || data.distance || null
    };

    // Konvertera varje hästpost till standardformat
    const horses = horseObjects
      .map((horseObj, index) => {
        try {
          // Extrahera fält med fallbacks
          const number = horseObj.postPosition || horseObj.number || horseObj.startNumber || (index + 1);
          const name = horseObj.horse?.name || horseObj.name || horseObj.horseName || `Häst ${number}`;
          
          // Odds - kan finnas på flera platser
          let odds = null;
          if (horseObj.pools?.vinnare?.odds !== undefined) {
            odds = horseObj.pools.vinnare.odds;
          } else if (horseObj.pools?.V86?.odds !== undefined) {
            odds = horseObj.pools.V86.odds;
          } else if (horseObj.pools?.V75?.odds !== undefined) {
            odds = horseObj.pools.V75.odds;
          } else if (horseObj.odds !== undefined) {
            odds = horseObj.odds;
          } else if (horseObj.winnerOdds !== undefined) {
            odds = horseObj.winnerOdds;
          }

          // BetDistribution - kan finnas på flera platser
          let betDistribution = null;
          if (horseObj.pools?.V85?.betDistribution !== undefined) {
            betDistribution = horseObj.pools.V85.betDistribution;
          } else if (horseObj.pools?.V86?.betDistribution !== undefined) {
            betDistribution = horseObj.pools.V86.betDistribution;
          } else if (horseObj.pools?.V75?.betDistribution !== undefined) {
            betDistribution = horseObj.pools.V75.betDistribution;
          } else if (horseObj.betDistribution !== undefined) {
            betDistribution = horseObj.betDistribution;
          } else if (horseObj.streck !== undefined) {
            betDistribution = horseObj.streck * 10; // Om streck finns i procent
          }

          // Kusk och tränare
          const driver = horseObj.driver?.firstName && horseObj.driver?.lastName
            ? `${horseObj.driver.firstName} ${horseObj.driver.lastName}`
            : horseObj.driver?.name || horseObj.driver || null;
          
          const trainer = horseObj.trainer?.firstName && horseObj.trainer?.lastName
            ? `${horseObj.trainer.firstName} ${horseObj.trainer.lastName}`
            : horseObj.trainer?.name || horseObj.trainer || null;

          // Validera att vi har minsta nödvändiga data och att de är giltiga nummer
          if (!odds || !betDistribution || isNaN(odds) || isNaN(betDistribution) || odds <= 0 || betDistribution <= 0) {
            console.warn(`Häst ${number} (${name}) saknar giltig odds eller streckprocent, hoppar över`);
            return null;
          }

          return {
            number: number,
            name: name,
            odds: odds,
            betDistribution: betDistribution,
            driver: driver,
            trainer: trainer
          };
        } catch (err) {
          console.warn(`Kunde inte parsa häst på index ${index}:`, err);
          return null;
        }
      })
      .filter(horse => horse !== null); // Ta bort null-värden

    if (horses.length === 0) {
      throw new Error('Inga giltiga hästar kunde parsas. Kontrollera att odds och betDistribution finns och är giltiga värden.');
    }

    return { race, horses };
  };

  const handleParse = () => {
    setError(null);
    try {
      const parsed = parseJSON(jsonInput);
      
      // Validera att vi har hästar
      if (!parsed.horses || parsed.horses.length === 0) {
        throw new Error('Inga hästar hittades i JSON-data');
      }

      setRaceData(parsed.race || {});
      const analyzed = analyzeHorses(parsed.horses);
      setAnalyzedHorses(analyzed);
      
      toast.success(`✓ ${analyzed.length} hästar analyserade`, {
        description: parsed.race?.name || 'Lopp laddad'
      });
    } catch (err) {
      setError(err.message);
      toast.error('JSON-fel', {
        description: err.message
      });
    }
  };

  const loadSample = () => {
    setJsonInput(JSON.stringify(sampleJSON, null, 2));
    toast.info('Exempeldata inladdat', {
      description: 'Tryck "Analysera" för att fortsätta'
    });
  };

  const clearData = () => {
    setJsonInput('');
    setRaceData(null);
    setAnalyzedHorses([]);
    setError(null);
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
            V85 Travanalys
          </h1>
          <p className="text-gray-400 text-lg">Hitta spelvärda hästar baserat på odds vs streck</p>
        </div>

        {/* JSON Input Card */}
        <Card className="bg-[#151923] border-gray-800" data-testid="json-input-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileJson className="w-5 h-5" />
              Loppdata (JSON)
            </CardTitle>
            <CardDescription className="text-gray-400">
              Klistra in JSON-data (valfri struktur, parsern hittar automatiskt hästposter) eller använd exempeldata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              data-testid="json-input-textarea"
              placeholder='Klistra in JSON här...\n\nExempel:\n{\n  "race": { "name": "V85-1", "track": "Solvalla" },\n  "horses": [...]\n}'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="min-h-[200px] font-mono text-sm bg-[#0a0e1a] border-gray-700 text-gray-200"
            />
            
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md" data-testid="error-message">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="analyze-button"
                onClick={handleParse}
                disabled={!jsonInput.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Analysera
              </Button>
              <Button
                data-testid="load-sample-button"
                onClick={loadSample}
                variant="outline"
                className="border-gray-700 hover:bg-gray-800"
              >
                Ladda exempeldata
              </Button>
              <Button
                data-testid="clear-button"
                onClick={clearData}
                variant="ghost"
                className="hover:bg-gray-800"
              >
                Rensa
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Race Info */}
        {raceData && (
          <Card className="bg-[#151923] border-gray-800" data-testid="race-info-card">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6 text-sm">
                {raceData.name && (
                  <div>
                    <span className="text-gray-400">Lopp:</span>
                    <span className="ml-2 text-white font-semibold">{raceData.name}</span>
                  </div>
                )}
                {raceData.track && (
                  <div>
                    <span className="text-gray-400">Bana:</span>
                    <span className="ml-2 text-white font-semibold">{raceData.track}</span>
                  </div>
                )}
                {raceData.date && (
                  <div>
                    <span className="text-gray-400">Datum:</span>
                    <span className="ml-2 text-white font-semibold">{raceData.date}</span>
                  </div>
                )}
                {raceData.distance && (
                  <div>
                    <span className="text-gray-400">Distans:</span>
                    <span className="ml-2 text-white font-semibold">{raceData.distance}m</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Horse Table */}
        {analyzedHorses.length > 0 && (
          <>
            <HorseTable horses={analyzedHorses} />
            <SystemBuilder horses={analyzedHorses} />
          </>
        )}
      </div>
    </div>
  );
};

export default RaceAnalyzer;
