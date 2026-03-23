import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import HorseTable from './HorseTable';
import SystemBuilder from './SystemBuilder';
import { AlertCircle, Upload, FileJson, ChevronRight } from 'lucide-react';

const RaceAnalyzer = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [allRaces, setAllRaces] = useState([]);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [analyzedHorses, setAnalyzedHorses] = useState([]);
  const [error, setError] = useState(null);

  const sampleJSON = {
    races: [
      {
        number: 1,
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
                betDistribution: 2200
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
                betDistribution: 950
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
                betDistribution: 680
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
      const streckPercent = horse.betDistribution / 100; // ÄNDRAT: 1405 -> 14.05%
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
    
    // Kolla först om det är standardformat (single race)
    const isStandardFormat = data.horses && Array.isArray(data.horses);
    
    if (isStandardFormat) {
      // Standardformat - returnera som ett lopp
      return [{
        race: data.race || {},
        horses: data.horses
      }];
    }

    // ATG-format: Importera ALLA lopp från races arrayen
    if (!data.races || !Array.isArray(data.races) || data.races.length === 0) {
      throw new Error('Ingen races-array hittades. ATG-format kräver races[] array.');
    }

    // Parsa alla lopp
    const allRaces = data.races.map((race, raceIndex) => {
      if (!race.starts || !Array.isArray(race.starts)) {
        console.warn(`Lopp ${raceIndex + 1} saknar starts-array, hoppar över`);
        return null;
      }

      // Varning om för många hästar
      if (race.starts.length > 20) {
        console.warn(`Varning: Lopp ${raceIndex + 1} har ${race.starts.length} hästar (förväntade max 20)`);
      }

      // Extrahera loppinfo
      const raceInfo = {
        number: race.number || race.raceNumber || (raceIndex + 1),
        name: race.name || race.displayName || `Lopp ${raceIndex + 1}`,
        track: race.track?.name || race.trackName || 'Okänd bana',
        date: race.startTime || new Date().toISOString().split('T')[0],
        distance: race.distance || null
      };

      // Mappa varje häst från starts-arrayen
      const horses = race.starts
        .map((start, index) => {
          try {
            // En giltig häst måste ha postPosition och horse.name
            if (!start.postPosition && !start.number) {
              console.warn(`Lopp ${raceIndex + 1}, start ${index}: saknar postPosition`);
              return null;
            }

            if (!start.horse || !start.horse.name) {
              console.warn(`Lopp ${raceIndex + 1}, start ${index}: saknar horse.name`);
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

            // BetDistribution - VIKTIGT: Nu /100 istället för /10
            // 1405 → 14.05%, 2367 → 23.67%
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
              console.warn(`Lopp ${raceIndex + 1}, häst ${number} (${name}): ogiltig odds`);
              odds = null;
            }

            if (betDistribution !== null && (isNaN(betDistribution) || betDistribution <= 0)) {
              console.warn(`Lopp ${raceIndex + 1}, häst ${number} (${name}): ogiltig betDistribution`);
              betDistribution = null;
            }

            // Om odds ELLER betDistribution saknas, hoppa över hästen i analysen
            if (!odds || !betDistribution) {
              console.warn(`Lopp ${raceIndex + 1}, häst ${number} (${name}): saknar odds eller streck`);
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
            console.warn(`Lopp ${raceIndex + 1}, kunde inte parsa start ${index}:`, err);
            return null;
          }
        })
        .filter(horse => horse !== null); // Ta bort null-värden

      if (horses.length === 0) {
        console.warn(`Lopp ${raceIndex + 1} har inga giltiga hästar`);
        return null;
      }

      return {
        race: raceInfo,
        horses: horses
      };
    }).filter(race => race !== null); // Ta bort lopp utan hästar

    if (allRaces.length === 0) {
      throw new Error('Inga giltiga lopp kunde parsas från JSON-data.');
    }

    return allRaces;
  };

  const handleParse = () => {
    setError(null);
    try {
      const parsedRaces = parseJSON(jsonInput);
      
      // Validera att vi har lopp
      if (!parsedRaces || parsedRaces.length === 0) {
        throw new Error('Inga lopp hittades i JSON-data');
      }

      setAllRaces(parsedRaces);
      setSelectedRaceIndex(0);
      
      // Analysera första loppet
      const analyzed = analyzeHorses(parsedRaces[0].horses);
      setAnalyzedHorses(analyzed);
      
      toast.success(`✓ ${parsedRaces.length} lopp importerade`, {
        description: `${parsedRaces[0].horses.length} hästar i första loppet`
      });
    } catch (err) {
      setError(err.message);
      toast.error('JSON-fel', {
        description: err.message
      });
    }
  };

  const handleRaceChange = (index) => {
    const raceIndex = parseInt(index);
    setSelectedRaceIndex(raceIndex);
    const analyzed = analyzeHorses(allRaces[raceIndex].horses);
    setAnalyzedHorses(analyzed);
    
    toast.info(`Visar lopp ${raceIndex + 1}`, {
      description: allRaces[raceIndex].race.name
    });
  };

  const loadSample = () => {
    setJsonInput(JSON.stringify(sampleJSON, null, 2));
    toast.info('Exempeldata inladdat', {
      description: 'Tryck "Analysera" för att fortsätta'
    });
  };

  const clearData = () => {
    setJsonInput('');
    setAllRaces([]);
    setSelectedRaceIndex(0);
    setAnalyzedHorses([]);
    setError(null);
  };

  const currentRace = allRaces.length > 0 ? allRaces[selectedRaceIndex] : null;

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

        {/* Race Selector - visas när flera lopp finns */}
        {allRaces.length > 1 && (
          <Card className="bg-[#151923] border-gray-800" data-testid="race-selector-card">
            <CardHeader>
              <CardTitle className="text-white">Välj lopp att analysera</CardTitle>
              <CardDescription className="text-gray-400">
                {allRaces.length} lopp importerade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedRaceIndex.toString()} onValueChange={handleRaceChange}>
                <SelectTrigger className="bg-[#0a0e1a] border-gray-700" data-testid="race-selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#151923] border-gray-700">
                  {allRaces.map((raceItem, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      <div className="flex items-center gap-2">
                        <ChevronRight className="w-4 h-4" />
                        <span className="font-semibold">Lopp {raceItem.race.number || index + 1}</span>
                        <span className="text-gray-400">•</span>
                        <span>{raceItem.race.name}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-sm text-gray-500">{raceItem.horses.length} hästar</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Race Info */}
        {currentRace && (
          <Card className="bg-[#151923] border-gray-800" data-testid="race-info-card">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-gray-400">Lopp:</span>
                  <span className="ml-2 text-white font-semibold">{currentRace.race.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">Bana:</span>
                  <span className="ml-2 text-white font-semibold">{currentRace.race.track}</span>
                </div>
                {currentRace.race.date && (
                  <div>
                    <span className="text-gray-400">Datum:</span>
                    <span className="ml-2 text-white font-semibold">{currentRace.race.date}</span>
                  </div>
                )}
                {currentRace.race.distance && (
                  <div>
                    <span className="text-gray-400">Distans:</span>
                    <span className="ml-2 text-white font-semibold">{currentRace.race.distance}m</span>
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
