import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  getPerformanceHistory,
  hasMissingGameIds,
  saveRaceResult,
  syncMissingResults
} from '../services/performanceTracker';

const formatMetric = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '-';
};

const getEffectiveFinalScore = (horse) =>
  Number(horse?.calibratedFinalScore ?? horse?.finalScore);

const statCards = [
  { key: 'totalRaces', label: 'Total lopp' },
  { key: 'winnerTop1', label: 'Vinnare topp 1' },
  { key: 'winnerTop3', label: 'Vinnare topp 3' },
  { key: 'winnerTop5', label: 'Vinnare topp 5' },
  { key: 'valueWinners', label: 'Spelvärda vinnare' },
  { key: 'starkPlayWinners', label: 'Stark play-vinnare' },
  { key: 'averageWinnerOdds', label: 'Snittodds vinnare' },
  { key: 'roiSpelvarda', label: 'ROI Spelvärda' },
  { key: 'averageCLV', label: 'Snitt CLV' }
];

const GAME_TYPE_FILTERS = ['Alla', 'V85', 'V86', 'V64', 'V65', 'V5', 'GS75', 'DD'];
const ROI_ODDS_BUCKETS = [
  { key: '1-3', label: '1-3', min: 1, max: 3 },
  { key: '3-6', label: '3-6', min: 3, max: 6 },
  { key: '6-10', label: '6-10', min: 6, max: 10 },
  { key: '10-20', label: '10-20', min: 10, max: 20 },
  { key: '20+', label: '20+', min: 20, max: Infinity }
];

