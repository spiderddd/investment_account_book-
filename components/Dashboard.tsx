import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { TrendingUp, DollarSign, Activity, Wallet, History, Calendar, Filter, ArrowRight } from 'lucide-react';
import { StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';

interface DashboardProps {
  strategies: StrategyVersion[]; 
  snapshots: SnapshotItem[];
}

type ViewMode = 'strategy' | 'total';
type TimeRange = 'all' | 'ytd' | '1y';

const Dashboard: React.FC<DashboardProps> = ({ strategies: versions, snapshots }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('strategy');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  // --- Date Filtering & Baseline Logic ---
  
  // 1. Sort all snapshots first
  const sortedAllSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [snapshots]);

  // 2. Determine the time range boundary
  const rangeConfig = useMemo(() => {
    if (timeRange === 'all') return { startDate: null, label: '历史累计' };

    const now = new Date();
    let start = new Date();
    
    if (timeRange === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1); // Jan 1st of current year
      return { startDate: start.toISOString().slice(0, 7), label: '今年以来' };
    } else {
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1); // 1 year ago
      return { startDate: start.toISOString().slice(0, 7), label: '近一年' };
    }
  }, [timeRange]);

  // 3. Filter snapshots for the CHART
  const filteredSnapshots = useMemo(() => {
    if (!rangeConfig.startDate) return sortedAllSnapshots;
    return sortedAllSnapshots.filter(s => s.date >= rangeConfig.startDate!);
  }, [sortedAllSnapshots, rangeConfig]);

  // 4. Determine Start (Baseline) and End Snapshots for METRICS
  const { startSnapshot, endSnapshot } = useMemo(() => {
    if (sortedAllSnapshots.length === 0) return { startSnapshot: null, endSnapshot: null };
    
    const end = filteredSnapshots[filteredSnapshots.length - 1] || sortedAllSnapshots[sortedAllSnapshots.length - 1];
    
    // For 'all', baseline is essentially 0 (or null).
    if (timeRange === 'all') {
      return { startSnapshot: null, endSnapshot: end };
    }

    // For time ranges, we try to find the snapshot immediately BEFORE the first one in the range
    // to calculate the "Delta" accurately.
    const firstInWindow = filteredSnapshots[0];
    if (!firstInWindow) return { startSnapshot: null, endSnapshot: end };

    const idx = sortedAllSnapshots.findIndex(s => s.id === firstInWindow.id);
    // If there is a previous snapshot, use it as baseline. 
    // If not (e.g. data starts inside the window), use the first one as baseline (profit starts at 0 for period).
    const baseline = idx > 0 ? sortedAllSnapshots[idx - 1] : null;

    return { startSnapshot: baseline, endSnapshot: end };
  }, [sortedAllSnapshots, filteredSnapshots, timeRange]);


  // --- Helper to extract value based on ViewMode ---
  const getSnapshotMetrics = (s: SnapshotItem | null) => {
    if (!s) return { value: 0, invested: 0 };
    
    if (viewMode === 'total') {
      return { value: s.totalValue, invested: s.totalInvested };
    } else {
      // Strategy View
      const value = s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.marketValue, 0);
      const invested = s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.totalCost, 0);
      return { value, invested };
    }
  };

  // --- Calculate Display Metrics ---
  const endMetrics = getSnapshotMetrics(endSnapshot);
  const startMetrics = getSnapshotMetrics(startSnapshot);

  // Key Logic: 
  // If TimeRange == 'all', Profit = End.Value - End.Invested
  // If TimeRange != 'all', Profit = (End.Value - End.Invested) - (Start.Value - Start.Invested)
  // This gives the "Profit generated DURING the period"
  
  const displayValue = endMetrics.value;
  // For invested, usually we show Total Invested at end point
  const displayInvested = endMetrics.invested; 
  
  const periodProfit = timeRange === 'all' 
    ? (endMetrics.value - endMetrics.invested)
    : (endMetrics.value - endMetrics.invested) - (startMetrics.value - startMetrics.invested);

  // Calculate Period Yield (Simple return on average capital or just end return?)
  // Simple approximation: Period Profit / End Invested (or Avg Invested). keeping simple.
  const returnRate = displayInvested > 0 ? (periodProfit / displayInvested) * 100 : 0;


  // --- Strategy Context ---
  const appliedStrategy = useMemo(() => {
    if (!endSnapshot) return null;
    return StorageService.getStrategyForDate(versions, endSnapshot.date);
  }, [versions, endSnapshot]);

  // --- Chart Data: Allocation (End Snapshot) ---
  const allocationData = useMemo(() => {
    if (!endSnapshot) return [];
    
    if (viewMode === 'strategy') {
      if (!appliedStrategy) return [];
      
      // Calculate strategy pool size (might differ from total strategy assets if unmapped items exist?)
      // We use the endMetrics calculated earlier for consistency
      const stratTotal = endMetrics.value; 

      const actualMap = new Map<string, number>();
      endSnapshot.assets.forEach(a => {
        if (a.strategyId) actualMap.set(a.strategyId, a.marketValue);
      });

      return appliedStrategy.items.map(s => {
        const actualValue = actualMap.get(s.id) || 0;
        const actualPercent = stratTotal > 0 ? (actualValue / stratTotal) * 100 : 0;
        
        return {
          name: s.targetName,
          value: actualValue,
          percent: parseFloat(actualPercent.toFixed(1)),
          targetPercent: s.targetWeight,
          color: s.color,
          deviation: actualPercent - s.targetWeight
        };
      }).sort((a, b) => b.value - a.value);

    } else {
      // Total Asset View: Group by Category
      const grouped = endSnapshot.assets.reduce((acc, curr) => {
        let cat = '其他';
        
        switch (curr.category) {
          case 'security':
          case 'fund':
            cat = '股票基金'; // Equity
            break;
          case 'fixed':
          case 'wealth':
            cat = '现金固收'; // Fixed Income
            break;
          case 'gold':
          case 'crypto':
            cat = '商品另类'; // Alternative / Commodities
            break;
          default:
            cat = '其他';
        }

        acc[cat] = (acc[cat] || 0) + curr.marketValue;
        return acc;
      }, {} as Record<string, number>);

      const colors: Record<string, string> = {
        '股票基金': '#3b82f6', // Blue
        '商品另类': '#f59e0b', // Amber
        '现金固收': '#64748b', // Slate
        '其他': '#a855f7'      // Purple
      };

      return Object.keys(grouped).map(key => ({
        name: key,
        value: grouped[key],
        percent: parseFloat(((grouped[key] / endMetrics.value) * 100).toFixed(1)),
        color: colors[key] || '#cbd5e1'
      })).sort((a, b) => b.value - a.value);
    }
  }, [appliedStrategy, endSnapshot, endMetrics, viewMode]);

  // --- Chart Data: History ---
  const historyData = useMemo(() => {
    return filteredSnapshots.map(s => {
      const m = viewMode === 'total' 
        ? { val: s.totalValue, inv: s.totalInvested }
        : { 
            val: s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.marketValue, 0),
            inv: s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.totalCost, 0)
          };

      return {
        date: s.date,
        value: m.val,
        invested: m.inv
      };
    });
  }, [filteredSnapshots, viewMode]);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center p-6">
         <div className="bg-blue-100 p-4 rounded-full mb-4">
          <History size={48} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">欢迎使用 InvestTrack</h2>
        <p className="text-slate-500 max-w-md mb-6">
          请先定义您的第一个投资策略版本。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 relative">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="bg-slate-200 p-1 rounded-xl inline-flex self-start">
          <button
            onClick={() => setViewMode('strategy')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              viewMode === 'strategy' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <TrendingUp size={16} />
            策略资产
          </button>
          <button
            onClick={() => setViewMode('total')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              viewMode === 'total' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Wallet size={16} />
            全部净值
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 self-start">
           <div className="px-2 text-slate-400">
             <Calendar size={14} />
           </div>
           {(['all', 'ytd', '1y'] as TimeRange[]).map((range) => (
             <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
             >
                {range === 'all' ? '全部' : range === 'ytd' ? '今年' : '近一年'}
             </button>
           ))}
        </div>
      </div>
      
      {/* Date Context & Period Analysis Indicator */}
      {timeRange !== 'all' && endSnapshot && (
        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
           <Filter size={12} className="text-blue-500" />
           <span className="font-semibold text-blue-700">{rangeConfig.label}区间分析:</span>
           <div className="flex items-center gap-1">
             <span className="bg-white px-1.5 py-0.5 rounded border border-blue-100">{startSnapshot ? startSnapshot.date : '期初'}</span>
             <ArrowRight size={12} className="text-blue-300" />
             <span className="bg-white px-1.5 py-0.5 rounded border border-blue-100">{endSnapshot.date}</span>
           </div>
           <span className="text-slate-400 ml-auto hidden sm:inline">基于区间变动计算盈亏</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">
              {viewMode === 'strategy' ? '期末策略市值' : '期末总资产'}
            </span>
            <DollarSign className="text-rose-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ¥{displayValue.toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">期末总本金</span>
            <Activity className="text-blue-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ¥{displayInvested.toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
          {timeRange !== 'all' && (
             <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
               区间收益
             </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">
              {timeRange === 'all' ? '历史累计盈亏' : `${rangeConfig.label}盈亏`}
            </span>
            {/* Red Up, Green Down */}
            <TrendingUp className={periodProfit >= 0 ? "text-rose-500" : "text-emerald-500"} size={20} />
          </div>
          <div className={`text-2xl font-bold ${periodProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {periodProfit >= 0 ? '+' : ''}
            {periodProfit.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
             <span>{timeRange === 'all' ? '累计回报率' : '区间回报率'}:</span>
             <span className={`font-mono ${periodProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
               {periodProfit >= 0 ? '+' : ''}{returnRate.toFixed(2)}%
             </span>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Allocation Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-6">
            {viewMode === 'strategy' ? '期末策略偏离度' : '期末资产分布'}
          </h3>
          {allocationData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {allocationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">
              暂无数据
            </div>
          )}
          
          <div className="mt-6">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              明细数据 ({endSnapshot?.date})
            </h4>
            <div className="space-y-3">
              {allocationData.map((item: any) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-slate-700">{item.name}</span>
                  </div>
                  
                  {viewMode === 'strategy' ? (
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500 text-xs">目标: {item.targetPercent}%</span>
                      <span className={`font-medium ${Math.abs(item.deviation) > 5 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {item.percent}% 
                        <span className="text-xs ml-1 opacity-70">
                          ({item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  ) : (
                     <div className="flex items-center gap-4">
                       <span className="font-bold text-slate-800">¥{item.value.toLocaleString()}</span>
                       <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-xs">
                         {item.percent}%
                       </span>
                     </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">
              {viewMode === 'strategy' ? '策略资产增长曲线' : '家庭总资产增长曲线'}
            </h3>
          </div>
          
          {historyData.length > 0 ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                       {/* Red/Rose for Strategy View (Growth), Blue for Total (Stability) */}
                      <stop offset="5%" stopColor={viewMode === 'strategy' ? "#f43f5e" : "#3b82f6"} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={viewMode === 'strategy' ? "#f43f5e" : "#3b82f6"} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tick={{fontSize: 12, fill: '#94a3b8'}} 
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis 
                    tick={{fontSize: 12, fill: '#94a3b8'}} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `¥${value / 1000}k`}
                  />
                  <RechartsTooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    name="资产净值"
                    stroke={viewMode === 'strategy' ? "#f43f5e" : "#3b82f6"} 
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                    strokeWidth={2}
                    animationDuration={500}
                  />
                   <Area 
                    type="monotone" 
                    dataKey="invested" 
                    name="投入本金"
                    stroke="#64748b" 
                    fillOpacity={1} 
                    fill="url(#colorInvested)" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    animationDuration={500}
                  />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">
              该时间段内暂无数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;