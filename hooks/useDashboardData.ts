
import { useState, useMemo, useEffect } from 'react';
import { StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';
import { getStrategyForDate } from '../utils/calculators';

type ViewMode = 'strategy' | 'total';
type TimeRange = 'all' | 'ytd' | '1y';

export const useDashboardData = (strategies: StrategyVersion[], snapshots: SnapshotItem[]) => {
  const [viewMode, setViewMode] = useState<ViewMode>('strategy');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Data States
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [endMetrics, setEndMetrics] = useState({ value: 0, invested: 0, profit: 0, returnRate: 0, periodLabel: '...' });
  const [startMetrics, setStartMetrics] = useState({ value: 0, invested: 0 }); // Legacy support
  const [allocationData, setAllocationData] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [breakdownData, setBreakdownData] = useState<any[]>([]);

  // Derived State for UI Labels
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

  const activeStrategyEnd = useMemo(() => {
      // Find the latest snapshot date from props to determine active strategy for labels
      if (snapshots.length === 0) return null;
      const sorted = [...snapshots].sort((a,b) => b.date.localeCompare(a.date));
      return getStrategyForDate(strategies, sorted[0].date);
  }, [strategies, snapshots]);

  // Fetch Data Effect
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
        setLoadingDetails(true);
        try {
            const [metrics, alloc, trend, breakdown] = await Promise.all([
                StorageService.getDashboardMetrics(viewMode, timeRange),
                StorageService.getDashboardAllocation(viewMode, selectedLayerId),
                StorageService.getDashboardTrend(viewMode, selectedLayerId, rangeConfig.startDate),
                StorageService.getDashboardBreakdown(viewMode, timeRange, selectedLayerId)
            ]);

            if (isMounted) {
                // Map backend metrics to UI expectations
                setEndMetrics({
                    value: metrics.endValue,
                    invested: metrics.endInvested,
                    profit: metrics.profit,
                    returnRate: metrics.returnRate,
                    periodLabel: metrics.periodLabel
                });
                // Start metrics are implicit in the profit calc now, but UI might expect object structure
                setStartMetrics({ value: 0, invested: 0 }); 

                setAllocationData(alloc);
                setHistoryData(trend);
                setBreakdownData(breakdown);
            }
        } catch (error) {
            console.error("Failed to load dashboard data", error);
        } finally {
            if (isMounted) setLoadingDetails(false);
        }
    };

    fetchData();

    return () => { isMounted = false; };
  }, [viewMode, timeRange, selectedLayerId, rangeConfig.startDate]);

  const breakdownTotals = useMemo(() => {
    return breakdownData.reduce((acc, row) => ({
        endVal: acc.endVal + row.endVal,
        endCost: acc.endCost + row.endCost,
        changeVal: acc.changeVal + row.changeVal,
        changeInput: acc.changeInput + row.changeInput,
        profit: acc.profit + row.profit
    }), { endVal: 0, endCost: 0, changeVal: 0, changeInput: 0, profit: 0 });
  }, [breakdownData]);

  // Determine start/end snapshot labels for UI (approximate from props is fine for labels)
  const uiSnapshots = useMemo(() => {
      const sorted = [...snapshots].sort((a,b) => a.date.localeCompare(b.date));
      const end = sorted[sorted.length - 1] || null;
      let start = null;
      if (rangeConfig.startDate) {
          start = sorted.find(s => s.date >= rangeConfig.startDate!) || sorted[0];
      }
      return { start, end };
  }, [snapshots, rangeConfig]);

  return {
    viewMode, setViewMode,
    timeRange, setTimeRange,
    selectedLayerId, setSelectedLayerId,
    rangeConfig,
    startSnapshot: uiSnapshots.start, 
    endSnapshot: uiSnapshots.end,
    loadingDetails,
    endMetrics, 
    startMetrics, // Kept for interface compatibility
    activeStrategyEnd,
    allocationData,
    historyData,
    breakdownData,
    breakdownTotals
  };
};
