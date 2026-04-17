import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardDescription, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sparkles, Target, Lock, Shield, Shuffle, Zap, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

// Import the new data pipeline services
import { analyzeRaceData } from '../services/analyzeRaceData';

// Standard ATG row prices in SEK
const ROW_PRICE = {
  V75: 0.5,
  V85: 0.5,
  V86: 0.25,
  V64: 1,
  V65: 1,
  V5: 1,
  GS75: 1,
  DD: 5,
};

const PLAY_PRIORITY = {
  'Stark play': 3,
  'Möjlig play': 2,
  'Låg edge favorit': 1,
  'No play': 0,
};

// How many horses to pick per strategy and size
const TICKET_COUNTS = {
  Liten: {
    'Spik-kandidat': 1,
    'Försiktig spik / 2 hästar': 2,
    'Lås / 2-3 hästar': 2,
    'Gardera brett': 3,
  },
  Mellan: {
    'Spik-kandidat': 1,
    'Försiktig spik / 2 hästar': 2,
    'Lås / 2-3 hästar': 3,
    'Gardera brett': 4,
  },
  Stor: {
    'Spik-kandidat': 2,
    'Försiktig spik / 2 hästar': 2,
    'Lås / 2-3 hästar': 4,
    'Gardera brett': 6,
  },
};

const getTicketHorsesForRace = (raceHorses, strategySuggestion, size) => {
  if (!Array.isArray(raceHorses) || raceHorses.length === 0) return [];

  const counts = TICKET_COUNTS[size] || TICKET_COUNTS['Mellan'];
  let count = counts[strategySuggestion] ?? counts['Gardera brett'];
  count = Math.min(count, raceHorses.length);

  const ranked = [...raceHorses].sort((a, b) => {
    const pa = PLAY_PRIORITY[a?.play] ?? 0;
    const pb = PLAY_PRIORITY[b?.play] ?? 0;
    if (pb !== pa) return pb - pa;
    return (Number(b?.finalScore) || 0) - (Number(a?.finalScore) || 0);
  });

  return ranked.slice(0, count);
};

const formatNumber = (value, decimals = 1) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : '-';
};

const getEffectiveFinalScore = (horse) =>
  Number(horse?.calibratedFinalScore ?? horse?.finalScore) || 0;

