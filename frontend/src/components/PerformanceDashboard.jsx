import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  getPerformanceHistory,
  getPerformanceStats,
  saveRaceResult
} from '../services/performanceTracker';

const formatMetric = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '-';
};

const statCards = [
  { key: 'totalRaces', label: 'Total lopp' },
  { key: 'winnerTop1', label: 'Vinnare topp 1' },
  { key: 'winnerTop3', label: 'Vinnare topp 3' },
  { key: 'winnerTop5', label: 'Vinnare topp 5' },
  { key: 'valueWinners', label: 'Spelvärda vinnare' },
  { key: 'starkPlayWinners', label: 'Stark play-vinnare' }
];

const PerformanceDashboard = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [winnerInput, setWinnerInput] = useState('');
  const [top3Input, setTop3Input] = useState('');

  const stats = useMemo(() => getPerformanceStats(), [refreshKey]);
  const history = useMemo(() => getPerformanceHistory(), [refreshKey]);

  console.log('Dashboard history:', history);
  console.log('Dashboard stats:', stats);

  // Show all entries that have at least a prediction (result optional)
  const completedHistory = history.filter(item => item?.prediction);

  const openEditor = (item) => {
    const rowKey = item.raceId || item.raceLabel;
    setEditingId(rowKey);
    setWinnerInput(item.result?.winnerNumber != null ? String(item.result.winnerNumber) : '');
    setTop3Input(Array.isArray(item.result?.top3Numbers) ? item.result.top3Numbers.join(', ') : '');
  };

  const handleSaveResult = (item) => {
    const winnerNumber = parseInt(winnerInput, 10);
    if (!winnerNumber || isNaN(winnerNumber)) return;

    const top3Numbers = top3Input
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));

    saveRaceResult({
      date: item.date,
      gameType: item.gameType,
      raceId: item.raceId,
      raceLabel: item.raceLabel,
      winnerNumber,
      top3Numbers,
      resultFetchedAt: new Date().toISOString()
    });

    setEditingId(null);
    setWinnerInput('');
    setTop3Input('');
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6" data-testid="performance-dashboard">
      <Card className="bg-[#151923] border-gray-800">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-white">Model Performance Dashboard</CardTitle>
              <CardDescription className="text-gray-400">
                Historisk uppföljning av modellens träffsäkerhet
              </CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-gray-700 hover:bg-gray-800"
              onClick={() => setRefreshKey(prev => prev + 1)}
              data-testid="refresh-performance-button"
            >
              Uppdatera
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {statCards.map(card => (
              <div key={card.key} className="p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
                <div className="text-xs text-gray-400 uppercase tracking-wide">{card.label}</div>
                <div className="text-2xl font-semibold text-white mt-1">
                  {stats[card.key] ?? 0}
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div className="p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Snitt rank (vinnare)</div>
              <div className="text-xl font-semibold text-white mt-1">
                {formatMetric(stats.averageWinnerRank)}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Snitt finalScore (vinnare)</div>
              <div className="text-xl font-semibold text-white mt-1">
                {formatMetric(stats.averageWinnerFinalScore)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#151923] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Historik</CardTitle>
          <CardDescription className="text-gray-400">
            Datum, lopp, vinnare och modellens rankning för vinnaren
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedHistory.length === 0 ? (
            <div className="text-sm text-gray-400" data-testid="performance-empty-state">
              Ingen historik sparad ännu.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="performance-history-table">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 pr-3">Datum</th>
                    <th className="text-left py-2 pr-3">Lopp</th>
                    <th className="text-left py-2 pr-3">Vinnare</th>
                    <th className="text-left py-2 pr-3">Modellrank</th>
                    <th className="text-left py-2 pr-3">FinalScore</th>
                    <th className="text-left py-2 pr-3">Play</th>
                    <th className="text-left py-2 pr-3">Resultat</th>
                  </tr>
                </thead>
                <tbody>
                  {completedHistory.map((item, index) => {
                    const winner = item.winnerHorse;
                    const rowKey = item.raceId || item.raceLabel;
                    const isEditing = editingId === rowKey;
                    const hasResult = item.result?.winnerNumber != null;
                    return (
                      <tr
                        key={`${item.raceId || item.raceLabel || 'race'}-${item.result?.winnerNumber || 'x'}-${index}`}
                        className="border-b border-gray-800/80"
                      >
                        <td className="py-2 pr-3 text-gray-300">{item.date || '-'}</td>
                        <td className="py-2 pr-3 text-white">{item.raceLabel || item.raceId || '-'}</td>
                        <td className="py-2 pr-3 text-white">{item.result?.winnerNumber ?? '-'}</td>
                        <td className="py-2 pr-3 text-white">{item.winnerModelRank ?? '-'}</td>
                        <td className="py-2 pr-3 text-white">{formatMetric(winner?.finalScore)}</td>
                        <td className="py-2 pr-3 text-gray-300">{winner?.play || '-'}</td>
                        <td className="py-2 pr-3">
                          {isEditing ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Input
                                type="number"
                                placeholder="Vinnare nr"
                                value={winnerInput}
                                onChange={e => setWinnerInput(e.target.value)}
                                className="w-24 h-7 text-xs bg-[#0a0e1a] border-gray-600"
                              />
                              <Input
                                type="text"
                                placeholder="Topp 3 (t.ex. 5,8,2)"
                                value={top3Input}
                                onChange={e => setTop3Input(e.target.value)}
                                className="w-32 h-7 text-xs bg-[#0a0e1a] border-gray-600"
                              />
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-700 hover:bg-green-600"
                                onClick={() => handleSaveResult(item)}
                              >
                                Spara
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                Avbryt
                              </Button>
                            </div>
                          ) : hasResult ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-gray-400 hover:text-white"
                              onClick={() => openEditor(item)}
                            >
                              Ändra
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-gray-600 hover:bg-gray-800"
                              onClick={() => openEditor(item)}
                            >
                              + Registrera
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceDashboard;
