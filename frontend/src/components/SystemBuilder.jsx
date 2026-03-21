import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sparkles, Target, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';

const SystemBuilder = ({ horses }) => {
  const [autoSuggestion, setAutoSuggestion] = useState(null);
  const [manualSelection, setManualSelection] = useState({
    spik: null,
    las: [],
    gardering: []
  });
  const [mode, setMode] = useState('auto'); // 'auto' or 'manual'

  useEffect(() => {
    generateAutoSuggestion();
  }, [horses]);

  const generateAutoSuggestion = () => {
    // Sortera hästar efter value gap
    const sorted = [...horses].sort((a, b) => b.valueGap - a.valueGap);

    // Välj spik: häst med högst value gap OCH rimligt odds (inte för högt)
    const goodValueHorses = sorted.filter(h => h.valueGap > 0 && h.odds < 20);
    const spik = goodValueHorses.length > 0 ? goodValueHorses[0] : sorted[0];

    // Välj lås: 2 hästar med bra value som inte är spik
    const las = sorted
      .filter(h => h.number !== spik.number && h.valueGap > -0.05)
      .slice(0, 2);

    // Välj gardering: 3-5 hästar med acceptabelt value
    const gardering = sorted
      .filter(h => 
        h.number !== spik.number && 
        !las.find(l => l.number === h.number) &&
        h.valueGap > -0.10
      )
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

  const getValueColor = (valueGap) => {
    if (valueGap > 0.02) return 'bg-green-500/20 text-green-400 border-green-500/40';
    if (valueGap < 0) return 'bg-red-500/20 text-red-400 border-red-500/40';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  };

  const HorseCard = ({ horse, icon: Icon, label, color }) => (
    <div className={`p-3 rounded-lg border ${color} transition-all`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase opacity-80">{label}</span>
        </div>
        <Badge className={getValueColor(horse.valueGap)}>
          {(horse.valueGap * 100).toFixed(1)}%
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{horse.number}</span>
        <div className="flex-1">
          <div className="font-semibold text-white">{horse.name}</div>
          <div className="text-xs text-gray-400">
            Odds: {horse.odds.toFixed(2)} • Streck: {horse.streckPercent.toFixed(1)}%
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
              Automatiskt förslag baserat på value gap
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
            <div className="space-y-3">
              {autoSuggestion.spik && (
                <HorseCard
                  horse={autoSuggestion.spik}
                  icon={Target}
                  label="Spik"
                  color="bg-blue-500/10 border-blue-500/30"
                />
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

            <Button
              data-testid="copy-to-manual-button"
              onClick={copyToManual}
              variant="outline"
              className="w-full border-gray-700 hover:bg-gray-800"
            >
              Kopiera och anpassa manuellt
            </Button>
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