const PerformanceDashboard = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [winnerInput, setWinnerInput] = useState('');
  const [top3Input, setTop3Input] = useState('');
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [autoSyncSummary, setAutoSyncSummary] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedGameTypeFilter, setSelectedGameTypeFilter] = useState('Alla');
  const [selectedTrack, setSelectedTrack] = useState('Alla banor');
  const [resultFilter, setResultFilter] = useState('all');
  const [onlyValueWinners, setOnlyValueWinners] = useState(false);
  const [onlyStarkPlayWinners, setOnlyStarkPlayWinners] = useState(false);

  const history = useMemo(() => getPerformanceHistory(), [refreshKey]);

  // Show all entries that have at least a prediction (result optional)
  const allPredictionRows = useMemo(
    () => history.filter(item => item?.prediction),
    [history]
  );

  const availableTracks = useMemo(() => {
    const trackSet = new Set(
      allPredictionRows
        .map(item => String(item?.track || '').trim())
        .filter(Boolean)
    );

    return [...trackSet].sort((a, b) => a.localeCompare(b, 'sv-SE'));
  }, [allPredictionRows]);

  const filteredHistory = useMemo(() => {
    return allPredictionRows.filter(row => {
      const rowDate = row?.date || '';
      const hasResult = row?.result?.winnerNumber != null;
      const rowGameType = String(row?.gameType || '').toUpperCase();
      const rowTrack = String(row?.track || '').trim();

      if (fromDate && rowDate < fromDate) return false;
      if (toDate && rowDate > toDate) return false;
      if (selectedGameTypeFilter !== 'Alla' && rowGameType !== selectedGameTypeFilter.toUpperCase()) return false;
      if (selectedTrack !== 'Alla banor' && rowTrack !== selectedTrack) return false;
      if (resultFilter === 'withResults' && !hasResult) return false;
      if (resultFilter === 'withoutResults' && hasResult) return false;
      if (onlyValueWinners && row?.winnerHorse?.valueStatus !== 'Spelvärd') return false;
      if (onlyStarkPlayWinners && row?.winnerHorse?.play !== 'Stark play') return false;

      return true;
    });
  }, [
    allPredictionRows,
    fromDate,
    toDate,
    selectedGameTypeFilter,
    selectedTrack,
    resultFilter,
    onlyValueWinners,
    onlyStarkPlayWinners
  ]);

  const filteredStats = useMemo(() => {
    const completed = filteredHistory.filter(item => item?.result?.winnerNumber != null);
    const winnerRanks = completed
      .map(item => Number(item?.winnerModelRank))
      .filter(Number.isFinite);
    const winnerFinalScores = completed
      .map(item => getEffectiveFinalScore(item?.winnerHorse))
      .filter(Number.isFinite);
    const winnerOdds = completed
      .map(item => Number(item?.winnerHorse?.odds))
      .filter(odds => Number.isFinite(odds) && odds > 0);
    const valueBetTotals = completed.reduce((totals, item) => {
      const winnerNumber = Number(item?.result?.winnerNumber);
      const horses = Array.isArray(item?.prediction?.horses) ? item.prediction.horses : [];
      const valueSelections = horses.filter(horse => horse?.valueStatus === 'Spelvärd');
      const raceReturn = valueSelections.reduce((sum, horse) => {
        const horseNumber = Number(horse?.number);
        const horseOdds = Number(horse?.odds);
        const isWinningValueSelection =
          Number.isFinite(winnerNumber) &&
          Number.isFinite(horseNumber) &&
          horseNumber === winnerNumber;

        if (!isWinningValueSelection || !Number.isFinite(horseOdds) || horseOdds <= 0) {
          return sum;
        }

        return sum + horseOdds;
      }, 0);

      return {
        totalStake: totals.totalStake + valueSelections.length,
        totalReturn: totals.totalReturn + raceReturn
      };
    }, { totalStake: 0, totalReturn: 0 });
    const clvDiagnostics = {
      totalRecords: completed.length,
      totalValueSelections: 0,
      recordsWithModelOdds: 0,
      recordsWithStartOdds: 0,
      recordsWithBoth: 0,
      sample: []
    };
    const clvValues = completed.reduce((values, item) => {
      const horses = Array.isArray(item?.prediction?.horses) ? item.prediction.horses : [];
      const valueSelections = horses.filter(horse => horse?.valueStatus === 'Spelvärd');

      valueSelections.forEach(horse => {
        const horseNumber = Number(horse?.number);
        const modelOdds = Number(horse?.odds);
        const startOdds = Number(
          horse?.startOdds ??
          horse?.closingOdds ??
          horse?.finalOdds ??
          horse?.resultOdds ??
          item?.result?.oddsByHorse?.[horseNumber] ??
          item?.result?.startOddsByHorse?.[horseNumber] ??
          item?.result?.closingOddsByHorse?.[horseNumber]
        );
        const hasModelOdds = Number.isFinite(modelOdds) && modelOdds > 0;
        const hasStartOdds = Number.isFinite(startOdds) && startOdds > 0;

        clvDiagnostics.totalValueSelections += 1;
        if (hasModelOdds) {
          clvDiagnostics.recordsWithModelOdds += 1;
        }
        if (hasStartOdds) {
          clvDiagnostics.recordsWithStartOdds += 1;
        }
        if (hasModelOdds && hasStartOdds) {
          clvDiagnostics.recordsWithBoth += 1;
        }
        if (clvDiagnostics.sample.length < 5) {
          clvDiagnostics.sample.push({
            raceId: item?.raceId || item?.raceLabel || null,
            horseNumber,
            modelOdds,
            startOdds,
            hasModelOdds,
            hasStartOdds,
            hasBoth: hasModelOdds && hasStartOdds
          });
        }

        if (!Number.isFinite(modelOdds) || modelOdds <= 0 || !Number.isFinite(startOdds) || startOdds <= 0) {
          return;
        }

        values.push((modelOdds - startOdds) / modelOdds);
      });

      return values;
    }, []);
    console.log('CLV diagnostics', clvDiagnostics);

    const averageWinnerRank = winnerRanks.length
      ? Number((winnerRanks.reduce((sum, v) => sum + v, 0) / winnerRanks.length).toFixed(2))
      : null;

    const averageWinnerFinalScore = winnerFinalScores.length
      ? Number((winnerFinalScores.reduce((sum, v) => sum + v, 0) / winnerFinalScores.length).toFixed(2))
      : null;

    const averageWinnerOdds = winnerOdds.length
      ? Number((winnerOdds.reduce((sum, v) => sum + v, 0) / winnerOdds.length).toFixed(2))
      : '–';
    const roiValue = valueBetTotals.totalStake > 0
      ? valueBetTotals.totalReturn / valueBetTotals.totalStake
      : null;
    console.log({
      totalValueBets: valueBetTotals.totalStake,
      totalReturn: valueBetTotals.totalReturn,
      ROI: roiValue
    });
    const roiSpelvarda = valueBetTotals.totalStake > 0
      ? `${roiValue.toFixed(2)} (${(roiValue * 100).toFixed(2)}%)`
      : '–';
    const averageCLVValue = clvValues.length
      ? clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length
      : null;
    const averageCLV = Number.isFinite(averageCLVValue)
      ? `${averageCLVValue > 0 ? '+' : ''}${(averageCLVValue * 100).toFixed(1)}%`
      : '–';

    return {
      totalRaces: filteredHistory.length,
      winnerTop1: completed.filter(item => item.winnerInTop1).length,
      winnerTop3: completed.filter(item => item.winnerInTop3).length,
      winnerTop5: completed.filter(item => item.winnerInTop5).length,
      valueWinners: completed.filter(item => item?.winnerHorse?.valueStatus === 'Spelvärd').length,
      starkPlayWinners: completed.filter(item => item?.winnerHorse?.play === 'Stark play').length,
      averageWinnerOdds,
      roiSpelvarda,
      averageCLV,
      averageCLVValue,
      averageWinnerRank,
      averageWinnerFinalScore
    };
  }, [filteredHistory]);

  const hitRateByKey = useMemo(() => {
    const totalRaces = filteredStats.totalRaces;
    const toRate = (count) => {
      if (!totalRaces) {
        return null;
      }

      return ((count / totalRaces) * 100).toFixed(1);
    };

    return {
      winnerTop1: toRate(filteredStats.winnerTop1),
      winnerTop3: toRate(filteredStats.winnerTop3),
      winnerTop5: toRate(filteredStats.winnerTop5),
      valueWinners: toRate(filteredStats.valueWinners),
      starkPlayWinners: toRate(filteredStats.starkPlayWinners)
    };
  }, [filteredStats]);

  const roiByOddsRange = useMemo(() => {
    const completed = filteredHistory.filter(item => item?.result?.winnerNumber != null);
    const initialTotals = ROI_ODDS_BUCKETS.reduce((acc, bucket) => {
      acc[bucket.key] = { totalBets: 0, wins: 0, totalReturn: 0 };
      return acc;
    }, {});

    const bucketTotals = completed.reduce((acc, item) => {
      const winnerNumber = Number(item?.result?.winnerNumber);
      const horses = Array.isArray(item?.prediction?.horses) ? item.prediction.horses : [];
      const valueSelections = horses.filter(horse => horse?.valueStatus === 'Spelvärd');

      valueSelections.forEach(horse => {
        const horseOdds = Number(horse?.odds);
        const horseNumber = Number(horse?.number);

        if (!Number.isFinite(horseOdds) || horseOdds <= 0) {
          return;
        }

        const bucket = ROI_ODDS_BUCKETS.find(range =>
          horseOdds >= range.min &&
          (range.max === Infinity ? true : horseOdds < range.max)
        );

        if (!bucket) {
          return;
        }

        const isWin = Number.isFinite(winnerNumber) && Number.isFinite(horseNumber) && horseNumber === winnerNumber;
        acc[bucket.key].totalBets += 1;
        if (isWin) {
          acc[bucket.key].wins += 1;
          acc[bucket.key].totalReturn += horseOdds;
        }
      });

      return acc;
    }, initialTotals);

    return ROI_ODDS_BUCKETS.map(bucket => {
      const totals = bucketTotals[bucket.key];
      const roi = totals.totalBets > 0 ? totals.totalReturn / totals.totalBets : 0;

      return {
        label: bucket.label,
        bets: totals.totalBets,
        wins: totals.wins,
        roi: roi.toFixed(2)
      };
    });
  }, [filteredHistory]);

  const hasLegacyRowsMissingGameId = hasMissingGameIds(history);

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
      gameId: item.gameId || null,
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

  const handleAutoSyncResults = async () => {
    console.log('AUTO RESULT SYNC STARTED');
    setIsAutoSyncing(true);
    setAutoSyncSummary('');

    try {
      const summary = await syncMissingResults(history);
      const reloadedHistory = getPerformanceHistory();
      console.log('Reloaded history after sync:', reloadedHistory);
      setAutoSyncSummary(`Kontrollerade ${summary.checked}, uppdaterade ${summary.updated}, hoppade över ${summary.skipped}.`);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.warn('[PerformanceDashboard] Auto result sync failed:', error);
      setAutoSyncSummary('Kunde inte hämta resultat automatiskt.');
    } finally {
      setIsAutoSyncing(false);
    }
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
              onClick={handleAutoSyncResults}
              disabled={isAutoSyncing}
              data-testid="auto-sync-results-button"
            >
              {isAutoSyncing ? 'Hämtar...' : 'Hämta resultat automatiskt'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Från datum</div>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-[#0a0e1a] border-gray-700"
                data-testid="filter-from-date"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Till datum</div>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-[#0a0e1a] border-gray-700"
                data-testid="filter-to-date"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Spelform</div>
              <select
                value={selectedGameTypeFilter}
                onChange={(e) => setSelectedGameTypeFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-700 bg-[#0a0e1a] px-3 text-sm text-white"
                data-testid="filter-game-type"
              >
                {GAME_TYPE_FILTERS.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Bana</div>
              <select
                value={selectedTrack}
                onChange={(e) => setSelectedTrack(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-700 bg-[#0a0e1a] px-3 text-sm text-white"
                data-testid="filter-track"
              >
                <option value="Alla banor">Alla banor</option>
                {availableTracks.map(track => (
                  <option key={track} value={track}>{track}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Resultatstatus</div>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-700 bg-[#0a0e1a] px-3 text-sm text-white"
                data-testid="filter-result-status"
              >
                <option value="all">Alla</option>
                <option value="withResults">Endast lopp med resultat</option>
                <option value="withoutResults">Endast lopp utan resultat</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 mt-6">
              <input
                type="checkbox"
                checked={onlyValueWinners}
                onChange={(e) => setOnlyValueWinners(e.target.checked)}
                className="rounded border-gray-600 bg-[#0a0e1a]"
                data-testid="filter-value-winners"
              />
              Endast spelvärda vinnare
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 mt-6">
              <input
                type="checkbox"
                checked={onlyStarkPlayWinners}
                onChange={(e) => setOnlyStarkPlayWinners(e.target.checked)}
                className="rounded border-gray-600 bg-[#0a0e1a]"
                data-testid="filter-stark-winners"
              />
              Endast Stark play-vinnare
            </label>
          </div>

          {autoSyncSummary && (
            <div className="text-sm text-gray-300 mb-3">{autoSyncSummary}</div>
          )}
          {hasLegacyRowsMissingGameId && (
            <div className="text-sm text-amber-300 mb-3">
              Äldre historikrader saknar gameId och kan därför inte alltid få resultat automatiskt
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {statCards.map(card => (
              <div key={card.key} className="p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
                <div className="text-xs text-gray-400 uppercase tracking-wide">{card.label}</div>
                <div className={`text-2xl font-semibold mt-1 ${
                  card.key === 'averageCLV' && Number.isFinite(filteredStats.averageCLVValue)
                    ? (filteredStats.averageCLVValue > 0 ? 'text-green-400' : filteredStats.averageCLVValue < 0 ? 'text-red-400' : 'text-white')
                    : 'text-white'
                }`}>
                  {filteredStats[card.key] ?? 0}
                  {hitRateByKey[card.key] != null ? ` (${hitRateByKey[card.key]}%)` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div className="p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Snitt rank (vinnare)</div>
              <div className="text-xl font-semibold text-white mt-1">
                {formatMetric(filteredStats.averageWinnerRank)}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Snitt kalibrerad score (vinnare)</div>
              <div className="text-xl font-semibold text-white mt-1">
                {formatMetric(filteredStats.averageWinnerFinalScore)}
              </div>
            </div>
          </div>

          <div className="mt-3 p-3 rounded-lg border border-gray-700 bg-[#0f1420]">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">ROI per oddsintervall (Spelvärda)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 pr-3">Odds range</th>
                    <th className="text-left py-2 pr-3">Bets</th>
                    <th className="text-left py-2 pr-3">Wins</th>
                    <th className="text-left py-2 pr-3">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {roiByOddsRange.map(row => (
                    <tr key={row.label} className="border-b border-gray-800/80">
                      <td className="py-2 pr-3 text-gray-300">{row.label}</td>
                      <td className="py-2 pr-3 text-white">{row.bets}</td>
                      <td className="py-2 pr-3 text-white">{row.wins}</td>
                      <td className="py-2 pr-3 text-white">{row.roi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div className="text-sm text-gray-400 mb-3" data-testid="filtered-history-summary">
            Visar {filteredHistory.length} av {allPredictionRows.length} lopp
          </div>
          {filteredHistory.length === 0 ? (
            <div className="text-sm text-gray-400" data-testid="performance-empty-state">
              Inga lopp matchar valda filter.
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
                    <th className="text-left py-2 pr-3">Kalibrerad score</th>
                    <th className="text-left py-2 pr-3">Play</th>
                    <th className="text-left py-2 pr-3">Resultat</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item, index) => {
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
                        <td className="py-2 pr-3 text-white">{formatMetric(getEffectiveFinalScore(winner))}</td>
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
