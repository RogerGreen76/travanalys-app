import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { EquipmentIndicator } from './EquipmentIndicator';

const formatNumber = (value, decimals = 1) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : '-';
};

const EMPTY_TEMPO_METRICS = {
  sampleSize: 0,
  averageFirst200ms: null,
  bestFirst200ms: null,
  averageBest100ms: null,
  best100ms: null,
  averageSlipstreamDistance: null
};

const getTempoMetrics = (horse) => {
  const primaryMetrics = horse?.tempoMetrics;
  const nestedMetrics = horse?.horse?.tempoMetrics;
  const metrics = [primaryMetrics, nestedMetrics].find(
    (candidate) => candidate && Number(candidate?.sampleSize) > 0
  ) ?? primaryMetrics ?? nestedMetrics;

  if (!metrics || Number(metrics?.sampleSize) <= 0) {
    return EMPTY_TEMPO_METRICS;
  }

  return {
    sampleSize: Number(metrics.sampleSize) || 0,
    averageFirst200ms: Number.isFinite(Number(metrics.averageFirst200ms))
      ? Number(metrics.averageFirst200ms)
      : null,
    bestFirst200ms: Number.isFinite(Number(metrics.bestFirst200ms))
      ? Number(metrics.bestFirst200ms)
      : null,
    averageBest100ms: Number.isFinite(Number(metrics.averageBest100ms))
      ? Number(metrics.averageBest100ms)
      : null,
    best100ms: Number.isFinite(Number(metrics.best100ms))
      ? Number(metrics.best100ms)
      : null,
    averageSlipstreamDistance: Number.isFinite(Number(metrics.averageSlipstreamDistance))
      ? Number(metrics.averageSlipstreamDistance)
      : null
  };
};

const computePercentile = (values, percentile) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }
  const clampedPercentile = Math.min(1, Math.max(0, percentile));
  const index = (sorted.length - 1) * clampedPercentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }
  const weight = index - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
};

const buildMetricDistributionStats = (values) => {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return {
      min: null,
      p10: null,
      p25: null,
      p50: null,
      p75: null,
      p90: null
    };
  }

  return {
    min: Math.min(...numericValues),
    p10: computePercentile(numericValues, 0.10),
    p25: computePercentile(numericValues, 0.25),
    p50: computePercentile(numericValues, 0.50),
    p75: computePercentile(numericValues, 0.75),
    p90: computePercentile(numericValues, 0.90)
  };
};

const getTempoIndicator = (tempoMetrics, tempoDistributions) => {
  const averageFirst200ms = Number(tempoMetrics?.averageFirst200ms);
  const bestFirst200ms = Number(tempoMetrics?.bestFirst200ms);
  const averageBest100ms = Number(tempoMetrics?.averageBest100ms);
  const startsnabbP25 = tempoDistributions?.averageFirst200ms?.p25;
  const startsnabbP10 = tempoDistributions?.averageFirst200ms?.p10;
  const tempostarkP25 = tempoDistributions?.averageBest100ms?.p25;
  const tempostarkP10 = tempoDistributions?.averageBest100ms?.p10;

  const startsnabbValue = Number.isFinite(averageFirst200ms)
    ? averageFirst200ms
    : (Number.isFinite(bestFirst200ms) ? bestFirst200ms : null);

  const isStartsnabb = Number.isFinite(startsnabbValue) && Number.isFinite(startsnabbP25) && startsnabbValue <= startsnabbP25;
  const isTempostark = Number.isFinite(averageBest100ms) && Number.isFinite(tempostarkP25) && averageBest100ms <= tempostarkP25;

  const isStrongStartsnabb = isStartsnabb && Number.isFinite(startsnabbP10) && startsnabbValue <= startsnabbP10;
  const isStrongTempostark = isTempostark && Number.isFinite(tempostarkP10) && averageBest100ms <= tempostarkP10;

  if (isStartsnabb && (!isTempostark || startsnabbValue <= averageBest100ms)) {
    return {
      label: 'Startsnabb',
      strength: isStrongStartsnabb ? 'stark' : 'medel',
      className: 'text-cyan-300 border-cyan-700/40 bg-cyan-900/20'
    };
  }

  if (isTempostark) {
    return {
      label: 'Tempostark',
      strength: isStrongTempostark ? 'stark' : 'medel',
      className: 'text-teal-300 border-teal-700/40 bg-teal-900/20'
    };
  }

  return {
    label: 'Ingen tydlig signal',
    strength: 'none',
    className: 'text-gray-400 border-gray-700/40 bg-gray-800/30'
  };
};

