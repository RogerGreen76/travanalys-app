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

      // Nya value-beräkningar
      const valueRatio = impliedProbability / (streckPercent / 100);
      
      // Value score med justeringar
      let valueScore = (impliedProbability * 100) / streckPercent;
      if (odds > 10) valueScore += 1;
      if (streckPercent < 10) valueScore += 1;
      if (streckPercent > 40) valueScore -= 1;

      // Play rekommendation
      const play = (valueRatio > 1.2 && odds > 4) ? 'YES' : 'NO';

      return {
        ...horse,
        odds: odds,
        streckPercent: streckPercent,
        impliedProbability: impliedProbability,
        valueGap: valueGap,
        valueRatio: valueRatio,
        valueScore: valueScore,
        play: play
      };
    });
  };

  const handleParse = () => {
    setError(null);
    try {
      const parsed = JSON.parse(jsonInput);
      
      // Validera struktur
      if (!parsed.horses || !Array.isArray(parsed.horses)) {
        throw new Error('JSON måste innehålla en "horses" array');
      }

      // Validera varje häst
      parsed.horses.forEach((horse, index) => {
        if (!horse.name || !horse.odds || !horse.betDistribution || !horse.number) {
          throw new Error(`Häst ${index + 1} saknar obligatoriska fält (name, odds, betDistribution, number)`);
        }
      });

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
              Klistra in JSON-data eller använd exempeldata för att börja
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
