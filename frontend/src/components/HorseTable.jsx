import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from 'lucide-react';
import { toast } from 'sonner';

const HorseTable = ({ horses }) => {
  const [sortField, setSortField] = useState('finalScore');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterValue, setFilterValue] = useState('');
  const [showFilter, setShowFilter] = useState('all'); // all, positive, favorites

  // Loppklassificering
  const getRaceClassification = () => {
    if (!horses || horses.length === 0) return null;

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
filtered.sort((a, b) => {
  if (sortField === 'finalScore') {
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
      h.odds.toFixed(2),
      h.streckPercent.toFixed(1),
      h.marketProbability.toFixed(1),
      h.impliedProbability.toFixed(2),
      h.valueRatio.toFixed(2),
      h.rankingScore.toFixed(2),
      h.horseScore.toFixed(1),
      h.finalScore.toFixed(1),
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
    <Card className="bg-[#151923] border-gray-800" data-testid="horse-table-card">
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
              <tr>
                <th onClick={() => handleSort('number')} className="cursor-pointer text-center w-12">
                  <div className="flex items-center justify-center gap-1">
                    #
                    {getSortIcon('number')}
                  </div>
                </th>
                <th onClick={() => handleSort('name')} className="cursor-pointer w-48">
                  <div className="flex items-center gap-1">
                    Häst
                    {getSortIcon('name')}
                  </div>
                </th>
                <th onClick={() => handleSort('odds')} className="cursor-pointer text-center w-20">
                  <div className="flex items-center justify-center gap-1">
                    Odds
                    {getSortIcon('odds')}
                  </div>
                </th>
                <th onClick={() => handleSort('streckPercent')} className="cursor-pointer text-center w-20">
                  <div className="flex items-center justify-center gap-1">
                    Streck %
                    {getSortIcon('streckPercent')}
                  </div>
                </th>
                
                <th onClick={() => handleSort('valueRatio')} className="cursor-pointer w-32 text-center">
                  <div className="flex items-center justify-center gap-1">
                    Spelvärde
                    {getSortIcon('valueRatio')}
                  </div>
                </th>
                <th onClick={() => handleSort('rankingScore')} className="cursor-pointer text-center w-24">
                  <div className="flex items-center justify-center gap-1">
                    Ranking Score
                    {getSortIcon('rankingScore')}
                  </div>
                </th>
                
                <th onClick={() => handleSort('finalScore')} className="cursor-pointer text-center w-24">
                  <div className="flex items-center justify-center gap-1">
                    Final Score
                    {getSortIcon('finalScore')}
                  </div>
                </th>
                <th onClick={() => handleSort('play')} className="cursor-pointer w-32 text-center">
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
                  className={
                      horse.play === 'Stark play'
                        ? 'bg-green-500/20'
                        : horse.play === 'Möjlig play'
                        ? 'bg-blue-500/10'
                        : ''
                    }
                  data-testid={`horse-row-${horse.number}`}
                >
                  <td className="font-bold text-white text-center w-12 py-3">{horse.number}</td>
                  <td className="text-white w-48 py-3">
                    <div className="font-semibold">{horse.name}</div>
                    {(horse.driver || horse.trainer) && (
                      <div className="text-xs text-gray-400 mt-2">
                        {horse.driver && <span>{horse.driver}</span>}
                        {horse.driver && horse.trainer && <span> • </span>}
                        {horse.trainer && <span>{horse.trainer}</span>}
                      </div>
                    )}
                    {horse.skrallSignal && (
                      <div className="text-xs text-yellow-400 mt-1 font-medium">
                        {horse.skrallSignal}
                      </div>
                    )}
                  </td>
                  <td className="text-center text-white font-mono w-20 py-3">{horse.odds.toFixed(2)}</td>
                  <td className="text-center text-white font-mono w-20 py-3">{horse.streckPercent.toFixed(1)}%</td>
                  
                  <td className="text-center w-32 py-3">
                    <div className="flex justify-center">
                      <span className={`text-xs px-2 py-0.5 rounded inline-flex justify-center min-w-[92px] ${
                        horse.valueStatus === 'Spelvärd' ? 'bg-green-500/20 text-green-400' :
                        horse.valueStatus === 'Överspelad' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {horse.valueStatus}
                  </span>
                </div>
              </td>
                  <td className="text-center text-white font-mono font-semibold w-24 py-3">
                    {horse.rankingScore.toFixed(1)}
                  </td>
                  
                  <td className="text-center font-bold font-mono w-24 py-3">
                    <span className={`text-lg ${
                      horse.finalScore > 80 ? 'text-green-400' :
                      horse.finalScore > 60 ? 'text-yellow-400' :
                      'text-gray-400'
                    }`}>
                      {horse.finalScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="text-center w-32 py-3">
                    <span className={`inline-block px-3 py-1 rounded text-xs font-bold whitespace-nowrap ${
                      horse.play === 'Stark play' 
                        ? 'bg-green-500/30 text-green-300 border border-green-500/50' 
                        : horse.play === 'Möjlig play'
                        ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                        : 'bg-gray-700/30 text-gray-400 border border-gray-600/30'
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
