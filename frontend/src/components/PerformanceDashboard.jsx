import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import {
  getPerformanceHistory,
  getPerformanceStats
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

  const stats = useMemo(() => getPerformanceStats(), [refreshKey]);
  const history = useMemo(() => getPerformanceHistory(), [refreshKey]);

  const completedHistory = history.filter(item => item?.prediction && item?.result);

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
              Ingen historik med både prediction och resultat ännu.
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
                  </tr>
                </thead>
                <tbody>
                  {completedHistory.map((item, index) => {
                    const winner = item.winnerHorse;
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