const SystemBuilder = ({ horses, gameType = 'V85', allRaces = [], selectedRaceIndex = 0 }) => {
  const [autoSuggestion, setAutoSuggestion] = useState(null);
  const [manualSelection, setManualSelection] = useState({
    spik: null,
    las: [],
    gardering: []
  });
  const [mode, setMode] = useState('auto'); // 'auto' or 'manual'
  const [systemTab, setSystemTab] = useState('auto'); // 'auto' or 'value'
  const [size, setSize] = useState(null); // 'Liten' | 'Mellan' | 'Stor'
  const [isExpanded, setIsExpanded] = useState(false);
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (gameType === 'DD') {
      generateDDCombinations();
    } else {
      generateAutoSuggestion();
    }
  }, [horses, gameType]);

  useEffect(() => {
    if (size || systemTab !== 'auto') {
      setIsExpanded(true);
    }
  }, [size, systemTab]);

  // Generera DD-kombinationer
  const generateDDCombinations = () => {
    if (!allRaces || allRaces.length < 2 || selectedRaceIndex > 1) {
      setAutoSuggestion(null);
      return;
    }

    // Use the already analyzed horses from allRaces
    const race1Horses = allRaces[0].horses.map(h => ({ ...h, raceNumber: 1 }));
    const race2Horses = allRaces[1].horses.map(h => ({ ...h, raceNumber: 2 }));

    // Take top 3 from each race based on calibrated score (fallback to finalScore)
    const topRace1 = [...race1Horses]
      .filter(h => h.calibratedFinalScore !== undefined || h.finalScore !== undefined)
      .sort((a, b) => getEffectiveFinalScore(b) - getEffectiveFinalScore(a))
      .slice(0, 3);

    const topRace2 = [...race2Horses]
      .filter(h => h.calibratedFinalScore !== undefined || h.finalScore !== undefined)
      .sort((a, b) => getEffectiveFinalScore(b) - getEffectiveFinalScore(a))
      .slice(0, 3);

    // Generera kombinationer
    const combinations = [];
    topRace1.forEach(h1 => {
      topRace2.forEach(h2 => {
        combinations.push({
          race1Horse: h1,
          race2Horse: h2,
          combinedScore: getEffectiveFinalScore(h1) + getEffectiveFinalScore(h2),
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
    const horseRankByNumber = new Map(
      [...horses]
        .sort((a, b) => getEffectiveFinalScore(b) - getEffectiveFinalScore(a))
        .map((horse, index) => [Number(horse?.number), index + 1])
    );

    const enriched = horses.map(horse => {
      const finalScore = getEffectiveFinalScore(horse);
      const rankingScore = Number(horse.rankingScore) || 0;
      const odds = Number(horse.odds) || 0;
      const streckPercent = Number(horse.streckPercent) || 0;
      const valueRatio = Number(horse.valueRatio) || 0;
      const upsetScore = Number(horse.upsetScore) || 0;
      const leadPotentialScore = Number(horse.leadPotentialScore) || 0;
      const positionPotentialScore = Number(horse.positionPotentialScore) || 0;
      const paceScenarioScore = Number(horse.paceScenarioScore) || 0;
      const horseRank = horseRankByNumber.get(Number(horse?.number)) || 999;

      // Clamp value ratio so extreme outliers do not dominate the system suggestion.
      const cappedValueRatio = Math.min(Math.max(valueRatio, 0.8), 1.8);

      const systemScore =
        (finalScore * 0.55) +
        (rankingScore * 0.30) +
        (cappedValueRatio * 100 * 0.15);

      const isExtremeLongshot =
        odds > 20 || rankingScore < 60 || finalScore < 80;

      const hasRaceShapeSupport =
        leadPotentialScore >= 7.5 ||
        positionPotentialScore >= 7.5 ||
        paceScenarioScore >= 60;
      const baseSkrallbud =
        valueRatio >= 1.15 &&
        streckPercent <= 0.12 &&
        odds >= 5 &&
        odds <= 20 &&
        finalScore >= 60;
      const strictLongshotSkrall =
        odds > 20 &&
        odds <= 35 &&
        horseRank <= 6 &&
        upsetScore >= 50 &&
        valueRatio >= 1.20 &&
        streckPercent >= 2 &&
        streckPercent <= 10 &&
        hasRaceShapeSupport;
      const isSkrallbud = baseSkrallbud || strictLongshotSkrall;

      const skrallScore =
        (valueRatio * 100 * 0.45) +
        (finalScore * 0.35) +
        (rankingScore * 0.20);

      return {
        ...horse,
        systemScore,
        isExtremeLongshot,
        isSkrallbud,
        skrallScore
      };
    });

    const sortedBySystem = [...enriched].sort((a, b) => b.systemScore - a.systemScore);
    const eligibleSpik = sortedBySystem.filter(h => !h.isExtremeLongshot);

    let spik = null;
    if (eligibleSpik.length > 0) {
      const top = eligibleSpik[0];
      const second = eligibleSpik[1];
      const scoreGap = second ? top.systemScore - second.systemScore : top.systemScore;
      const hasStrongBaseline = top.finalScore >= 90 && top.rankingScore >= 70;
      const hasClearLead = scoreGap >= 5;

      if (hasStrongBaseline && hasClearLead) {
        spik = top;
      }
    }

    const las = sortedBySystem
      .filter(h =>
        !h.isExtremeLongshot &&
        (!spik || h.number !== spik.number)
      )
      .slice(0, 2);

    const gardering = sortedBySystem
      .filter(h =>
        (!spik || h.number !== spik.number) &&
        !las.find(l => l.number === h.number)
      )
      .filter(h =>
        h.odds <= 20 && (
          !h.isExtremeLongshot ||
          h.play === 'Stark play' ||
          h.play === 'Möjlig play' ||
          h.valueStatus === 'Spelvärd'
        )
      )
      .slice(0, 5);

    const skrallbud = enriched
      .filter(h => h.isSkrallbud)
      .sort((a, b) => b.skrallScore - a.skrallScore)
      .slice(0, 4);

    setAutoSuggestion({ spik, las, gardering, skrallbud });
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

  // --- Auto-system: compute per-race ticket based on allRaces + strategySuggestion + size ---
  const autoTicket = useMemo(() => {
    const races = Array.isArray(allRaces) && allRaces.length > 0 ? allRaces : null;
    if (!races) {
      // Single-race fallback: use current horses + a default strategy
      if (!Array.isArray(horses) || horses.length === 0) return [];
      const strategy = horses[0]?.strategySuggestion || 'Gardera brett';
      const picked = getTicketHorsesForRace(horses, strategy, size);
      return [{ label: `${gameType}-1`, strategy, horses: picked }];
    }

    return races.map((raceItem, index) => {
      const raceHorses = raceItem.horses || [];
      const strategy = raceItem.race?.strategySuggestion
        || raceHorses[0]?.strategySuggestion
        || 'Gardera brett';
      const label = `${gameType}-${raceItem.race?.number || index + 1}`;
      const picked = getTicketHorsesForRace(raceHorses, strategy, size || 'Mellan');
      return { label, strategy, horses: picked };
    });
  }, [allRaces, horses, gameType, size]);

  const totalRows = useMemo(() => {
    if (autoTicket.length === 0) return 0;
    return autoTicket.reduce((product, race) => product * Math.max(race.horses.length, 1), 1);
  }, [autoTicket]);

  const normalizedGameType = gameType?.toUpperCase().split('-')[0];
  const rowPrice = ROW_PRICE[normalizedGameType] ?? 1;
  const totalCost = totalRows * rowPrice;
  const formattedRowPrice = rowPrice.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
            Ratio: {formatNumber(horse.valueRatio, 2)}
          </Badge>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40">
            Rank: {formatNumber(horse.rankingScore, 1)}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{horse.number}</span>
        <div className="flex-1">
          <div className="font-semibold text-white">{horse.name}</div>
          <div className="text-xs text-gray-400">
            Odds: {formatNumber(horse.odds, 2)} • Streck: {formatNumber(horse.streckPercent, 1)}% • {horse.play}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="bg-[#151923] border-gray-800 overflow-hidden" data-testid="system-builder-card">
      <div className="p-6">
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="w-full text-left"
          data-testid="system-builder-toggle"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Systemförslag
              </CardTitle>
              <CardDescription className="text-gray-400 mt-1">
                Välj systemtyp och storlek
              </CardDescription>
            </div>
            <div className="text-gray-400">
              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </div>
          </div>
        </button>
        <div className="mt-4 space-y-4">
          {/* Top-level mode tabs */}
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="system-tab-auto"
              onClick={() => {
                setSystemTab('auto');
                setIsExpanded(true);
              }}
              variant={systemTab === 'auto' ? 'default' : 'outline'}
              size="sm"
              className={systemTab === 'auto' ? 'bg-purple-600 hover:bg-purple-700' : 'border-gray-700 hover:bg-gray-800'}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Auto-system
            </Button>
            <Button
              data-testid="system-tab-value"
              onClick={() => {
                setSystemTab('value');
                setIsExpanded(true);
              }}
              variant={systemTab === 'value' ? 'default' : 'outline'}
              size="sm"
              className={systemTab === 'value' ? 'bg-blue-600 hover:bg-blue-700' : 'border-gray-700 hover:bg-gray-800'}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Value-system (beta)
            </Button>
          </div>

          {/* Size selector */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-400 whitespace-nowrap">Systemstorlek:</span>
            <div className="flex flex-wrap gap-2">
              {['Liten', 'Mellan', 'Stor'].map(s => (
                <Button
                  key={s}
                  data-testid={`size-${s.toLowerCase()}`}
                  onClick={() => {
                    setSize(s);
                    setIsExpanded(true);
                  }}
                  variant={size === s ? 'default' : 'outline'}
                  size="sm"
                  className={size === s ? 'bg-purple-600 hover:bg-purple-700' : 'border-gray-700 hover:bg-gray-800 text-gray-300'}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6">
          <div className="space-y-6 transition-all duration-300 ease-in-out">
            {/* Generated race rows */}
            <div className="space-y-2" data-testid="auto-ticket-rows">
              {autoTicket.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Ingen loppdata tillgänglig.</p>
              ) : (
                autoTicket.map((race, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-md bg-[#0a0e1a] border border-gray-800"
                    data-testid={`auto-ticket-race-${i}`}
                  >
                    <span className="text-gray-400 font-medium text-sm w-16 shrink-0">{race.label}:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {race.horses.length === 0 ? (
                        <span className="text-xs text-gray-600">–</span>
                      ) : (
                        race.horses.map(h => (
                          <span
                            key={h.number}
                            className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-purple-600/20 text-purple-300 border border-purple-600/30"
                          >
                            {h.number}
                          </span>
                        ))
                      )}
                    </div>
                    <span className="ml-auto text-[11px] text-gray-600 whitespace-nowrap">{race.strategy}</span>
                  </div>
                ))
              )}
            </div>

            {/* Total rows and cost */}
            {autoTicket.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg border border-purple-600/30 bg-purple-600/10"
                data-testid="auto-ticket-cost"
              >
                <div className="text-sm text-gray-300 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    <span className="font-semibold text-white">{totalRows.toLocaleString('sv-SE')}</span>
                    <span className="ml-1 text-gray-500">rader</span>
                  </span>
                  <span className="text-gray-500">•</span>
                  <span>
                    Kostnad:{' '}
                    <span className="font-semibold text-white">
                      {totalCost.toLocaleString('sv-SE')} kr
                    </span>
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400">{formattedRowPrice} kr / rad ({normalizedGameType || gameType})</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default SystemBuilder;
