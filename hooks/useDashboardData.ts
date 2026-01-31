
import { useState, useMemo, useEffect } from 'react';
import { StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';
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

  // Detail State - We only fetch full details for the specific snapshots we need to analyze
  const [detailSnapshots, setDetailSnapshots] = useState<{start: SnapshotItem | null, end: SnapshotItem | null}>({ start: null, end: null });

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

  // Determine which IDs we need to fetch details for
  const { startId, endId } = useMemo(() => {
    if (sortedAllSnapshots.length === 0) return { startId: null, endId: null };
    const end = filteredSnapshots[filteredSnapshots.length - 1] || sortedAllSnapshots[sortedAllSnapshots.length - 1];
    
    let start = null;
    if (timeRange !== 'all') {
        const firstInWindow = filteredSnapshots[0];
        if (firstInWindow) {
            const idx = sortedAllSnapshots.findIndex(s => s.id === firstInWindow.id);
            start = idx > 0 ? sortedAllSnapshots[idx - 1] : null;
        }
    }
    
    return { startId: start?.id || null, endId: end?.id || null };
  }, [sortedAllSnapshots, filteredSnapshots, timeRange]);

  // Effect: Fetch Details
  useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
        // Reset if IDs change
        setDetailSnapshots(prev => {
            // Keep existing if ID matches to avoid flicker
            const newStart = (prev.start?.id === startId) ? prev.start : null;
            const newEnd = (prev.end?.id === endId) ? prev.end : null;
            return (newStart && newEnd) ? prev : { start: newStart, end: newEnd };
        });

        const promises = [];
        if (startId) promises.push(StorageService.getSnapshot(startId));
        else promises.push(Promise.resolve(null));

        if (endId) promises.push(StorageService.getSnapshot(endId));
        else promises.push(Promise.resolve(null));

        const [startData, endData] = await Promise.all(promises);
        
        if (isMounted) {
            setDetailSnapshots({ start: startData, end: endData });
        }
    };

    loadDetails();
    return () => { isMounted = false; };
  }, [startId, endId]);


  const activeStrategyEnd = useMemo(() => {
      // Use summary snapshot for date if detail not yet loaded
      const date = detailSnapshots.end?.date || (filteredSnapshots.length > 0 ? filteredSnapshots[filteredSnapshots.length-1].date : null);
      if (!date) return null;
      return getStrategyForDate(strategies, date);
  }, [strategies, detailSnapshots.end, filteredSnapshots]);

  // Metrics rely on details if viewMode is strategy, or summary if viewMode is total
  // getSnapshotMetrics handles nulls gracefully
  const endMetrics = useMemo(() => getSnapshotMetrics(detailSnapshots.end || snapshots.find(s => s.id === endId) || null, viewMode, strategies), [detailSnapshots.end, viewMode, strategies, endId, snapshots]);
  const startMetrics = useMemo(() => getSnapshotMetrics(detailSnapshots.start || snapshots.find(s => s.id === startId) || null, viewMode, strategies), [detailSnapshots.start, viewMode, strategies, startId, snapshots]);

  const allocationData = useMemo(() => {
      return calculateAllocationData(detailSnapshots.end, activeStrategyEnd, viewMode, selectedLayerId);
  }, [detailSnapshots.end, activeStrategyEnd, viewMode, selectedLayerId]);

  const historyData = useMemo(() => {
      // History chart uses summary list (fast), doesn't wait for details
      // Note: calculateHistoryData for 'strategy' view mode strictly requires asset details to be accurate if strategy changes over time.
      // However, loading ALL detailed snapshots for history is exactly what we want to avoid.
      // Compromise: 
      // 1. If 'total' view: Summary list is perfect.
      // 2. If 'strategy' view: We approximate using Total Value from summary, OR we accept we need backend aggregation.
      // Given the constraints, we will use the Summary List for the chart. 
      // The current calculateHistoryData implementation filters based on strategy IF assets are present.
      // We will pass the summaries. If assets are missing, calculateHistoryData needs to handle it (likely falling back to total or 0).
      // Optimization: For this frontend-only refactor, we stick to Total View for history or accept slight inaccuracy until backend aggregation is added.
      return calculateHistoryData(filteredSnapshots, strategies, viewMode, selectedLayerId, activeStrategyEnd);
  }, [filteredSnapshots, strategies, viewMode, selectedLayerId, activeStrategyEnd]);

  const breakdownData = useMemo(() => {
      return calculateBreakdownData(detailSnapshots.start, detailSnapshots.end, activeStrategyEnd, viewMode, selectedLayerId);
  }, [detailSnapshots.start, detailSnapshots.end, activeStrategyEnd, viewMode, selectedLayerId]);

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
    startSnapshot: detailSnapshots.start, 
    endSnapshot: detailSnapshots.end,
    endMetrics, startMetrics,
    activeStrategyEnd,
    allocationData,
    historyData,
    breakdownData,
    breakdownTotals
  };
};
