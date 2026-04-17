import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardDescription, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Slider } from './ui/slider';
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

const TILLIT_PRIORITY = {
  'Hög': 3,
  'Medel': 2,
  'Låg': 1,
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
    'Spik-kandidat': 1,
    'Försiktig spik / 2 hästar': 2,
    'Lås / 2-3 hästar': 4,
    'Gardera brett': 6,
  },
};

const MAX_GARDERA_BY_SIZE = {
  Liten: 2,
  Mellan: 3,
  Stor: Number.POSITIVE_INFINITY,
};

const CLEAR_MARGIN_GAP = 5;

const TARGET_BUDGET_BY_SIZE = {
  Liten: { min: 100, max: 300 },
  Mellan: { min: 300, max: 500 },
  Stor: { min: 500, max: 3000 },
};

const DEFAULT_BUDGET_BY_SIZE = {
  Liten: 200,
  Mellan: 400,
  Stor: 1000,
};

const SOFT_MAX_ROWS = 50000;

const getHorsePlay = (horse) => horse?.play || horse?.playDecision?.finalPlay || 'No play';
const isStarkFavorit = (horse) => horse?.winnerStrengthLabel === 'Stark favorit';

const isStrongPlay = (play) => play === 'Stark play' || play === 'Möjlig play';

const rankHorsesForTicket = (raceHorses) => {
  if (!Array.isArray(raceHorses)) return [];
  return [...raceHorses].sort((a, b) => {
    const pa = PLAY_PRIORITY[getHorsePlay(a)] ?? 0;
    const pb = PLAY_PRIORITY[getHorsePlay(b)] ?? 0;
    if (pb !== pa) return pb - pa;
    return getEffectiveFinalScore(b) - getEffectiveFinalScore(a);
  });
};

const getTicketHorseCount = ({ strategySuggestion, size, tillit, scoreGap, topHorsePlay, horseCount }) => {
  const counts = TICKET_COUNTS[size] || TICKET_COUNTS['Mellan'];
  let count = counts[strategySuggestion] ?? counts['Gardera brett'];

  // Stor can be 3-4 horses for Lås depending on confidence in the race.
  if (size === 'Stor' && strategySuggestion === 'Lås / 2-3 hästar') {
    const highConfidence = tillit === 'Hög' || scoreGap >= 6 || isStrongPlay(topHorsePlay);
    count = highConfidence ? 3 : 4;
  }

  return Math.min(count, horseCount);
};

const compareSpikPriority = (a, b) => {
  // 1) Dominance first: highest finalScore gap should win.
  if (b.dominanceScore !== a.dominanceScore) {
    return b.dominanceScore - a.dominanceScore;
  }

  // 2) Then trust level.
  const tillitDiff = (TILLIT_PRIORITY[b.tillit] ?? 1) - (TILLIT_PRIORITY[a.tillit] ?? 1);
  if (tillitDiff !== 0) {
    return tillitDiff;
  }

  // 3) Then whether top horse is a strong favorite.
  if (b.topHorseIsStarkFavorit !== a.topHorseIsStarkFavorit) {
    return Number(b.topHorseIsStarkFavorit) - Number(a.topHorseIsStarkFavorit);
  }

  // 4) Only after dominance/favorite confidence, consider play signal.
  const playDiff = (PLAY_PRIORITY[b.topHorsePlay] ?? 0) - (PLAY_PRIORITY[a.topHorsePlay] ?? 0);
  if (playDiff !== 0) {
    return playDiff;
  }

  // 5) Keep explicit spik suggestions as a late tiebreak.
  if (b.strategy !== a.strategy) {
    return b.strategy === 'Spik-kandidat' ? 1 : -1;
  }

  return 0;
};

const isStrongSpikCandidate = ({ tillit, strategy, dominanceScore, topHorseIsStarkFavorit }) => (
  tillit === 'Hög'
  && strategy === 'Spik-kandidat'
  && topHorseIsStarkFavorit
  && (Number(dominanceScore) || 0) >= CLEAR_MARGIN_GAP
);

