import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sparkles, Target, Lock, Shield, Shuffle } from 'lucide-react';
import { toast } from 'sonner';

const SystemBuilder = ({ horses, gameType = 'V85', allRaces = [], selectedRaceIndex = 0 }) => {
  const [autoSuggestion, setAutoSuggestion] = useState(null);
  const [manualSelection, setManualSelection] = useState({
    spik: null,
    las: [],
    gardering: []
  });
  const [mode, setMode] = useState('auto'); // 'auto' or 'manual'

  useEffect(() => {
    if (gameType === 'DD') {
      generateDDCombinations();
    } else {
      generateAutoSuggestion();
    }
  }, [horses, gameType]);

  // Generera DD-kombinationer
  const generateDDCombinations = () => {
    if (!allRaces || allRaces.length < 2 || selectedRaceIndex > 1) {
      setAutoSuggestion(null);
      return;
    }

    // Analysera båda loppen
    const race1Horses = allRaces[0].horses.map(h => ({ ...h, raceNumber: 1 }));
    const race2Horses = allRaces[1].horses.map(h => ({ ...h, raceNumber: 2 }));

    // Analysera hästar (behöver göra value-beräkningar)
    const analyzeForDD = (horses) => {
      return horses.map(horse => {
        const odds = horse.odds / 100;
        const streckPercent = horse.betDistribution / 100;
        const impliedProbability = (1 / odds) * 100;
        const valueRatio = impliedProbability / streckPercent;
        let rankingScore = (impliedProbability * 100) / streckPercent;
        if (odds > 10) rankingScore += 1;
        if (streckPercent < 10) rankingScore += 1;
        if (streckPercent > 40) rankingScore -= 1;
        
        return { ...horse, valueRatio, rankingScore, odds, streckPercent };
      }).sort((a, b) => b.rankingScore - a.rankingScore);
    };

    const analyzed1 = analyzeForDD(race1Horses);
    const analyzed2 = analyzeForDD(race2Horses);

    // Ta topp 3 från varje lopp
    const topRace1 = analyzed1.slice(0, 3);
    const topRace2 = analyzed2.slice(0, 3);

    // Generera kombinationer
    const combinations = [];
    topRace1.forEach(h1 => {
      topRace2.forEach(h2 => {
        combinations.push({
          race1Horse: h1,
          race2Horse: h2,
          combinedScore: h1.rankingScore + h2.rankingScore,
          combinedRatio: (h1.valueRatio + h2.valueRatio) / 2
        });
      });
    });

    // Sortera efter combined score
    combinations.sort((a, b) => b.combinedScore - a.combinedScore);

    setAutoSuggestion({
      isDDMode: true,
      topRace1: topRace1,
      topRace2: topRace2,
      combinations: combinations.slice(0, 6) // Topp 6 kombinationer
    });
  };

  const generateAutoSuggestion = () => {
    // Sortera hästar efter value ratio
    const sortedByValue = [...horses].sort((a, b) => b.valueRatio - a.valueRatio);
    const sortedByRanking = [...horses].sort((a, b) => b.rankingScore - a.rankingScore);

    // Spik: häst med högst value_ratio om >1.20, annars ingen spik
    let spik = null;
    if (sortedByValue[0] && sortedByValue[0].valueRatio > 1.20) {
      spik = sortedByValue[0];
    }

    // Lås: topp 2 value_ratio (exklusive spik)
    const las = sortedByValue
      .filter(h => !spik || h.number !== spik.number)
      .slice(0, 2);

    // Gardering: value_ratio > 1.10 ELLER streck < 5%
    const gardering = horses
      .filter(h => 
        (!spik || h.number !== spik.number) && 
        !las.find(l => l.number === h.number) &&
        (h.valueRatio > 1.10 || h.streckPercent < 5)
      )
      .sort((a, b) => b.valueRatio - a.valueRatio)
      .slice(0, 5);

    setAutoSuggestion({ spik, las, gardering });
  };

  const toggleHorseInManual = (horse, category) => {
    const newSelection = { ...manualSelection };

    if (category === 'spik') {
      newSelection.spik = newSelection.spik?.number === horse.number ? null : horse;
    } else if (category === 'las') {
      const index = newSelection.las.findIndex(h => h.number === horse.number);
      if (index > -1) {
        newSelection.las.splice(index, 1);
      } else if (newSelection.las.length < 2) {
        newSelection.las.push(horse);
      } else {
        toast.error('Max 2 lås tillåtna');
        return;
      }
    } else if (category === 'gardering') {
      const index = newSelection.gardering.findIndex(h => h.number === horse.number);
      if (index > -1) {
        newSelection.gardering.splice(index, 1);
      } else if (newSelection.gardering.length < 5) {
        newSelection.gardering.push(horse);
      } else {
        toast.error('Max 5 garderingar tillåtna');
        return;
      }
    }

    setManualSelection(newSelection);
  };

  const copyToManual = () => {
    setManualSelection({
      spik: autoSuggestion.spik,
      las: [...autoSuggestion.las],
      gardering: [...autoSuggestion.gardering]
    });
    setMode('manual');
    toast.success('Förslag kopierat till manuellt läge');
  };

  const currentSelection = mode === 'auto' ? autoSuggestion : manualSelection;

  const getValueColor = (valueRatio) => {
    if (valueRatio > 1.20) return 'bg-green-500/20 text-green-400 border-green-500/40';
    if (valueRatio < 1.05) return 'bg-red-500/20 text-red-400 border-red-500/40';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  };

  const HorseCard = ({ horse, icon: Icon, label, color }) => (
    <div className={`p-3 rounded-lg border ${color} transition-all`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase opacity-80">{label}</span>
        </div>
        <div className="flex gap-2">
          <Badge className={getValueColor(horse.valueRatio)}>
            Ratio: {horse.valueRatio.toFixed(2)}
          </Badge>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40">
            Rank: {horse.rankingScore.toFixed(1)}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{horse.number}</span>
        <div className="flex-1">
          <div className="font-semibold text-white">{horse.name}</div>
          <div className="text-xs text-gray-400">
            Odds: {horse.odds.toFixed(2)} • Streck: {horse.streckPercent.toFixed(1)}% • {horse.play}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="bg-[#151923] border-gray-800" data-testid="system-builder-card">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Systemförslag
            </CardTitle>
            <CardDescription className="text-gray-400">
              Baserat på value ratio och ranking score
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="auto-mode-button"
              onClick={() => setMode('auto')}
              variant={mode === 'auto' ? 'default' : 'outline'}
              className={mode === 'auto' ? 'bg-blue-600' : 'border-gray-700'}
            >
              Automatiskt
            </Button>
            <Button
              data-testid="manual-mode-button"
              onClick={() => setMode('manual')}
              variant={mode === 'manual' ? 'default' : 'outline'}
              className={mode === 'manual' ? 'bg-blue-600' : 'border-gray-700'}
            >
              Manuellt
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {mode === 'auto' && autoSuggestion && (
          <>
            {/* DD Mode - Visa kombinationer */}
            {autoSuggestion.isDDMode ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shuffle className="w-5 h-5 text-green-400" />
                    <h3 className="font-semibold text-green-300">Föreslagna DD-kombinationer</h3>
                  </div>
                  <p className="text-sm text-gray-400">
                    Topp 3 hästar från varje lopp baserat på ranking score
                  </p>
                </div>

                {/* Visa topp hästar från varje lopp */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">DD-1</h4>
                    {autoSuggestion.topRace1.map((horse) => (
                      <div key={horse.number} className="mb-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">#{horse.number} {horse.name}</span>
                          <Badge className="bg-blue-500/20 text-blue-400">
                            {horse.rankingScore.toFixed(1)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">DD-2</h4>
                    {autoSuggestion.topRace2.map((horse) => (
                      <div key={horse.number} className="mb-2 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">#{horse.number} {horse.name}</span>
                          <Badge className="bg-purple-500/20 text-purple-400">
                            {horse.rankingScore.toFixed(1)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Visa kombinationer */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-3">Bästa kombinationer</h4>
                  <div className="grid gap-2">
                    {autoSuggestion.combinations.map((combo, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          index === 0 ? 'bg-green-500/10 border-green-500/40' :
                          index < 3 ? 'bg-yellow-500/10 border-yellow-500/30' :
                          'bg-gray-700/20 border-gray-600/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-500/30 text-blue-300">
                              #{combo.race1Horse.number}
                            </Badge>
                            <span className="text-white font-mono">×</span>
                            <Badge className="bg-purple-500/30 text-purple-300">
                              #{combo.race2Horse.number}
                            </Badge>
                            <span className="text-sm text-gray-300">
                              {combo.race1Horse.name} / {combo.race2Horse.name}
                            </span>
                          </div>
                          <Badge className={
                            index === 0 ? 'bg-green-500/20 text-green-400' :
                            index < 3 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-600/20 text-gray-400'
                          }>
                            Score: {combo.combinedScore.toFixed(1)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Normal mode - Spik/Lås/Gardering */
              <div className="space-y-3">
              {autoSuggestion.spik ? (
                <HorseCard
                  horse={autoSuggestion.spik}
                  icon={Target}
                  label="Spik"
                  color="bg-blue-500/10 border-blue-500/30"
                />
              ) : (
                <div className="p-3 rounded-lg border bg-gray-700/20 border-gray-600/40" data-testid="no-spik-message">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Target className="w-4 h-4" />
                    <span className="text-sm font-semibold">Ingen spik</span>
                    <span className="text-xs opacity-80">• Ingen häst har value ratio över 1.20</span>
                  </div>
                </div>
              )}

              {autoSuggestion.las.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Lås ({autoSuggestion.las.length})
                  </h3>
                  {autoSuggestion.las.map(horse => (
                    <HorseCard
                      key={horse.number}
                      horse={horse}
                      icon={Lock}
                      label="Lås"
                      color="bg-purple-500/10 border-purple-500/30"
                    />
                  ))}
                </div>
              )}

              {autoSuggestion.gardering.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Gardering ({autoSuggestion.gardering.length})
                  </h3>
                  {autoSuggestion.gardering.map(horse => (
                    <HorseCard
                      key={horse.number}
                      horse={horse}
                      icon={Shield}
                      label="Gardering"
                      color="bg-gray-700/30 border-gray-600/30"
                    />
                  ))}
                </div>
              )}
            </div>
            )}

            {!autoSuggestion.isDDMode && (
            <Button
              data-testid="copy-to-manual-button"
              onClick={copyToManual}
              variant="outline"
              className="w-full border-gray-700 hover:bg-gray-800"
            >
              Kopiera och anpassa manuellt
            </Button>
            )}
          </>
        )}

        {mode === 'manual' && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-300">
                Klicka på hästar i tabellen ovan för att välja:
                <br />
                • 1 Spik (mest säker)
                <br />
                • 2 Lås (troliga vinnare)
                <br />
                • 3-5 Garderingar (extra säkerhet)
              </p>
            </div>

            <div className="space-y-3">
              {manualSelection.spik && (
                <HorseCard
                  horse={manualSelection.spik}
                  icon={Target}
                  label="Spik"
                  color="bg-blue-500/10 border-blue-500/30"
                />
              )}

              {manualSelection.las.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Lås ({manualSelection.las.length}/2)
                  </h3>
                  {manualSelection.las.map(horse => (
                    <HorseCard
                      key={horse.number}
                      horse={horse}
                      icon={Lock}
                      label="Lås"
                      color="bg-purple-500/10 border-purple-500/30"
                    />
                  ))}
                </div>
              )}

              {manualSelection.gardering.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Gardering ({manualSelection.gardering.length}/5)
                  </h3>
                  {manualSelection.gardering.map(horse => (
                    <HorseCard
                      key={horse.number}
                      horse={horse}
                      icon={Shield}
                      label="Gardering"
                      color="bg-gray-700/30 border-gray-600/30"
                    />
                  ))}
                </div>
              )}
            </div>

            {!manualSelection.spik && manualSelection.las.length === 0 && manualSelection.gardering.length === 0 && (
              <div className="text-center py-8 text-gray-400" data-testid="no-manual-selection-message">
                Inga hästar valda ännu. Börja med att ladda det automatiska förslaget.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemBuilder;
