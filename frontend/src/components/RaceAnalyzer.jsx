import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import HorseTable from './HorseTable';
import SystemBuilder from './SystemBuilder';
import { AlertCircle, Upload, FileJson, ChevronRight, TrendingUp } from 'lucide-react';

// Import the new data pipeline services
import { fetchGameData, parseManualImport } from '../services/atgApi';
import { normalizeRaceData } from '../services/normalizeRaceData';
import { analyzeRaceData } from '../services/analyzeRaceData';

/**
 * Filter races for a specific game type based on horse pools
 * @param {Array} races - Array of race objects
 * @param {string} gameType - Game type to filter by (V85, V86, etc.)
 * @returns {Array} Filtered races
 */
function getRacesForGameType(races, gameType) {
  return races.filter(race =>
    race.horses.some(horse =>
      horse.pools && Object.keys(horse.pools).some(poolKey =>
        poolKey === gameType || poolKey.toLowerCase() === gameType.toLowerCase()
      )
    )
  );
}

const RaceAnalyzer = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [allRaces, setAllRaces] = useState([]);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [selectedRace, setSelectedRace] = useState(null);
  const [analyzedHorses, setAnalyzedHorses] = useState([]);
  const [error, setError] = useState(null);
  
  // Navigation state
  const [selectedGameType, setSelectedGameType] = useState('V85');
  const [gameData, setGameData] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);

  // Ladda data när gameType ändras
  useEffect(() => {
    if (selectedGameType) {
      handleLoadGameType(selectedGameType);
    }
  }, [selectedGameType]);

  // Persist manuell ATG-json mellan pageladdningar
  useEffect(() => {
    const saved = localStorage.getItem('atgRawData');
    if (saved) {
      setJsonInput(saved);
     // setShowManualInput(true);

      try {
        const rawData = parseManualImport(saved);
        const gameType = rawData.gameType || 'V85';
        const normalizedData = normalizeRaceData(rawData, gameType);
        const analyzedData = analyzeRaceData(normalizedData);

        setSelectedGameType(gameType);
        setGameData(analyzedData);

        const parsedRaces = analyzedData.races.map((race, index) => {
          let track = 'Unknown';
          if (rawData.races?.[index]?.track?.name) {
            track = rawData.races[index].track.name;
          } else if (rawData.races?.[index]?.trackName) {
            track = rawData.races[index].trackName;
          }

          let date = new Date().toISOString().split('T')[0];
          if (rawData.races?.[index]?.startTime) {
            date = rawData.races[index].startTime.split('T')[0];
          }

          return {
            race: {
              number: index + 1,
              gameNumber: index + 1,
              name: `${gameType}-${index + 1}`,
              track: track,
              date: date,
              distance: race.distance
            },
            horses: race.horses
          };
        });

        setAllRaces(parsedRaces);
        setSelectedRaceIndex(0);
        setSelectedRace(parsedRaces[0]);
      } catch (err) {
        console.error('Failed to auto-import saved ATG JSON', err);
      }
    }
  }, []);

  // Update analyzed horses when selected race changes
  useEffect(() => {
    if (selectedRace) {
      setAnalyzedHorses(selectedRace.horses);
    }
  }, [selectedRace]);

  const handleLoadGameType = async (gameType) => {
    try {
      // Step 1: Fetch raw game data from ATG API (handles calendar lookup and game data fetching)
      const rawData = await fetchGameData(gameType);

      // Step 2: Extract races from the API response
      const apiRaces = rawData?.game?.races || [];

      if (apiRaces.length === 0) {
        throw new Error(`No races found for ${gameType}`);
      }

      // Step 3: Normalize the data
      const normalizedData = normalizeRaceData({ ...rawData, races: apiRaces }, gameType);

      // Step 4: Analyze the normalized data
      const analyzedData = analyzeRaceData(normalizedData);

      setGameData(analyzedData);

      // Step 5: Convert to the format expected by the UI
      const parsedRaces = analyzedData.races.map((race, index) => ({
        race: {
          number: index + 1,
          gameNumber: index + 1,
          name: `${gameType}-${index + 1}`,
          track: 'Unknown', // TODO: Add track info to normalized format
          date: new Date().toISOString().split('T')[0], // TODO: Add date to normalized format
          distance: race.distance
        },
        horses: race.horses
      }));

      // Step 6: Replace races completely and reset to first race
      setAllRaces(parsedRaces);
      setSelectedRaceIndex(0);
      setSelectedRace(parsedRaces[0]);

      // analyzedHorses will be set by useEffect when selectedRace changes

      toast.success(`${gameType} loaded`, {
        description: `${parsedRaces.length} races available`
      });
    } catch (err) {
      toast.error('Could not load data', {
        description: err.message
      });
    }
  };

  /**
   * Handle manual ATG JSON import using the new pipeline
   * Parses → Normalizes → Analyzes → Displays
   */
  const handleManualImport = async () => {
    setError(null);
    try {
      // Step 1: Parse the JSON safely
      const rawData = parseManualImport(jsonInput);

      // Step 2: Determine and persist gameType-specific raw JSON
      const gameType = rawData.gameType || selectedGameType || 'V85';
      localStorage.setItem(`atgRawData_${gameType}`, jsonInput);
      localStorage.setItem('atgRawData', jsonInput);

      // Step 3: Normalize the data
      const normalizedData = normalizeRaceData(rawData, gameType);

      // Step 3: Analyze the normalized data
      const analyzedData = analyzeRaceData(normalizedData);

      // Step 4: Update app state to match mock loading
      setSelectedGameType(gameType);
      setGameData(analyzedData);

      // Step 5: Convert to the format expected by the UI
      const parsedRaces = analyzedData.races.map((race, index) => {
        // Try to get track from raw data or use fallback
        let track = 'Unknown';
        if (rawData.races?.[index]?.track?.name) {
          track = rawData.races[index].track.name;
        } else if (rawData.races?.[index]?.trackName) {
          track = rawData.races[index].trackName;
        }

        // Try to get date from raw data or use today's date
        let date = new Date().toISOString().split('T')[0];
        if (rawData.races?.[index]?.startTime) {
          date = rawData.races[index].startTime.split('T')[0];
        }

        return {
          race: {
            number: index + 1,
            gameNumber: index + 1,
            name: `${gameType}-${index + 1}`,
            track: track,
            date: date,
            distance: race.distance
          },
          horses: race.horses
        };
      });

      setAllRaces(parsedRaces);
      setSelectedRaceIndex(0);
      setSelectedRace(parsedRaces[0]);
      setShowManualInput(false);
      setJsonInput('');

      toast.success(`✓ ${parsedRaces.length} lopp importerade`, {
        description: `${parsedRaces.reduce((sum, r) => sum + r.horses.length, 0)} hästar totalt`
      });
    } catch (err) {
      setError(err.message);
      toast.error('Importfel', {
        description: err.message
      });
    }
  };

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
    handleManualImport();
  };

  const handleRaceChange = (index) => {
    const raceIndex = parseInt(index);

    // Add fade effect
    setAnalyzedHorses([]);

    setTimeout(() => {
      setSelectedRaceIndex(raceIndex);
      setSelectedRace(allRaces[raceIndex]);
      // analyzedHorses will be updated by useEffect

      toast.info(`Visar lopp ${raceIndex + 1}`, {
        description: allRaces[raceIndex].race.name
      });
    }, 50);
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
    setSelectedRace(null);
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
            Travanalysen
          </h1>
          <p className="text-gray-400 text-lg">Identifiera spelvärda hästar baserat på odds, streck och marknadsedge</p>
        </div>

        {/* Game Type Navigation */}
        <Card className="bg-[#151923] border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingUp className="w-5 h-5" />
              Välj spelform
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedGameType} onValueChange={(value) => {
              setSelectedGameType(value);
            }}>
              <TabsList className="bg-[#0a0e1a] w-full justify-start flex-wrap h-auto game-type-tabs">
                <TabsTrigger value="V85" className="data-[state=active]:bg-blue-600" data-testid="tab-v85">
                  V85
                </TabsTrigger>
                <TabsTrigger value="V86" className="data-[state=active]:bg-blue-600" data-testid="tab-v86">
                  V86
                </TabsTrigger>
                <TabsTrigger value="V64" className="data-[state=active]:bg-blue-600" data-testid="tab-v64">
                  V64
                </TabsTrigger>
                <TabsTrigger value="V65" className="data-[state=active]:bg-blue-600" data-testid="tab-v65">
                  V65
                </TabsTrigger>
                <TabsTrigger value="V5" className="data-[state=active]:bg-blue-600" data-testid="tab-v5">
                  V5
                </TabsTrigger>
                <TabsTrigger value="DD" className="data-[state=active]:bg-blue-600" data-testid="tab-dd">
                  DD
                </TabsTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="ml-auto border-gray-700 hover:bg-gray-800"
                  data-testid="toggle-manual-input"
                >
                  <FileJson className="w-4 h-4 mr-2" />
                  {showManualInput ? 'Dölj' : 'Visa'} Manuell Import
                </Button>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Race Tabs - visas när lopp finns */}
        {allRaces.length > 0 && !showManualInput && (
          <Card className="bg-[#151923] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Välj lopp att analysera</CardTitle>
              <CardDescription className="text-gray-400">
                {allRaces.length} lopp i {selectedGameType}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedRaceIndex.toString()} onValueChange={(value) => handleRaceChange(value)}>
                <TabsList className="bg-[#0a0e1a] w-full justify-start flex-wrap h-auto race-tabs">
                  {allRaces.map((raceItem, index) => (
                    <TabsTrigger
                      key={index}
                      value={index.toString()}
                      className="data-[state=active]:bg-purple-600"
                      data-testid={`race-tab-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{`${selectedGameType}-${raceItem.race.number || index + 1}`}</span>
                        <span className="text-xs text-gray-400">({raceItem.horses.length})</span>
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* JSON Input Card - visas när showManualInput är true */}
        {showManualInput && (
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
        )}

        {/* Race Selector (för manual JSON import) - visas när flera lopp finns och manual mode */}
        {allRaces.length > 1 && showManualInput && (
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
                        <span className="font-semibold">{`${selectedGameType}-${raceItem.race.number || index + 1}`}</span>
                        <span className="text-gray-400">•</span>
                        <span>{raceItem.race.track}</span>
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
                  <span className="ml-2 text-white font-semibold">{`${selectedGameType}-${currentRace.race.number || selectedRaceIndex + 1}`}</span>
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
          <div className="space-y-6">
            <HorseTable horses={analyzedHorses} />
            <SystemBuilder 
              horses={analyzedHorses} 
              gameType={selectedGameType}
              allRaces={allRaces}
              selectedRaceIndex={selectedRaceIndex}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RaceAnalyzer;