const TEMPO_INDICATOR_HELP_TEXT =
  'Startsnabb: stark oppning i tidiga 200 m. ' +
  'Tempostark: stark fart i basta 100 m. ' +
  'Ingen tydlig signal: for lite historik eller ingen tydlig temposignal. ' +
  'Styrka stark: tydligare historisk signal. Styrka medel: viss historisk signal.';

const SHOW_TEMPO_ONLY_KEY = 'travanalys_showTempoOnly';

const readStoredBoolean = (key, fallbackValue) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallbackValue;
    }

    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallbackValue;
    }

    if (raw === 'true') {
      return true;
    }

    if (raw === 'false') {
      return false;
    }

    return fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const writeStoredBoolean = (key, value) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Intentionally ignore storage failures and keep UI functional.
  }
};

const getEffectiveFinalScore = (horse) =>
  Number(horse?.calibratedFinalScore ?? horse?.finalScore) || 0;

const getDisplayPlayLabel = (horse) => {
  if (horse?.winnerStrengthLabel === 'Stark favorit' && horse?.play === 'No play') {
    return 'Låg edge favorit';
  }
  return horse?.play || 'No play';
};

const HorseTable = ({ horses }) => {
  const fullRaceHorses = useMemo(
    () => (Array.isArray(horses) ? horses : []),
    [horses]
  );

  const [sortField, setSortField] = useState('finalScore');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterValue, setFilterValue] = useState('');
  const [showFilter, setShowFilter] = useState('all'); // all, positive, favorites
  const [showTempoSignalOnly, setShowTempoSignalOnly] = useState(() =>
    readStoredBoolean(SHOW_TEMPO_ONLY_KEY, false)
  );

  const handleTempoSignalOnlyChange = (checked) => {
    setShowTempoSignalOnly(checked);
    writeStoredBoolean(SHOW_TEMPO_ONLY_KEY, checked);
  };

  const tempoDistributions = useMemo(() => {
    const metricsList = fullRaceHorses.map((horse) => getTempoMetrics(horse));

    const averageFirst200Values = metricsList
      .map((metrics) => Number(metrics?.averageFirst200ms))
      .filter((value) => Number.isFinite(value));

    const bestFirst200Values = metricsList
      .map((metrics) => Number(metrics?.bestFirst200ms))
      .filter((value) => Number.isFinite(value));

    const averageBest100Values = metricsList
      .map((metrics) => Number(metrics?.averageBest100ms))
      .filter((value) => Number.isFinite(value));

    return {
      averageFirst200ms: buildMetricDistributionStats(averageFirst200Values),
      bestFirst200ms: buildMetricDistributionStats(bestFirst200Values),
      averageBest100ms: buildMetricDistributionStats(averageBest100Values)
    };
  }, [fullRaceHorses]);

  // Loppklassificering
  const getRaceClassification = () => {
    if (!horses || horses.length === 0) return null;

    const existingRaceType = horses[0]?.raceType;
    if (existingRaceType === 'Favoritlopp') {
      return {
        type: 'Favoritlopp',
        description: 'Tydlig favorit eller favoriter',
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/40'
      };
    }

    if (existingRaceType === 'Värdelopp') {
      return {
        type: 'Värdelopp',
        description: 'Flera hästar med bra value',
        color: 'bg-green-500/20 text-green-400 border-green-500/40'
      };
    }

    if (existingRaceType === 'Rörigt lopp') {
      return {
        type: 'Rörigt lopp',
        description: 'Många jämna hästar',
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
      };
    }

    // Sortera efter streck
    const byStreck = [...horses].sort((a, b) => b.streckPercent - a.streckPercent);
    const topStreck = byStreck[0]?.streckPercent || 0;
    const secondStreck = byStreck[1]?.streckPercent || 0;

    // Räkna hästar med bra value (justerat till >1.20)
    const goodValueCount = horses.filter(h => h.valueRatio > 1.20).length;

    // Favoritlopp: 1-2 hästar dominerar strecket
    if (topStreck > 30 && (topStreck - secondStreck) > 10) {
      return {
        type: 'Favoritlopp',
        description: 'Tydlig favorit eller favoriter',
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/40'
      };
    }

    // Värdelopp: Flera hästar med bra value
    if (goodValueCount >= 3) {
      return {
        type: 'Värdelopp',
        description: `${goodValueCount} hästar med bra value`,
        color: 'bg-green-500/20 text-green-400 border-green-500/40'
      };
    }

    // Rörigt lopp: Jämnt
    return {
      type: 'Rörigt lopp',
      description: 'Många jämna hästar',
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
    };
  };

  const raceClassification = getRaceClassification();

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAndFilteredHorses = useMemo(() => {
    let filtered = [...fullRaceHorses];

    // Detect whether any horse in this race has real analysis scores.
    // When all finalScores are 0/missing, betting data was not published yet.
    const hasRealScores = fullRaceHorses.some(h => getEffectiveFinalScore(h) > 0);

    // Filtrera baserat på namn
    if (filterValue) {
      filtered = filtered.filter(h => 
        h.name.toLowerCase().includes(filterValue.toLowerCase()) ||
        h.number.toString().includes(filterValue)
      );
    }

    // Filtrera baserat på kategori
    if (showFilter === 'positive') {
      filtered = filtered.filter(h => h.valueGap > 0.02);
    } else if (showFilter === 'favorites') {
      filtered = filtered.filter(h => h.odds < 10);
    }

    if (showTempoSignalOnly) {
      filtered = filtered.filter(horse => {
        const label = getTempoIndicator(getTempoMetrics(horse), tempoDistributions).label;
        return label === 'Startsnabb' || label === 'Tempostark';
      });
    }

    // Sortera
    // When no real analysis scores exist, always sort by ascending horse number.
    if (!hasRealScores) {
      filtered.sort((a, b) => (a.number || 0) - (b.number || 0));
      return filtered;
    }

    filtered.sort((a, b) => {
  if (sortField === 'finalScore') {
    const scoreDiff = getEffectiveFinalScore(b) - getEffectiveFinalScore(a);
    if (scoreDiff !== 0) {
      return sortDirection === 'asc' ? -scoreDiff : scoreDiff;
    }

    const playPriority = {
      'Stark play': 3,
      'Möjlig play': 2,
      'Låg edge favorit': 1.5,
      'No play': 1
    };

    const aPlay = playPriority[getDisplayPlayLabel(a)] || 0;
    const bPlay = playPriority[getDisplayPlayLabel(b)] || 0;

    if (aPlay !== bPlay) {
      return sortDirection === 'asc'
        ? aPlay - bPlay
        : bPlay - aPlay;
    }
      // Tie-break: keep a stable ascending order within equal play tiers
      return (a.number || 0) - (b.number || 0);
    }

  let aVal = a[sortField];
  let bVal = b[sortField];

  if (sortDirection === 'asc') {
    return aVal > bVal ? 1 : -1;
  } else {
    return aVal < bVal ? 1 : -1;
  }
});

    return filtered;
  }, [fullRaceHorses, sortField, sortDirection, filterValue, showFilter, showTempoSignalOnly, tempoDistributions]);

  const tempoSignalSummary = useMemo(() => {
    const totalCount = fullRaceHorses.length;
    const signalCount = fullRaceHorses.filter((horse) => {
      const label = getTempoIndicator(getTempoMetrics(horse), tempoDistributions).label;
      return label === 'Startsnabb' || label === 'Tempostark';
    }).length;

    return {
      totalCount,
      signalCount
    };
  }, [fullRaceHorses, tempoDistributions]);

  const tempoLabelSummary = useMemo(() => {
    const summary = {
      startsnabb: 0,
      tempostark: 0,
      ingenTydligSignal: 0
    };

    fullRaceHorses.forEach((horse) => {
      const label = getTempoIndicator(getTempoMetrics(horse), tempoDistributions).label;
      if (label === 'Startsnabb') {
        summary.startsnabb += 1;
      } else if (label === 'Tempostark') {
        summary.tempostark += 1;
      } else {
        summary.ingenTydligSignal += 1;
      }
    });

    return summary;
  }, [fullRaceHorses, tempoDistributions]);

  const getValueClass = (valueRatio) => {
    if (valueRatio > 1.20) return 'value-positive';
    if (valueRatio < 1.05) return 'value-negative';
    return 'value-neutral';
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const exportToCSV = () => {
    const headers = ['Nummer', 'Namn', 'Odds', 'Streck %', 'Market %', 'Implied %', 'Value Ratio', 'Ranking Score', 'Horse Score', 'Final Score', 'Vinstyrka', 'Status', 'Play'];
    const rows = sortedAndFilteredHorses.map(h => [
      h.number,
      h.name,
      formatNumber(h.odds, 2),
      formatNumber(h.streckPercent, 1),
      formatNumber(h.marketProbability, 1),
      formatNumber(h.impliedProbability, 2),
      formatNumber(h.valueRatio, 2),
      formatNumber(h.rankingScore, 2),
      formatNumber(h.horseScore, 1),
      formatNumber(getEffectiveFinalScore(h), 1),
      h.winnerStrengthLabel,
      h.valueStatus,
      getDisplayPlayLabel(h)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `travanalys_${Date.now()}.csv`;
    link.click();

    toast.success('CSV exporterad', {
      description: `${sortedAndFilteredHorses.length} hästar exporterade`
    });
  };

  return (
    <Card className="bg-[#151923] border-gray-800 horse-table-card" data-testid="horse-table-card">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-white">Hästar & Spelvärde</CardTitle>
            <CardDescription className="text-gray-400">
              {sortedAndFilteredHorses.length} av {fullRaceHorses.length} hästar
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={showFilter} onValueChange={setShowFilter}>
                <SelectTrigger className="w-[160px] bg-[#0a0e1a] border-gray-700" data-testid="filter-select">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#151923] border-gray-700">
                  <SelectItem value="all">Alla hästar</SelectItem>
                  <SelectItem value="positive">Spelvärda ({'>'}2%)</SelectItem>
                  <SelectItem value="favorites">Favoriter ({'<'}10)</SelectItem>
                </SelectContent>
              </Select>

              <Input
                data-testid="search-input"
                placeholder="Sök häst eller nummer..."
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="w-[200px] bg-[#0a0e1a] border-gray-700"
              />

              <label
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-700 bg-[#0a0e1a] text-xs text-gray-300 cursor-pointer"
                data-testid="tempo-signal-filter"
              >
                <input
                  type="checkbox"
                  checked={showTempoSignalOnly}
                  onChange={(e) => handleTempoSignalOnlyChange(e.target.checked)}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
                Visa bara hästar med temposignal
              </label>

              <div className="px-3 py-2 rounded-md border border-gray-700 bg-[#0a0e1a] text-xs text-gray-400" data-testid="tempo-signal-summary">
                Tempo-signal: {tempoSignalSummary.signalCount} av {tempoSignalSummary.totalCount}
              </div>

              <Button
                data-testid="export-csv-button"
                onClick={exportToCSV}
                variant="outline"
                size="icon"
                className="border-gray-700 hover:bg-gray-800 h-8 w-8 shrink-0"
                title="Exportera CSV"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5" data-testid="tempo-label-summary">
              <span className="px-2 py-1 rounded border border-cyan-700/30 bg-cyan-900/10 text-[11px] text-cyan-300">
                Startsnabb: {tempoLabelSummary.startsnabb}
              </span>
              <span className="px-2 py-1 rounded border border-teal-700/30 bg-teal-900/10 text-[11px] text-teal-300">
                Tempostark: {tempoLabelSummary.tempostark}
              </span>
              <span className="px-2 py-1 rounded border border-gray-700/40 bg-gray-800/40 text-[11px] text-gray-400">
                Ingen tydlig signal: {tempoLabelSummary.ingenTydligSignal}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Loppklassificering */}
        {raceClassification && (
          <div className={`p-3 rounded-lg border ${raceClassification.color}`} data-testid="race-classification">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{raceClassification.type}</span>
              <span className="text-sm opacity-80">• {raceClassification.description}</span>
            </div>
          </div>
        )}

        <table className="table-fixed w-full text-sm" data-testid="horses-table">
            <thead>
              <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-wider">
                <th onClick={() => handleSort('number')} className="cursor-pointer text-center w-12 pb-3">
                  <div className="flex items-center justify-center gap-1">
                    #
                    {getSortIcon('number')}
                  </div>
                </th>
                <th onClick={() => handleSort('name')} className="cursor-pointer w-48 pb-3">
                  <div className="flex items-center gap-1">
                    Häst
                    {getSortIcon('name')}
                  </div>
                </th>
                <th onClick={() => handleSort('odds')} className="cursor-pointer text-center w-20 pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Odds
                    {getSortIcon('odds')}
                  </div>
                </th>
                <th onClick={() => handleSort('streckPercent')} className="cursor-pointer text-center w-20 pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Streck %
                    {getSortIcon('streckPercent')}
                  </div>
                </th>
                
                <th onClick={() => handleSort('valueRatio')} className="cursor-pointer w-32 text-center pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Spelvärde
                    {getSortIcon('valueRatio')}
                  </div>
                </th>
                <th onClick={() => handleSort('rankingScore')} className="cursor-pointer text-center w-24 pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Ranking Score
                    {getSortIcon('rankingScore')}
                  </div>
                </th>
                
                <th onClick={() => handleSort('finalScore')} className="cursor-pointer text-center w-24 pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Final Score
                    {getSortIcon('finalScore')}
                  </div>
                </th>
                <th onClick={() => handleSort('winnerStrengthScore')} className="cursor-pointer w-32 text-center pb-3">
                  <div className="flex items-center justify-center gap-1">
                    VINSTYRKA
                    {getSortIcon('winnerStrengthScore')}
                  </div>
                </th>
                <th onClick={() => handleSort('play')} className="cursor-pointer w-32 text-center pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Play
                    {getSortIcon('play')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredHorses.map((horse) => {
                const tempoMetrics = getTempoMetrics(horse);
                const tempoIndicator = getTempoIndicator(tempoMetrics, tempoDistributions);
                const hasTempoSignal = tempoIndicator.label === 'Startsnabb' || tempoIndicator.label === 'Tempostark';
                const displayPlayLabel = getDisplayPlayLabel(horse);

                return (
                <tr
                  key={horse.number}
                  className={`border-b border-white/5 last:border-0 transition-colors duration-150 hover:bg-white/[0.025] ${
                      displayPlayLabel === 'Stark play'
                        ? 'bg-green-500/15'
                        : displayPlayLabel === 'Möjlig play'
                        ? 'bg-sky-500/[0.08]'
                        : displayPlayLabel === 'Låg edge favorit'
                        ? 'bg-amber-500/[0.08]'
                        : ''
                    }`}
                  data-testid={`horse-row-${horse.number}`}
                >
                  <td className="font-bold text-gray-300 text-center w-12 py-4 tabular-nums">{horse.number}</td>
                  <td className="text-white w-48 py-4">
                    <div className="font-semibold text-[15px] tracking-tight flex items-center gap-2">
                      <span>{horse.name}</span>
                      {hasTempoSignal && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded border border-cyan-700/40 bg-cyan-900/15 text-cyan-300 font-medium">
                          Tempo
                        </span>
                      )}
                      {horse.isPotentialUpset && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium tracking-wide">
                          Skrällbud
                        </span>
                      )}
                    </div>
                    {(horse.driver || horse.trainer) && (
                      <div className="text-xs text-gray-500 mt-1 tracking-wide">
                        {horse.driver && <span>{horse.driver}</span>}
                        {horse.driver && horse.trainer && <span> • </span>}
                        {horse.trainer && <span>{horse.trainer}</span>}
                      </div>
                    )}
                    <EquipmentIndicator
                      shoes={horse.shoes}
                      sulky={horse.sulky}
                      horse={horse}
                    />
                    {horse.kmtidFirst200 != null && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 font-mono">
                          200m: {horse.kmtidFirst200}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 font-mono">
                          KMSpeed: {horse.kmtidStartSpeedScore}
                        </span>
                      </div>
                    )}
                    <div className="mt-1" data-testid={`tempo-indicator-${horse.number}`}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tempoIndicator.className}`}
                        title={TEMPO_INDICATOR_HELP_TEXT}
                      >
                        {tempoIndicator.label}
                        {tempoIndicator.strength !== 'none' ? ` (${tempoIndicator.strength})` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="text-center text-gray-200 font-mono w-20 py-4 tabular-nums">{formatNumber(horse.odds, 2)}</td>
                  <td className="text-center text-gray-200 font-mono w-20 py-4 tabular-nums">{formatNumber(horse.streckPercent, 1)}%</td>
                  
                  <td className="text-center w-32 py-4">
                    <div className="flex justify-center">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border inline-flex justify-center min-w-[92px] font-medium ${
                        horse.valueStatus === 'Spelvärd' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                        horse.valueStatus === 'Överspelad' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                        'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                    }`}>
                      {horse.valueStatus}
                  </span>
                </div>
              </td>
                  <td className="text-center text-gray-200 font-mono w-24 py-4 tabular-nums">
                    {formatNumber(horse.rankingScore, 1)}
                  </td>
                  
                  <td className="text-center font-mono w-24 py-4">
                    <span className={`text-base font-semibold tabular-nums ${
                      getEffectiveFinalScore(horse) > 80 ? 'text-green-400' :
                      getEffectiveFinalScore(horse) > 60 ? 'text-yellow-400' :
                      'text-gray-500'
                    }`}>
                      {formatNumber(getEffectiveFinalScore(horse), 1)}
                    </span>
                  </td>
                  <td className="text-center w-32 py-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${
                      horse.winnerStrengthLabel === 'Trolig vinnare'
                        ? 'bg-teal-600/20 text-teal-400 border-teal-500/40'
                        : horse.winnerStrengthLabel === 'Stark favorit'
                        ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40'
                        : horse.winnerStrengthLabel === 'Utmanare'
                        ? 'bg-slate-600/20 text-slate-300 border-slate-500/40'
                        : 'bg-gray-700/40 text-gray-400 border-gray-600/30'
                    }`}>
                      {horse.winnerStrengthLabel || 'Övrig'}
                    </span>
                  </td>
                  <td className="text-center w-32 py-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${
                      displayPlayLabel === 'Stark play' 
                        ? 'bg-green-600/20 text-green-400 border-green-500/40' 
                        : displayPlayLabel === 'Möjlig play'
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                        : displayPlayLabel === 'Låg edge favorit'
                        ? 'bg-amber-600/20 text-amber-400 border-amber-500/40'
                        : 'bg-gray-700/40 text-gray-400 border-gray-600/30'
                    }`}>
                      {displayPlayLabel}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>

        {sortedAndFilteredHorses.length === 0 && (
          <div className="text-center py-8 text-gray-400" data-testid="no-horses-message">
            Inga hästar matchar filtret
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HorseTable;
