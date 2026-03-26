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

const RaceAnalyzer = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [allRaces, setAllRaces] = useState([]);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [analyzedHorses, setAnalyzedHorses] = useState([]);
  const [error, setError] = useState(null);
  
  // Navigation state
  const [selectedGameType, setSelectedGameType] = useState('V85');
  const [gameData, setGameData] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);

  // Mock data funktion - ersätts senare med riktig API
  const loadGameType = (gameType, date = '2024-01-20') => {
    // Simulera olika antal lopp per spelform
    const loppCount = {
      'V85': 8,
      'V86': 6,
      'V64': 6,
      'V65': 6,
      'V5': 5,
      'DD': 2  // Dagens Dubbel har alltid 2 lopp
    };

    const numRaces = loppCount[gameType] || 6;
    
    // Generera mockdata för alla lopp
    const races = [];
    for (let i = 0; i < numRaces; i++) {
      races.push({
        number: i + 1,
        name: `${gameType}-${i + 1}`,
        track: {
          name: i % 2 === 0 ? 'Solvalla' : 'Åby'
        },
        startTime: `${date}T15:${20 + i * 10}:00`,
        distance: 2140 + i * 40,
        starts: generateMockHorses(i + 1)
      });
    }

    return {
      gameType: gameType,
      date: date,
      races: races
    };
  };

  // Generera mock-hästar för ett lopp
  const generateMockHorses = (loppNummer) => {
    const hästnamn = [
      ['Staro Broline', 'Global Badman', 'Donatos', 'Perfect Kronos', 'Muscle Hustle'],
      ['Racing Beauty', 'Super Nova', 'Eagle Eye', 'Thunder Strike', 'Golden Arrow'],
      ['Mighty Max', 'Quick Silver', 'Star Runner', 'Blue Diamond', 'Red Baron'],
      ['Speed King', 'Dream Dancer', 'Lucky Star', 'Wild Wind', 'Brave Heart'],
      ['Royal Flash', 'Silver Bullet', 'Magic Moment', 'Flying Star', 'Bold Eagle'],
      ['Night Rider', 'Storm Cloud', 'Fire Storm', 'Ice Queen', 'Golden Dream'],
      ['Power Play', 'Swift Arrow', 'Bright Future', 'Dark Horse', 'True Spirit'],
      ['Fast Lane', 'High Flyer', 'Noble Knight', 'Pure Gold', 'Sharp Shooter']
    ];

    const kuskar = [
      ['Örjan', 'Kihlström'],
      ['Björn', 'Goop'],
      ['Magnus A', 'Djuse'],
      ['Erik', 'Adielsson'],
      ['Stefan', 'Persson']
    ];

    const tränare = [
      ['Daniel', 'Redén'],
      ['Stefan', 'Melander'],
      ['Jerry', 'Riordan'],
      ['Robert', 'Bergh'],
      ['Timo', 'Nurmos']
    ];

    // Mock för senaste lopp (1=vinn, 2-5=placering, 0=ej placering, x=struken)
    const formExamples = [
      '1-1-2-3-1',
      '2-1-3-1-2',
      '3-2-1-4-2',
      '1-2-2-1-3',
      '4-3-2-5-1',
      '2-3-1-2-4',
      '5-4-3-2-1',
      '1-3-2-4-3'
    ];

    const hästSet = hästnamn[(loppNummer - 1) % hästnamn.length];
    const numHorses = 8 + (loppNummer % 4); // 8-11 hästar per lopp

    return Array.from({ length: Math.min(numHorses, hästSet.length) }, (_, i) => {
      const baseOdds = 400 + i * 200 + Math.random() * 300;
      const baseStreck = 800 + i * 200 + Math.random() * 500;

      return {
        postPosition: i + 1,
        horse: {
          name: hästSet[i],
          trainer: {
            firstName: tränare[i % tränare.length][0],
            lastName: tränare[i % tränare.length][1]
          },
          // Sportsliga data
          record: {
            starts: 20 + Math.floor(Math.random() * 30),
            wins: 3 + Math.floor(Math.random() * 8),
            places: 5 + Math.floor(Math.random() * 10)
          }
        },
        driver: {
          firstName: kuskar[i % kuskar.length][0],
          lastName: kuskar[i % kuskar.length][1]
        },
        pools: {
          vinnare: {
            odds: Math.round(baseOdds)
          },
          V85: {
            betDistribution: Math.round(baseStreck)
          }
        },
        // Ytterligare sportsliga data
        form: formExamples[i % formExamples.length],
        distance: 2140,
        startMethod: i % 2 === 0 ? 'volt' : 'auto',
        shoes: i % 3 === 0 ? 'barfota' : 'beskod'
      };
    });
  };

  // Ladda data när gameType ändras
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedGameType && !showManualInput) {
      handleLoadGameType(selectedGameType);
    }
  }, [selectedGameType]);

  const handleLoadGameType = (gameType) => {
    try {
      const data = loadGameType(gameType);
      setGameData(data);
      
      // Parse alla lopp
      const parsedRaces = data.races.map((race, index) => ({
        race: {
          number: race.number,
          name: race.name,
          track: race.track.name,
          date: race.startTime,
          distance: race.distance
        },
        horses: race.starts.map((start) => ({
          number: start.postPosition,
          name: start.horse.name,
          odds: start.pools.vinnare.odds,
          betDistribution: start.pools.V85.betDistribution,
          driver: `${start.driver.firstName} ${start.driver.lastName}`,
          trainer: `${start.horse.trainer.firstName} ${start.horse.trainer.lastName}`,
          // Sportsliga data
          postPosition: start.postPosition,
          form: start.form,
          record: start.horse.record,
          startMethod: start.startMethod,
          shoes: start.shoes
        })).filter(h => h.odds && h.betDistribution)
      }));

      setAllRaces(parsedRaces);
      setSelectedRaceIndex(0);
      
      // Analysera första loppet
      if (parsedRaces.length > 0) {
        const analyzed = analyzeHorses(parsedRaces[0].horses);
        setAnalyzedHorses(analyzed);
      }
      
      toast.success(`${gameType} laddad`, {
        description: `${parsedRaces.length} lopp tillgängliga`
      });
    } catch (err) {
      toast.error('Kunde inte ladda data', {
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

      // ===== HORSE SCORE (Sportslig ranking 0-100) =====
      let horseScore = 0;

      // 1. Startspår (0-25 poäng) - Lägre spår = bättre
      if (horse.postPosition) {
        const postScore = Math.max(0, 25 - (horse.postPosition - 1) * 2);
        horseScore += postScore;
      }

      // 2. Form (0-30 poäng) - Senaste prestationer
      if (horse.form) {
        const formParts = horse.form.split('-').slice(0, 5);
        let formScore = 0;
        formParts.forEach((result, index) => {
          const weight = 5 - index; // Senaste viktigast
          if (result === '1') formScore += 6 * weight;
          else if (result === '2') formScore += 4 * weight;
          else if (result === '3') formScore += 2 * weight;
          else if (result === '4' || result === '5') formScore += 1 * weight;
        });
        horseScore += Math.min(30, formScore);
      }

      // 3. Vinstprocent (0-25 poäng)
      if (horse.record) {
        const winPercentage = (horse.record.wins / horse.record.starts) * 100;
        horseScore += Math.min(25, winPercentage * 0.625); // 40% win = 25 poäng
      }

      // 4. Startmetod (0-10 poäng) - Volt är generellt bättre
      if (horse.startMethod) {
        if (horse.startMethod === 'volt') horseScore += 10;
        else if (horse.startMethod === 'auto') horseScore += 5;
      }

      // 5. Balans/Vagn (0-10 poäng) - Barfota kan vara fördelaktigt
      if (horse.shoes) {
        if (horse.shoes === 'barfota') horseScore += 10;
        else horseScore += 5;
      }

      // Normalisera Horse Score till 0-100
      horseScore = Math.min(100, Math.max(0, horseScore));

      // ===== SPETS & SPURT SCORING =====
      
      // SPETS SCORE (0-100)
      let spetsScore = 0;
      
      // Baserat på startspår
      if (horse.postPosition) {
        if (horse.postPosition <= 3) {
          spetsScore = 90; // Innerspår = hög spets-chans
        } else if (horse.postPosition <= 6) {
          spetsScore = 60; // Mittenspår = medel
        } else {
          spetsScore = 30; // Ytterspår = låg spets-chans
        }
        
        // Justera för stark kusk (enkel heuristik baserat på namnlängd + position)
        // TODO: Kan ersättas med riktig kusk-rating senare
        if (horse.driver && horse.driver.length > 12) {
          spetsScore += 10;
        }
      }
      
      // Justera för form - bra form ökar spets-chans
      if (horse.form) {
        const firstResult = horse.form.split('-')[0];
        if (firstResult === '1') spetsScore += 10;
        else if (firstResult === '2') spetsScore += 5;
      }
      
      spetsScore = Math.min(100, Math.max(0, spetsScore));

      // SPURT SCORE (0-100)
      let spurtScore = 0;
      
      // Baserat på rekord - bra rekord = bättre spurt
      if (horse.record) {
        const winPercentage = (horse.record.wins / horse.record.starts) * 100;
        spurtScore += winPercentage * 0.5; // Max 20 poäng från vinstprocent
      }
      
      // Högre odds = mer spurtare (outsiders måste spurta för att vinna)
      if (odds > 10) {
        spurtScore += 30;
      } else if (odds > 5) {
        spurtScore += 20;
      } else {
        spurtScore += 10;
      }
      
      // Sämre startspår = behöver spurta
      if (horse.postPosition) {
        if (horse.postPosition >= 7) {
          spurtScore += 25;
        } else if (horse.postPosition >= 4) {
          spurtScore += 15;
        } else {
          spurtScore += 5;
        }
      }
      
      // Form påverkar spurt - bra form = bättre spurt
      if (horse.form) {
        const formParts = horse.form.split('-').slice(0, 3);
        const recentWins = formParts.filter(r => r === '1').length;
        spurtScore += recentWins * 10;
      }
      
      spurtScore = Math.min(100, Math.max(0, spurtScore));

      // ===== FINAL SCORE =====
      // 60% Horse Score (sportslig) + 40% Ranking Score (value)
      const finalScore = (horseScore * 0.6) + (rankingScore * 0.4);

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
        horseScore: horseScore,
        finalScore: finalScore,
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
    
    // Add fade effect
    setAnalyzedHorses([]);
    
    setTimeout(() => {
      setSelectedRaceIndex(raceIndex);
      const analyzed = analyzeHorses(allRaces[raceIndex].horses);
      setAnalyzedHorses(analyzed);
      
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
              setShowManualInput(false);
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
                        <span className="font-semibold">{raceItem.race.name}</span>
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