const getRaceConfidenceScore = ({ tillit, scoreGap, topHorsePlay }) => {
  const tillitScore = (TILLIT_PRIORITY[tillit] ?? 1) * 100;
  const gapScore = Math.max(Number(scoreGap) || 0, 0) * 10;
  const playScore = isStrongPlay(topHorsePlay) ? 40 : 0;
  return tillitScore + gapScore + playScore;
};

const getForcedSpikCount = (size, raceMeta) => {
  const raceCount = raceMeta.length;
  const strongCandidateCount = raceMeta.filter((race) => isStrongSpikCandidate(race)).length;

  if (size === 'Liten') {
    const target = strongCandidateCount >= 3 ? 3 : 2;
    return Math.min(target, raceCount);
  }

  if (size === 'Mellan') {
    // Mellan should land at 1-2 spiks depending on strength, always at least 1 when races exist.
    const target = strongCandidateCount >= 2 ? 2 : 1;
    return Math.min(target, raceCount);
  }

  // Stor: at least 1 spik when races exist.
  return Math.min(1, raceCount);
};

const getMaxGarderaRaces = (size) => MAX_GARDERA_BY_SIZE[size] ?? MAX_GARDERA_BY_SIZE.Mellan;

const calculateRows = (ticketRows) => {
  if (!Array.isArray(ticketRows) || ticketRows.length === 0) return 0;
  return ticketRows.reduce((product, race) => product * Math.max(race.horses.length, 1), 1);
};

const calculateCost = (ticketRows, rowPrice) => calculateRows(ticketRows) * rowPrice;

const getMaxHorsesForStrategy = (size, strategy, rankedLength) => {
  const safeLength = Math.max(Number(rankedLength) || 0, 0);
  if (safeLength === 0) return 0;

  if (strategy === 'Gardera brett') {
    const maxBySize = {
      Liten: 3,
      Mellan: 4,
      Stor: 6,
    };
    return Math.min(maxBySize[size] ?? 4, safeLength);
  }

  if (strategy === 'Lås / 2-3 hästar') {
    const maxBySize = {
      Liten: 2,
      Mellan: 3,
      Stor: 4,
    };
    return Math.min(maxBySize[size] ?? 3, safeLength);
  }

  if (strategy === 'Spik-kandidat') {
    return Math.min(1, safeLength);
  }

  if (strategy === 'Försiktig spik / 2 hästar') {
    return Math.min(2, safeLength);
  }

  return Math.min(safeLength, 4);
};

const reduceTicketOneStep = (ticketRows) => {
  const reduced = ticketRows.map((race) => ({ ...race, horses: [...race.horses] }));

  // Reduce wide spreads first by removing the lowest-ranked horse.
  const wideIndex = reduced
    .map((race, index) => ({ index, race }))
    .filter(({ race }) => race.strategy === 'Gardera brett' && race.horses.length > 1)
    .sort((a, b) => b.race.horses.length - a.race.horses.length)[0]?.index;

  if (wideIndex !== undefined) {
    reduced[wideIndex].horses.pop();
    return { changed: true, ticketRows: reduced };
  }

  // Then reduce Lås races from 3+ to 2.
  const lasIndex = reduced
    .map((race, index) => ({ index, race }))
    .filter(({ race }) => race.strategy === 'Lås / 2-3 hästar' && race.horses.length > 2)
    .sort((a, b) => b.race.horses.length - a.race.horses.length)[0]?.index;

  if (lasIndex !== undefined) {
    reduced[lasIndex].horses.pop();
    return { changed: true, ticketRows: reduced };
  }

  return { changed: false, ticketRows: reduced };
};

