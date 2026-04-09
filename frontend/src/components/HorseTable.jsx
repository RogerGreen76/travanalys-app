import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from 'lucide-react';
import { toast } from 'sonner';

const formatNumber = (value, decimals = 1) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : '-';
};

const getEffectiveFinalScore = (horse) =>
  Number(horse?.calibratedFinalScore ?? horse?.finalScore) || 0;

const HorseTable = ({ horses }) => {
  const [sortField, setSortField] = useState('finalScore');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterValue, setFilterValue] = useState('');
  const [showFilter, setShowFilter] = useState('all'); // all, positive, favorites

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
    let filtered = [...horses];

    // Detect whether any horse in this race has real analysis scores.
    // When all finalScores are 0/missing, betting data was not published yet.
    const hasRealScores = horses.some(h => getEffectiveFinalScore(h) > 0);

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
      'No play': 1
    };

    const aPlay = playPriority[a.play] || 0;
    const bPlay = playPriority[b.play] || 0;

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
  }, [horses, sortField, sortDirection, filterValue, showFilter]);

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
    const headers = ['Nummer', 'Namn', 'Odds', 'Streck %', 'Market %', 'Implied %', 'Value Ratio', 'Ranking Score', 'Horse Score', 'Final Score', 'Status', 'Play'];
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
      h.valueStatus,
      h.play
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
              {sortedAndFilteredHorses.length} av {horses.length} hästar
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
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

            <Button
              data-testid="export-csv-button"
              onClick={exportToCSV}
              variant="outline"
              className="border-gray-700 hover:bg-gray-800"
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
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
                <th onClick={() => handleSort('play')} className="cursor-pointer w-32 text-center pb-3">
                  <div className="flex items-center justify-center gap-1">
                    Play
                    {getSortIcon('play')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredHorses.map((horse) => (
                <tr
                  key={horse.number}
                  className={`border-b border-white/5 last:border-0 transition-colors duration-150 hover:bg-white/[0.025] ${
                      horse.play === 'Stark play'
                        ? 'bg-green-500/15'
                        : horse.play === 'Möjlig play'
                        ? 'bg-sky-500/[0.08]'
                        : ''
                    }`}
                  data-testid={`horse-row-${horse.number}`}
                >
                  <td className="font-bold text-gray-300 text-center w-12 py-4 tabular-nums">{horse.number}</td>
                  <td className="text-white w-48 py-4">
                    <div className="font-semibold text-[15px] tracking-tight flex items-center gap-2">
                      <span>{horse.name}</span>
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
                      horse.play === 'Stark play' 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                        : horse.play === 'Möjlig play'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-gray-800/50 text-gray-500 border-gray-700/30'
                    }`}>
                      {horse.play}
                    </span>
                  </td>
                </tr>
              ))}
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
