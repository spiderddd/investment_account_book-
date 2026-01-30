import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { TrendingUp, DollarSign, Activity, Wallet, History, Calendar, Filter, ArrowRight, ChevronRight, ArrowLeft, Layers, CornerDownRight } from 'lucide-react';
import { StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';

interface DashboardProps {
  strategies: StrategyVersion[]; 
  snapshots: SnapshotItem[];
}

type ViewMode = 'strategy' | 'total';
type TimeRange = 'all' | 'ytd' | '1y';

const LAYER_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

const CATEGORY_COLORS: Record<string, string> = {
  '股票基金': '#3b82f6', 
  '商品另类': '#f59e0b', 
  '现金固收': '#64748b', 
  '其他': '#a855f7'
};

const Dashboard: React.FC<DashboardProps> = ({ strategies: versions, snapshots }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('strategy');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  
  // Drill-down State: If null, show Layers (Level 1). If set, show Assets in that Layer (Level 2).
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // --- Date Filtering & Baseline Logic ---
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

  const getSnapshotMetrics = (s: SnapshotItem | null) => {
    if (!s) return { value: 0, invested: 0 };
    if (viewMode === 'total') {
      return { value: s.totalValue, invested: s.totalInvested };
    } else {
      const value = s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.marketValue, 0);
      const invested = s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.totalCost, 0);
      return { value, invested };
    }
  };

  const endMetrics = getSnapshotMetrics(endSnapshot);
  const startMetrics = getSnapshotMetrics(startSnapshot);
  const displayValue = endMetrics.value;
  const displayInvested = endMetrics.invested; 
  const periodProfit = timeRange === 'all' 
    ? (endMetrics.value - endMetrics.invested)
    : (endMetrics.value - endMetrics.invested) - (startMetrics.value - startMetrics.invested);
  const returnRate = displayInvested > 0 ? (periodProfit / displayInvested) * 100 : 0;

  // --- Strategy Context ---
  const appliedStrategy = useMemo(() => {
    if (!endSnapshot) return null;
    return StorageService.getStrategyForDate(versions, endSnapshot.date);
  }, [versions, endSnapshot]);

  const selectedLayerInfo = useMemo(() => {
    if (!appliedStrategy || !selectedLayerId) return null;
    return appliedStrategy.layers.find(l => l.id === selectedLayerId);
  }, [appliedStrategy, selectedLayerId]);

  // --- Chart Data Calculation ---
  const allocationData = useMemo(() => {
    if (!endSnapshot) return [];
    
    if (viewMode === 'strategy') {
      if (!appliedStrategy) return [];
      const stratTotal = endMetrics.value; 

      // Build Map: StrategyTargetID -> Market Value
      const actualMap = new Map<string, number>();
      endSnapshot.assets.forEach(a => {
        if (a.strategyId) actualMap.set(a.strategyId, a.marketValue);
      });

      if (selectedLayerId === null) {
          // --- Level 1: Layer View (Root) ---
          return appliedStrategy.layers.map((layer, idx) => {
              // Sum up all assets in this layer
              const layerActualValue = layer.items.reduce((sum, item) => sum + (actualMap.get(item.id) || 0), 0);
              const actualPercent = stratTotal > 0 ? (layerActualValue / stratTotal) * 100 : 0;
              
              return {
                  id: layer.id,
                  name: layer.name,
                  value: layerActualValue,
                  percent: parseFloat(actualPercent.toFixed(1)),
                  targetPercent: layer.weight,
                  color: LAYER_COLORS[idx % LAYER_COLORS.length],
                  deviation: actualPercent - layer.weight,
                  isLayer: true // Flag for click handler
              };
          }).sort((a, b) => b.targetPercent - a.targetPercent);

      } else {
          // --- Level 2: Asset View (Drill Down) ---
          const layer = appliedStrategy.layers.find(l => l.id === selectedLayerId);
          if (!layer) return [];

          // Calculate Layer Total Value (for internal percentage context)
          const layerTotalValue = layer.items.reduce((sum, item) => sum + (actualMap.get(item.id) || 0), 0);
          
          // Calculate Auto Weights logic for this layer
          const fixedItems = layer.items.filter(t => t.weight >= 0);
          const autoItems = layer.items.filter(t => t.weight === -1);
          const usedWeight = fixedItems.reduce((sum, t) => sum + t.weight, 0);
          const remainingWeight = Math.max(0, 100 - usedWeight);
          const calculatedAutoWeight = autoItems.length > 0 ? (remainingWeight / autoItems.length) : 0;

          return layer.items.map(t => {
            const actualValue = actualMap.get(t.id) || 0;
            // Internal Percentage: % of the Layer's total value
            const actualInnerPercent = layerTotalValue > 0 ? (actualValue / layerTotalValue) * 100 : 0;
            const targetInnerPercent = t.weight === -1 ? calculatedAutoWeight : t.weight;

            return {
              id: t.id,
              name: t.targetName,
              value: actualValue,
              percent: parseFloat(actualInnerPercent.toFixed(1)),
              targetPercent: parseFloat(targetInnerPercent.toFixed(1)),
              color: t.color,
              deviation: actualInnerPercent - targetInnerPercent,
              isLayer: false
            };
          }).sort((a, b) => b.value - a.value);
      }

    } else {
      // --- Total View (Unchanged logic for Asset Categories) ---
      const grouped = endSnapshot.assets.reduce((acc, curr) => {
        let cat = '其他';
        switch (curr.category) {
          case 'security': case 'fund': cat = '股票基金'; break;
          case 'fixed': case 'wealth': cat = '现金固收'; break;
          case 'gold': case 'crypto': cat = '商品另类'; break;
          default: cat = '其他';
        }
        acc[cat] = (acc[cat] || 0) + curr.marketValue;
        return acc;
      }, {} as Record<string, number>);

      return Object.keys(grouped).map(key => ({
        name: key,
        value: grouped[key],
        percent: parseFloat(((grouped[key] / endMetrics.value) * 100).toFixed(1)),
        color: CATEGORY_COLORS[key] || '#cbd5e1'
      })).sort((a, b) => b.value - a.value);
    }
  }, [appliedStrategy, endSnapshot, endMetrics, viewMode, selectedLayerId]);

  const historyData = useMemo(() => {
    // Determine scope of assets to include in history
    let targetAssetIds: Set<string> | null = null;
    
    if (viewMode === 'strategy' && selectedLayerId && appliedStrategy) {
       const layer = appliedStrategy.layers.find(l => l.id === selectedLayerId);
       if (layer) {
           targetAssetIds = new Set(layer.items.map(i => i.assetId));
       }
    }

    return filteredSnapshots.map(s => {
      let val = 0;
      let inv = 0;
      
      if (viewMode === 'strategy') {
          if (targetAssetIds) {
              // History for specific Layer (proxy by current assets in that layer)
              const assets = s.assets.filter(a => targetAssetIds!.has(a.assetId));
              val = assets.reduce((sum, a) => sum + a.marketValue, 0);
              inv = assets.reduce((sum, a) => sum + a.totalCost, 0);
          } else {
              // History for Total Strategy
              const assets = s.assets.filter(a => a.strategyId);
              val = assets.reduce((sum, a) => sum + a.marketValue, 0);
              inv = assets.reduce((sum, a) => sum + a.totalCost, 0);
          }
      } else {
          // Total View
          val = s.totalValue;
          inv = s.totalInvested;
      }

      return {
        date: s.date,
        value: val,
        invested: inv
      };
    });
  }, [filteredSnapshots, viewMode, selectedLayerId, appliedStrategy]);

  // --- Breakdown Table Data ---
  const breakdownData = useMemo(() => {
    if (!endSnapshot) return [];
    if (viewMode === 'strategy' && !appliedStrategy) return [];

    const startSnap = startSnapshot; // null if all time or first record
    
    // Helper to get stats for a list of Asset IDs
    const getStats = (s: SnapshotItem | null, assetIds: Set<string>) => {
        if (!s) return { v: 0, c: 0 };
        const relevant = s.assets.filter(a => assetIds.has(a.assetId));
        return {
            v: relevant.reduce((sum, a) => sum + a.marketValue, 0),
            c: relevant.reduce((sum, a) => sum + a.totalCost, 0)
        };
    };

    if (viewMode === 'total') {
        // --- Total View: Group by Category ---
        const categories = ['股票基金', '现金固收', '商品另类', '其他'];
        const catMap: Record<string, string> = {
            'security': '股票基金', 'fund': '股票基金',
            'fixed': '现金固收', 'wealth': '现金固收',
            'gold': '商品另类', 'crypto': '商品另类',
            'other': '其他'
        };

        const calcCatStats = (s: SnapshotItem | null) => {
            const res: Record<string, { v: number, c: number }> = {};
            categories.forEach(c => res[c] = { v: 0, c: 0 });
            if (!s) return res;
            
            s.assets.forEach(a => {
                const cat = catMap[a.category] || '其他';
                if (res[cat]) {
                    res[cat].v += a.marketValue;
                    res[cat].c += a.totalCost;
                }
            });
            return res;
        };

        const endStats = calcCatStats(endSnapshot);
        const startStats = calcCatStats(startSnap);

        return categories.map(cat => {
            const end = endStats[cat];
            const start = startStats[cat];
             return {
                id: cat,
                name: cat,
                color: CATEGORY_COLORS[cat] || '#cbd5e1',
                endVal: end.v,
                endCost: end.c,
                changeVal: end.v - start.v,
                changeInput: end.c - start.c,
                profit: (end.v - end.c) - (start.v - start.c)
            };
        }).filter(r => r.endVal > 0 || Math.abs(r.changeVal) > 0 || Math.abs(r.profit) > 0).sort((a,b) => b.endVal - a.endVal);

    } else if (selectedLayerId) {
        // --- Strategy View: ASSETS Breakdown (Drill Down) ---
        const layer = appliedStrategy!.layers.find(l => l.id === selectedLayerId);
        if (!layer) return [];
        
        return layer.items.map(item => {
            const assetIds = new Set<string>([item.assetId]);
            const end = getStats(endSnapshot, assetIds);
            const start = getStats(startSnap, assetIds);
            
            return {
                id: item.id,
                name: item.targetName,
                color: item.color,
                endVal: end.v,
                endCost: end.c, // Needed for ROI
                changeVal: end.v - start.v,
                changeInput: end.c - start.c,
                profit: (end.v - end.c) - (start.v - start.c)
            };
        }).sort((a,b) => b.endVal - a.endVal);
    } else {
        // --- Strategy View: LAYERS Breakdown (Top Level) ---
        return appliedStrategy!.layers.map((layer, idx) => {
            const assetIds = new Set<string>(layer.items.map(i => i.assetId));
            const end = getStats(endSnapshot, assetIds);
            const start = getStats(startSnap, assetIds);
            
            return {
                id: layer.id,
                name: layer.name,
                color: LAYER_COLORS[idx % LAYER_COLORS.length],
                endVal: end.v,
                endCost: end.c, // Needed for ROI
                changeVal: end.v - start.v,
                changeInput: end.c - start.c,
                profit: (end.v - end.c) - (start.v - start.c)
            };
        });
    }
  }, [viewMode, selectedLayerId, appliedStrategy, endSnapshot, startSnapshot]);

  const breakdownTotals = useMemo(() => {
    return breakdownData.reduce((acc, row) => ({
        endVal: acc.endVal + row.endVal,
        endCost: acc.endCost + row.endCost,
        changeVal: acc.changeVal + row.changeVal,
        changeInput: acc.changeInput + row.changeInput,
        profit: acc.profit + row.profit
    }), { endVal: 0, endCost: 0, changeVal: 0, changeInput: 0, profit: 0 });
  }, [breakdownData]);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center p-6">
         <div className="bg-blue-100 p-4 rounded-full mb-4"><History size={48} className="text-blue-600" /></div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">欢迎使用 InvestTrack</h2>
        <p className="text-slate-500 max-w-md mb-6">请先定义您的第一个投资策略版本。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 relative">
      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="bg-slate-200 p-1 rounded-xl inline-flex self-start">
          <button onClick={() => { setViewMode('strategy'); setSelectedLayerId(null); }} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${viewMode === 'strategy' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp size={16} />策略资产</button>
          <button onClick={() => { setViewMode('total'); setSelectedLayerId(null); }} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${viewMode === 'total' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Wallet size={16} />全部净值</button>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 self-start">
           <div className="px-2 text-slate-400"><Calendar size={14} /></div>
           {(['all', 'ytd', '1y'] as TimeRange[]).map((range) => (
             <button key={range} onClick={() => setTimeRange(range)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${timeRange === range ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {range === 'all' ? '全部' : range === 'ytd' ? '今年' : '近一年'}
             </button>
           ))}
        </div>
      </div>
      
      {/* Analysis Banner */}
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

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">{viewMode === 'strategy' ? '期末策略市值' : '期末总资产'}</span>
            <DollarSign className="text-rose-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">¥{displayValue.toLocaleString()}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">期末总本金</span>
            <Activity className="text-blue-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">¥{displayInvested.toLocaleString()}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
          {timeRange !== 'all' && <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-bl-lg">区间收益</div>}
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">{timeRange === 'all' ? '历史累计盈亏' : `${rangeConfig.label}盈亏`}</span>
            <TrendingUp className={periodProfit >= 0 ? "text-rose-500" : "text-emerald-500"} size={20} />
          </div>
          <div className={`text-2xl font-bold ${periodProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{periodProfit >= 0 ? '+' : ''}{periodProfit.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
             <span>{timeRange === 'all' ? '累计回报率' : '区间回报率'}:</span>
             <span className={`font-mono ${periodProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{periodProfit >= 0 ? '+' : ''}{returnRate.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Pie Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-2">
                {selectedLayerId && (
                   <button onClick={() => setSelectedLayerId(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                     <ArrowLeft size={18} />
                   </button>
                )}
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  {viewMode === 'strategy' ? (
                      selectedLayerId ? (
                          <>
                           <span className="text-slate-400 font-normal text-sm">策略偏离度</span>
                           <span className="text-slate-300">/</span>
                           <span>{selectedLayerInfo?.name}</span>
                          </>
                      ) : '期末策略偏离度'
                  ) : '期末资产分布'}
                </h3>
             </div>
             {viewMode === 'strategy' && selectedLayerId && (
                 <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-medium">
                     层级内部分布
                 </span>
             )}
          </div>
          
          {allocationData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={allocationData} 
                    cx="50%" cy="50%" 
                    innerRadius={50} outerRadius={75} 
                    paddingAngle={3} 
                    dataKey="value" 
                    onClick={(data) => {
                        // Click slice to drill down if in top-level strategy mode
                        if (viewMode === 'strategy' && !selectedLayerId && data.isLayer) {
                            setSelectedLayerId(data.id);
                        }
                    }}
                    cursor={viewMode === 'strategy' && !selectedLayerId ? 'pointer' : 'default'}
                    label={({ payload }) => `${payload.percent}%`} 
                    labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                  >
                    {allocationData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">暂无数据</div>
          )}

          <div className="mt-6 border-t border-slate-50 pt-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {viewMode === 'total' ? '按资产类别' : (selectedLayerId ? '层级内资产明细' : '按防御层级 (点击查看详情)')}
            </h4>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2 px-2">
               <span className="flex-1">名称</span>
               <span className="flex-1 text-right">持有市值</span>
               <span className="w-32 text-right">占比 / 目标 (偏离)</span>
            </div>
            <div className="space-y-1">
              {allocationData.map((item: any) => (
                <div 
                    key={item.id || item.name} 
                    onClick={() => {
                        // Click row to drill down
                        if (viewMode === 'strategy' && !selectedLayerId && item.isLayer) {
                            setSelectedLayerId(item.id);
                        }
                    }}
                    className={`flex items-center justify-between text-sm p-2 rounded transition-all border border-transparent ${viewMode === 'strategy' && !selectedLayerId ? 'hover:bg-blue-50 hover:border-blue-100 cursor-pointer group' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                    <span className="text-slate-700 font-medium truncate" title={item.name}>{item.name}</span>
                    {viewMode === 'strategy' && !selectedLayerId && <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400" />}
                  </div>
                  <div className="flex-1 text-right font-mono text-slate-600 px-2">¥{item.value.toLocaleString()}</div>
                  <div className="w-32 text-right">
                     {viewMode === 'strategy' ? (
                       <div className="flex flex-col items-end leading-tight">
                         <div className="flex items-baseline gap-1">
                            <span className="font-bold text-slate-800">{item.percent}%</span>
                            <span className="text-xs text-slate-400">/ {item.targetPercent}%</span>
                         </div>
                         <span className={`text-[10px] font-medium ${Math.abs(item.deviation) > 2 ? (item.deviation > 0 ? 'text-amber-600' : 'text-blue-600') : 'text-slate-300'}`}>{item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%</span>
                       </div>
                     ) : (
                       <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{item.percent}%</span>
                     )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Growth Curve & Breakdown Table */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                   {viewMode === 'strategy' 
                       ? (selectedLayerId ? `${selectedLayerInfo?.name} 增长曲线` : '策略总资产增长曲线') 
                       : '家庭总资产增长曲线'
                   }
                </h3>
                {selectedLayerId && <p className="text-xs text-slate-500">显示该防御层级内资产的历史净值走势</p>}
            </div>
          </div>
          
          {/* Chart Area */}
          {historyData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={viewMode === 'strategy' ? (selectedLayerId ? "#8b5cf6" : "#f43f5e") : "#3b82f6"} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={viewMode === 'strategy' ? (selectedLayerId ? "#8b5cf6" : "#f43f5e") : "#3b82f6"} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{fontSize: 12, fill: '#94a3b8'}} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis tick={{fontSize: 12, fill: '#94a3b8'}} tickLine={false} axisLine={false} tickFormatter={(value) => `¥${value / 1000}k`} />
                  <RechartsTooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                  <Area type="monotone" dataKey="value" name="资产净值" stroke={viewMode === 'strategy' ? (selectedLayerId ? "#8b5cf6" : "#f43f5e") : "#3b82f6"} fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} animationDuration={500} />
                   <Area type="monotone" dataKey="invested" name="投入本金" stroke="#64748b" fillOpacity={1} fill="url(#colorInvested)" strokeWidth={2} strokeDasharray="5 5" animationDuration={500} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">该时间段内暂无数据</div>
          )}

          {/* Detailed Breakdown Table */}
          {breakdownData.length > 0 && (
              <div className="mt-8 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Layers size={14} className="text-slate-400"/>
                          {viewMode === 'total' ? '本期类别变动明细' : (selectedLayerId ? '本期资产变动明细' : '本期层级变动明细')}
                      </h4>
                      <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded">
                         区间: {startSnapshot ? startSnapshot.date : '期初'} → {endSnapshot?.date}
                      </span>
                  </div>
                  
                  <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-xs text-left table-fixed">
                          <thead>
                              <tr className="text-slate-400 border-b border-slate-100">
                                  <th className="pb-2 font-medium pl-1 text-left w-1/4">名称</th>
                                  <th className="pb-2 font-medium text-right w-1/4">期末市值</th>
                                  <th className="pb-2 font-medium text-right w-1/4">净投入</th>
                                  <th className="pb-2 font-medium text-right w-1/4">期间盈亏</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {breakdownData.map(row => {
                                  const roi = row.endCost > 0 ? (row.profit / row.endCost) * 100 : 0;
                                  return (
                                  <tr key={row.id} className="group hover:bg-slate-50 transition-colors">
                                      <td className="py-3 pl-1 truncate">
                                          <div className="flex items-center gap-2">
                                              <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: row.color}}></div>
                                              <span className="font-medium text-slate-700 truncate" title={row.name}>{row.name}</span>
                                          </div>
                                      </td>
                                      <td className="py-3 text-right font-mono text-slate-600 truncate">¥{row.endVal.toLocaleString()}</td>
                                      <td className="py-3 text-right text-slate-400 truncate">
                                          {Math.abs(row.changeInput) > 0 ? (
                                              <span>{row.changeInput > 0 ? '+' : ''}{row.changeInput.toLocaleString()}</span>
                                          ) : '-'}
                                      </td>
                                      <td className="py-3 text-right truncate">
                                           <div className={`font-medium ${row.profit >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                              {row.profit > 0 ? '+' : ''}{row.profit.toLocaleString()}
                                              <span className="text-[10px] ml-1 opacity-80 hidden sm:inline">
                                                 ({row.profit >= 0 ? '+' : ''}{roi.toFixed(1)}%)
                                              </span>
                                           </div>
                                      </td>
                                  </tr>
                              )})}
                          </tbody>
                          <tfoot>
                              <tr className="border-t border-slate-200 bg-slate-50/50 text-xs">
                                  <td className="py-3 pl-1 font-bold text-slate-700">总计</td>
                                  <td className="py-3 text-right font-mono font-bold text-slate-800">¥{breakdownTotals.endVal.toLocaleString()}</td>
                                  <td className="py-3 text-right text-slate-500 font-mono">
                                      {Math.abs(breakdownTotals.changeInput) > 0 ? (
                                          <span>{breakdownTotals.changeInput > 0 ? '+' : ''}{breakdownTotals.changeInput.toLocaleString()}</span>
                                      ) : '-'}
                                  </td>
                                  <td className="py-3 text-right">
                                       {(() => {
                                           const totalRoi = breakdownTotals.endCost > 0 ? (breakdownTotals.profit / breakdownTotals.endCost) * 100 : 0;
                                           return (
                                               <div className={`font-bold ${breakdownTotals.profit >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                  {breakdownTotals.profit > 0 ? '+' : ''}{breakdownTotals.profit.toLocaleString()}
                                                  <span className="text-[10px] ml-1 opacity-80 hidden sm:inline">
                                                     ({breakdownTotals.profit >= 0 ? '+' : ''}{totalRoi.toFixed(1)}%)
                                                  </span>
                                               </div>
                                           );
                                       })()}
                                  </td>
                              </tr>
                          </tfoot>
                      </table>
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;