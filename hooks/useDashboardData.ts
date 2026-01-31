
import { useState, useMemo } from 'react';
import { StrategyVersion, SnapshotItem } from '../types';
import { 
    getStrategyForDate, 
    getSnapshotMetrics, 
    calculateAllocationData, 
    calculateHistoryData, 
    calculateBreakdownData 
} from '../utils/calculators';

type ViewMode = 'strategy' | 'total';
type TimeRange = 'all' | 'ytd' | '1y';

export const useDashboardData = (strategies: StrategyVersion[], snapshots: SnapshotItem[]) => {
  const [viewMode, setViewMode] = useState<ViewMode>('strategy');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const sortedAllSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [snapshots]);

  const rangeConfig = useMemo(() => {
    if (timeRange === 'all') return { startDate: null, label: '历史累计' };
    const now = new Date();
    let start = new Date();
    if (timeRange === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString().slice(0, 7), label: '今年以来' };
    } else {
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1); 
      return { startDate: start.toISOString().slice(0, 7), label: '近一年' };
    }
  }, [timeRange]);

  const filteredSnapshots = useMemo(() => {
    if (!rangeConfig.startDate) return sortedAllSnapshots;
    return sortedAllSnapshots.filter(s => s.date >= rangeConfig.startDate!);
  }, [sortedAllSnapshots, rangeConfig]);

  const { startSnapshot, endSnapshot } = useMemo(() => {
    if (sortedAllSnapshots.length === 0) return { startSnapshot: null, endSnapshot: null };
    const end = filteredSnapshots[filteredSnapshots.length - 1] || sortedAllSnapshots[sortedAllSnapshots.length - 1];
    if (timeRange === 'all') return { startSnapshot: null, endSnapshot: end };
    const firstInWindow = filteredSnapshots[0];
    if (!firstInWindow) return { startSnapshot: null, endSnapshot: end };
    const idx = sortedAllSnapshots.findIndex(s => s.id === firstInWindow.id);
    const baseline = idx > 0 ? sortedAllSnapshots[idx - 1] : null;
    return { startSnapshot: baseline, endSnapshot: end };
  }, [sortedAllSnapshots, filteredSnapshots, timeRange]);

  const activeStrategyEnd = useMemo(() => {
      if (!endSnapshot) return null;
      return getStrategyForDate(strategies, endSnapshot.date);
  }, [strategies, endSnapshot]);

  const endMetrics = useMemo(() => getSnapshotMetrics(endSnapshot, viewMode, strategies), [endSnapshot, viewMode, strategies]);
  const startMetrics = useMemo(() => getSnapshotMetrics(startSnapshot, viewMode, strategies), [startSnapshot, viewMode, strategies]);

  const allocationData = useMemo(() => {
      return calculateAllocationData(endSnapshot, activeStrategyEnd, viewMode, selectedLayerId);
  }, [endSnapshot, activeStrategyEnd, viewMode, selectedLayerId]);

  const historyData = useMemo(() => {
      return calculateHistoryData(filteredSnapshots, strategies, viewMode, selectedLayerId, activeStrategyEnd);
  }, [filteredSnapshots, strategies, viewMode, selectedLayerId, activeStrategyEnd]);

  const breakdownData = useMemo(() => {
      return calculateBreakdownData(startSnapshot, endSnapshot, activeStrategyEnd, viewMode, selectedLayerId);
  }, [startSnapshot, endSnapshot, activeStrategyEnd, viewMode, selectedLayerId]);

  const breakdownTotals = useMemo(() => {
    return breakdownData.reduce((acc, row) => ({
        endVal: acc.endVal + row.endVal,
        endCost: acc.endCost + row.endCost,
        changeVal: acc.changeVal + row.changeVal,
        changeInput: acc.changeInput + row.changeInput,
        profit: acc.profit + row.profit
    }), { endVal: 0, endCost: 0, changeVal: 0, changeInput: 0, profit: 0 });
  }, [breakdownData]);

  return {
    viewMode, setViewMode,
    timeRange, setTimeRange,
    selectedLayerId, setSelectedLayerId,
    rangeConfig,
    startSnapshot, endSnapshot,
    endMetrics, startMetrics,
    activeStrategyEnd,
    allocationData,
    historyData,
    breakdownData,
    breakdownTotals
  };
};