const expandTicketOneStep = (ticketRows, size) => {
  const expanded = ticketRows.map((race) => ({ ...race, horses: [...race.horses] }));

  // Expand wide spreads first by adding next ranked horse.
  const wideIndex = expanded
    .map((race, index) => ({ index, race }))
    .filter(({ race }) => {
      if (race.strategy !== 'Gardera brett') return false;
      const maxHorses = getMaxHorsesForStrategy(size, race.strategy, race.ranked.length);
      return race.horses.length < maxHorses;
    })[0]?.index;

  if (wideIndex !== undefined) {
    const race = expanded[wideIndex];
    race.horses.push(race.ranked[race.horses.length]);
    return { changed: true, ticketRows: expanded };
  }

  // Then expand Lås from 2 to 3 when possible.
  const lasIndex = expanded
    .map((race, index) => ({ index, race }))
    .filter(({ race }) => {
      if (race.strategy !== 'Lås / 2-3 hästar') return false;
      const maxHorses = getMaxHorsesForStrategy(size, race.strategy, race.ranked.length);
      return race.horses.length < maxHorses;
    })[0]?.index;

  if (lasIndex !== undefined) {
    const race = expanded[lasIndex];
    race.horses.push(race.ranked[2]);
    return { changed: true, ticketRows: expanded };
  }

  return { changed: false, ticketRows: expanded };
};

const adjustTicketToBudget = (ticketRows, size, rowPrice, targetBudget = null) => {
  const target = TARGET_BUDGET_BY_SIZE[size] || TARGET_BUDGET_BY_SIZE.Mellan;
  const useExactTarget = Number.isFinite(targetBudget);
  const exactTarget = useExactTarget ? Number(targetBudget) : null;
  let adjustedRows = ticketRows.map((race) => ({ ...race, horses: [...race.horses] }));

  // Hard iteration cap prevents infinite loops if no more valid adjustments exist.
  for (let i = 0; i < 500; i += 1) {
    const totalCost = calculateCost(adjustedRows, rowPrice);
    const totalRows = calculateRows(adjustedRows);

    if (totalRows >= SOFT_MAX_ROWS) {
      break;
    }

    if (useExactTarget) {
      // In slider mode, continue expansion until budget target is reached.
      if (totalCost >= exactTarget) {
        break;
      }

      const expansion = expandTicketOneStep(adjustedRows, size);
      if (!expansion.changed) break;
      adjustedRows = expansion.ticketRows;
      continue;
    }

    if (totalCost >= target.min && totalCost <= target.max) {
      break;
    }

    if (totalCost > target.max) {
      const reduction = reduceTicketOneStep(adjustedRows);
      adjustedRows = reduction.ticketRows;
      if (!reduction.changed) break;
      continue;
    }

    const expansion = expandTicketOneStep(adjustedRows, size);
    adjustedRows = expansion.ticketRows;
    if (!expansion.changed) break;
  }

  return adjustedRows;
};

