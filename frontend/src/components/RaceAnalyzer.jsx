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
    races: [
      {
        name: 'V85-1',
        track: {
          name: 'Solvalla'
        },
        startTime: '2024-01-20T15:20:00',
        distance: 2140,
        starts: [
          {
            postPosition: 1,
            horse: {
              name: 'Staro Broline',
              trainer: {
                firstName: 'Daniel',
                lastName: 'Redén'
              }
            },
            driver: {
              firstName: 'Örjan',
              lastName: 'Kihlström'
            },
            pools: {
              vinnare: {
                odds: 450
              },
              V85: {
                betDistribution: 220
              }
            }
          },
          {
            postPosition: 2,
            horse: {
              name: 'Global Badman',
              trainer: {
                firstName: 'Stefan',
                lastName: 'Melander'
              }
            },
            driver: {
              firstName: 'Björn',
              lastName: 'Goop'
            },
            pools: {
              vinnare: {
                odds: 890
              },
              V85: {
                betDistribution: 95
              }
            }
          },
          {
            postPosition: 3,
            horse: {
              name: 'Donatos',
              trainer: {
                firstName: 'Jerry',
                lastName: 'Riordan'
              }
            },
            driver: {
              firstName: 'Magnus A',
              lastName: 'Djuse'
            },
            pools: {
              vinnare: {
                odds: 1250
              },
              V85: {
                betDistribution: 68
              }
            }
          }
        ]
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

    // ATG-format: Använd races[0].starts som enda källa
    let startsList = null;
    let raceInfo = null;

    if (data.races && Array.isArray(data.races) && data.races.length > 0) {
      // Använd första loppet
      const race = data.races[0];
      raceInfo = race;
      
      if (race.starts && Array.isArray(race.starts)) {
        startsList = race.starts;
      }
    }

    if (!startsList) {
      throw new Error('Ingen startlista hittades. ATG-format kräver races[0].starts array.');
    }

    // Varning om för många hästar
    if (startsList.length > 20) {
      console.warn(`Varning: ${startsList.length} hästar hittades. Detta verkar vara fel lista (förväntade max 20).`);
    }

    // Extrahera loppinfo
    const race = {
      name: raceInfo?.name || raceInfo?.displayName || 'V85-lopp',
      track: raceInfo?.track?.name || raceInfo?.trackName || 'Okänd bana',
      date: raceInfo?.startTime || new Date().toISOString().split('T')[0],
      distance: raceInfo?.distance || null
    };

    // Mappa varje häst från starts-arrayen
    const horses = startsList
      .map((start, index) => {
        try {
          // En giltig häst måste ha postPosition och horse.name
          if (!start.postPosition && !start.number) {
            console.warn(`Start på index ${index} saknar postPosition, hoppar över`);
            return null;
          }

          if (!start.horse || !start.horse.name) {
            console.warn(`Start på index ${index} saknar horse.name, hoppar över`);
            return null;
          }

          // Extrahera fält
          const number = start.postPosition || start.number;
          const name = start.horse.name;
          
          // Odds - kan finnas i pools.vinnare.odds
          let odds = null;
          if (start.pools?.vinnare?.odds !== undefined) {
            odds = start.pools.vinnare.odds;
          }

          // BetDistribution - kan finnas i pools.V85.betDistribution
          let betDistribution = null;
          if (start.pools?.V85?.betDistribution !== undefined) {
            betDistribution = start.pools.V85.betDistribution;
          } else if (start.pools?.V86?.betDistribution !== undefined) {
            betDistribution = start.pools.V86.betDistribution;
          } else if (start.pools?.V75?.betDistribution !== undefined) {
            betDistribution = start.pools.V75.betDistribution;
          }

          // Driver - kombinera firstName + lastName
          let driver = null;
          if (start.driver?.firstName && start.driver?.lastName) {
            driver = `${start.driver.firstName} ${start.driver.lastName}`;
          } else if (start.driver?.name) {
            driver = start.driver.name;
          }

          // Trainer - från horse.trainer
          let trainer = null;
          if (start.horse.trainer?.firstName && start.horse.trainer?.lastName) {
            trainer = `${start.horse.trainer.firstName} ${start.horse.trainer.lastName}`;
          } else if (start.horse.trainer?.name) {
            trainer = start.horse.trainer.name;
          }

          // Validera att odds och betDistribution är giltiga (om de finns)
          if (odds !== null && (isNaN(odds) || odds <= 0)) {
            console.warn(`Häst ${number} (${name}) har ogiltig odds, sätter till null`);
            odds = null;
          }

          if (betDistribution !== null && (isNaN(betDistribution) || betDistribution <= 0)) {
            console.warn(`Häst ${number} (${name}) har ogiltig betDistribution, sätter till null`);
            betDistribution = null;
          }

          // Om odds ELLER betDistribution saknas, hoppa över hästen i analysen
          // men visa fortfarande i listan
          if (!odds || !betDistribution) {
            console.warn(`Häst ${number} (${name}) saknar odds eller streck, hoppar över i analys`);
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
          console.warn(`Kunde inte parsa start på index ${index}:`, err);
          return null;
        }
      })
      .filter(horse => horse !== null); // Ta bort null-värden

    if (horses.length === 0) {
      throw new Error('Inga giltiga hästar kunde parsas från startlistan. Kontrollera att odds och betDistribution finns.');
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
