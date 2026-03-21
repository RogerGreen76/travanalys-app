import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from 'lucide-react';
import { toast } from 'sonner';

const HorseTable = ({ horses }) => {
  const [sortField, setSortField] = useState('valueScore');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterValue, setFilterValue] = useState('');
  const [showFilter, setShowFilter] = useState('all'); // all, positive, favorites

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
    if (valueRatio > 1.2) return 'value-positive';
    if (valueRatio < 0.9) return 'value-negative';
    return 'value-neutral';
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const exportToCSV = () => {
    const headers = ['Nummer', 'Namn', 'Odds', 'Streck %', 'Implied %', 'Value Gap', 'Value Ratio', 'Value Score', 'Play'];
    const rows = sortedAndFilteredHorses.map(h => [
      h.number,
      h.name,
      h.odds.toFixed(2),
      h.streckPercent.toFixed(1),
      h.impliedProbability.toFixed(2),
      (h.valueGap * 100).toFixed(2),
      h.valueRatio.toFixed(2),
      h.valueScore.toFixed(2),
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
      <CardContent>
        <div className="overflow-x-auto">
          <table className="value-table w-full text-sm" data-testid="horses-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('number')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    #
                    {getSortIcon('number')}
                  </div>
                </th>
                <th onClick={() => handleSort('name')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    Häst
                    {getSortIcon('name')}
                  </div>
                </th>
                <th onClick={() => handleSort('odds')} className="cursor-pointer text-right">
                  <div className="flex items-center justify-end gap-1">
                    Odds
                    {getSortIcon('odds')}
                  </div>
                </th>
                <th onClick={() => handleSort('streckPercent')} className="cursor-pointer text-right">
                  <div className="flex items-center justify-end gap-1">
                    Streck %
                    {getSortIcon('streckPercent')}
                  </div>
                </th>
                <th onClick={() => handleSort('impliedProbability')} className="cursor-pointer text-right">
                  <div className="flex items-center justify-end gap-1">
                    Implied %
                    {getSortIcon('impliedProbability')}
                  </div>
                </th>
                <th onClick={() => handleSort('valueRatio')} className="cursor-pointer text-right">
                  <div className="flex items-center justify-end gap-1">
                    Value Ratio
                    {getSortIcon('valueRatio')}
                  </div>
                </th>
                <th onClick={() => handleSort('valueScore')} className="cursor-pointer text-right">
                  <div className="flex items-center justify-end gap-1">
                    Value Score
                    {getSortIcon('valueScore')}
                  </div>
                </th>
                <th onClick={() => handleSort('play')} className="cursor-pointer text-center">
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
                  className={getValueClass(horse.valueRatio)}
                  data-testid={`horse-row-${horse.number}`}
                >
                  <td className="font-bold text-white">{horse.number}</td>
                  <td className="text-white">
                    <div className="font-semibold">{horse.name}</div>
                    {(horse.driver || horse.trainer) && (
                      <div className="text-xs text-gray-400 mt-1">
                        {horse.driver && <span>{horse.driver}</span>}
                        {horse.driver && horse.trainer && <span> • </span>}
                        {horse.trainer && <span>{horse.trainer}</span>}
                      </div>
                    )}
                  </td>
                  <td className="text-right text-white font-mono">{horse.odds.toFixed(2)}</td>
                  <td className="text-right text-white font-mono">{horse.streckPercent.toFixed(1)}%</td>
                  <td className="text-right text-white font-mono">{horse.impliedProbability.toFixed(2)}%</td>
                  <td className="text-right font-bold font-mono">
                    <span className={
                      horse.valueRatio > 1.2 ? 'text-green-400' :
                      horse.valueRatio < 0.9 ? 'text-red-400' : 'text-yellow-400'
                    }>
                      {horse.valueRatio.toFixed(2)}
                    </span>
                  </td>
                  <td className="text-right text-white font-mono font-semibold">
                    {horse.valueScore.toFixed(1)}
                  </td>
                  <td className="text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                      horse.play === 'YES' 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40' 
                        : 'bg-gray-700/30 text-gray-400 border border-gray-600/30'
                    }`}>
                      {horse.play}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