const getTicketHorsesForRace = (raceHorses, strategySuggestion, size, raceContext = {}) => {
  if (!Array.isArray(raceHorses) || raceHorses.length === 0) return [];

  const ranked = rankHorsesForTicket(raceHorses);
  const count = getTicketHorseCount({
    strategySuggestion,
    size,
    tillit: raceContext.tillit,
    scoreGap: raceContext.scoreGap,
    topHorsePlay: raceContext.topHorsePlay,
    horseCount: ranked.length,
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
  const [budget, setBudget] = useState(DEFAULT_BUDGET_BY_SIZE.Mellan);
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
  const normalizedGameType = gameType?.toUpperCase().split('-')[0];
  const rowPrice = ROW_PRICE[normalizedGameType] ?? 1;
  const selectedSize = size || 'Mellan';
  const estimatedRows = Math.max(1, Math.round(budget / rowPrice));

  // --- Auto-system: compute per-race ticket based on allRaces + strategySuggestion + size ---
  const autoTicket = useMemo(() => {
    const races = Array.isArray(allRaces) && allRaces.length > 0 ? allRaces : null;

    if (!races) {
      // Single-race fallback: use current horses + a default strategy
      if (!Array.isArray(horses) || horses.length === 0) return [];
      const strategy = horses[0]?.strategySuggestion || 'Gardera brett';
      const ranked = rankHorsesForTicket(horses);
      const topHorsePlay = getHorsePlay(ranked[0]);
      const picked = getTicketHorsesForRace(horses, strategy, selectedSize, {
        tillit: 'Medel',
        scoreGap: 0,
        topHorsePlay,
      });
      return [{ label: `${gameType}-1`, strategy, horses: picked }];
    }

    const raceMeta = races.map((raceItem, index) => {
      const raceHorses = raceItem.horses || [];
      const ranked = rankHorsesForTicket(raceHorses);
      const strategy = raceItem.race?.strategySuggestion
        || raceHorses[0]?.strategySuggestion
        || 'Gardera brett';
      const tillit = raceItem.race?.tillit || 'Medel';
      const topHorse = ranked[0];
      const secondHorse = ranked[1];
      const dominanceScore = (getEffectiveFinalScore(topHorse) || 0) - (getEffectiveFinalScore(secondHorse) || 0);
      const scoreGap = Number(raceItem.race?.scoreGap ?? dominanceScore) || 0;
      const topHorsePlay = getHorsePlay(topHorse);
      const topHorseIsStarkFavorit = isStarkFavorit(topHorse);
      const label = `${gameType}-${raceItem.race?.number || index + 1}`;

      return {
        index,
        label,
        raceHorses,
        ranked,
        strategy,
        tillit,
        scoreGap,
        dominanceScore,
        topHorsePlay,
        topHorseIsStarkFavorit,
      };
    });

    const forcedSpikCount = getForcedSpikCount(selectedSize, raceMeta);

    // All sizes use the same spik priority order with fallback to best races.
    const spikSelectionPool = [...raceMeta].sort(
      compareSpikPriority
    );

    const forcedSpikIndexes = new Set(
      spikSelectionPool.slice(0, forcedSpikCount).map((race) => race.index)
    );

    const wideRaces = raceMeta.filter(
      (race) => race.strategy === 'Gardera brett' && !forcedSpikIndexes.has(race.index)
    );

    const maxWide = getMaxGarderaRaces(selectedSize);
    const downgradeWideCount = Math.max(0, wideRaces.length - maxWide);
    const downgradedWideIndexes = new Set(
      wideRaces
        // Downgrade the most confident "wide" races first.
        .sort((a, b) => getRaceConfidenceScore(b) - getRaceConfidenceScore(a))
        .slice(0, downgradeWideCount)
        .map((race) => race.index)
    );

    const initialTicket = raceMeta.map((race) => {
      const strategy = forcedSpikIndexes.has(race.index)
        ? 'Spik-kandidat'
        : downgradedWideIndexes.has(race.index)
          ? 'Lås / 2-3 hästar'
          : race.strategy;

      const picked = getTicketHorsesForRace(race.raceHorses, strategy, selectedSize, {
        tillit: race.tillit,
        scoreGap: race.scoreGap,
        topHorsePlay: race.topHorsePlay,
      });

      return {
        label: race.label,
        strategy,
        horses: picked,
        ranked: race.ranked,
      };
    });

    const budgetAdjusted = adjustTicketToBudget(initialTicket, selectedSize, rowPrice, budget);

    return budgetAdjusted.map((race) => ({
      label: race.label,
      strategy: race.strategy,
      horses: race.horses,
    }));
  }, [allRaces, horses, gameType, size, rowPrice, budget]);

  const totalRows = useMemo(() => {
    return calculateRows(autoTicket);
  }, [autoTicket]);

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
          className="w-full text-left rounded-lg px-3 py-2 -mx-3 -my-2 cursor-pointer transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
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
            <div className="text-gray-300">
              <ChevronRight
                className={`w-6 h-6 transition-transform duration-300 ease-out ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
              />
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
                    setBudget(DEFAULT_BUDGET_BY_SIZE[s]);
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

          {/* Budget slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-400">Budget</span>
              <span className="text-sm font-semibold text-white">{budget.toLocaleString('sv-SE')} kr</span>
            </div>
            <Slider
              data-testid="budget-slider"
              min={50}
              max={3000}
              step={50}
              value={[budget]}
              onValueChange={(value) => {
                const next = Number(value?.[0]);
                if (Number.isFinite(next)) {
                  setBudget(next);
                  setIsExpanded(true);
                }
              }}
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Estimerat: cirka {estimatedRows.toLocaleString('sv-SE')} rader ({formattedRowPrice} kr / rad)
            </p>
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
