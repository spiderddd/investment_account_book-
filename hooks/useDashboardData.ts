
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

  // 1. History Data State (Lightweight with assets for charts)
  const [historySnapshots, setHistorySnapshots] = useState<SnapshotItem[]>([]);
  
  // 2. Detail State (Full details for Pie/Breakdown)
  const [detailSnapshots, setDetailSnapshots] = useState<{start: SnapshotItem | null, end: SnapshotItem | null}>({ start: null, end: null });
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Initial Load of History Data
  useEffect(() => {
      StorageService.getSnapshotsHistory().then(data => {
          setHistorySnapshots(data);
      });
  }, []);

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

  // Determine which IDs we need to fetch details for (End points for Pie/Table)
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

  // Effect: Fetch Full Details for Start/End points
  useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
        setLoadingDetails(true);
        const promises = [];
        if (startId) promises.push(StorageService.getSnapshot(startId));
        else promises.push(Promise.resolve(null));

        if (endId) promises.push(StorageService.getSnapshot(endId));
        else promises.push(Promise.resolve(null));

        const [startData, endData] = await Promise.all(promises);
        
        if (isMounted) {
            setDetailSnapshots({ start: startData, end: endData });
            setLoadingDetails(false);
        }
    };

    if (startId || endId) {
        // Optimization: if we already have the correct data in memory, don't flicker loading
        if (detailSnapshots.end?.id === endId && detailSnapshots.start?.id === startId) {
            // Do nothing, data matches
        } else {
            loadDetails();
        }
    } else {
        setDetailSnapshots({ start: null, end: null });
        setLoadingDetails(false);
    }
    
    return () => { isMounted = false; };
  }, [startId, endId]);


  const activeStrategyEnd = useMemo(() => {
      // Use detail date or fallback to filtered list date
      const date = detailSnapshots.end?.date || (filteredSnapshots.length > 0 ? filteredSnapshots[filteredSnapshots.length-1].date : null);
      if (!date) return null;
      return getStrategyForDate(strategies, date);
  }, [strategies, detailSnapshots.end, filteredSnapshots]);

  // Metrics: Use Details if available, otherwise fallback to summary list logic (which only works for Total view)
  const endMetrics = useMemo(() => getSnapshotMetrics(detailSnapshots.end || snapshots.find(s => s.id === endId) || null, viewMode, strategies), [detailSnapshots.end, viewMode, strategies, endId, snapshots]);
  const startMetrics = useMemo(() => getSnapshotMetrics(detailSnapshots.start || snapshots.find(s => s.id === startId) || null, viewMode, strategies), [detailSnapshots.start, viewMode, strategies, startId, snapshots]);

  // Allocation (Pie Chart): STRICTLY relies on detailed data
  const allocationData = useMemo(() => {
      // If details aren't loaded yet, return empty to prevent wrong "Total" data being shown in "Strategy" mode
      if (!detailSnapshots.end) return [];
      return calculateAllocationData(detailSnapshots.end, activeStrategyEnd, viewMode, selectedLayerId);
  }, [detailSnapshots.end, activeStrategyEnd, viewMode, selectedLayerId]);

  // History (Line Chart): Uses the separately fetched 'historySnapshots' which contains asset breakdown
  const historyData = useMemo(() => {
      // Filter the history dataset based on time range
      let targetHistory = historySnapshots;
      if (rangeConfig.startDate) {
          targetHistory = historySnapshots.filter(s => s.date >= rangeConfig.startDate!);
      }
      targetHistory = targetHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return calculateHistoryData(targetHistory, strategies, viewMode, selectedLayerId, activeStrategyEnd);
  }, [historySnapshots, rangeConfig, strategies, viewMode, selectedLayerId, activeStrategyEnd]);

  // Breakdown (Table): Relies on detailed start/end
  const breakdownData = useMemo(() => {
      if (!detailSnapshots.end) return []; // Wait for details
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
    loadingDetails,
    endMetrics, startMetrics,
    activeStrategyEnd,
    allocationData,
    historyData,
    breakdownData,
    breakdownTotals
  };
};
