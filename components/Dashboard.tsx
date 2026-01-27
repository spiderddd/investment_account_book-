import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { TrendingUp, DollarSign, Activity, Wallet, History, Calendar, Filter, ArrowRight, Layers, LayoutGrid } from 'lucide-react';
import { StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';

interface DashboardProps {
  strategies: StrategyVersion[]; 
  snapshots: SnapshotItem[];
}

type ViewMode = 'strategy' | 'total';
type AllocationView = 'asset' | 'layer'; 
type TimeRange = 'all' | 'ytd' | '1y';

const Dashboard: React.FC<DashboardProps> = ({ strategies: versions, snapshots }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('strategy');
  const [allocationView, setAllocationView] = useState<AllocationView>('asset');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

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

  // --- Chart Data ---
  const allocationData = useMemo(() => {
    if (!endSnapshot) return [];
    
    if (viewMode === 'strategy') {
      if (!appliedStrategy) return [];
      const stratTotal = endMetrics.value; 

      const actualMap = new Map<string, number>();
      endSnapshot.assets.forEach(a => {
        if (a.strategyId) actualMap.set(a.strategyId, a.marketValue);
      });

      if (allocationView === 'asset') {
          // Flatten all targets from all layers
          const allTargets = appliedStrategy.layers.flatMap(l => 
            l.items.map(t => ({
                ...t, 
                // Global Target % = LayerWeight * InnerWeight / 100
                globalWeight: (l.weight * t.weight) / 100 
            }))
          );

          return allTargets.map(s => {
            const actualValue = actualMap.get(s.id) || 0;
            const actualPercent = stratTotal > 0 ? (actualValue / stratTotal) * 100 : 0;
            
            return {
              name: s.targetName,
              value: actualValue,
              percent: parseFloat(actualPercent.toFixed(1)),
              targetPercent: parseFloat(s.globalWeight.toFixed(1)),
              color: s.color,
              deviation: actualPercent - s.globalWeight
            };
          }).sort((a, b) => b.value - a.value);

      } else {
          // View 2: By Layer
          return appliedStrategy.layers.map((layer, idx) => {
              const layerActualValue = layer.items.reduce((sum, item) => sum + (actualMap.get(item.id) || 0), 0);
              const actualPercent = stratTotal > 0 ? (layerActualValue / stratTotal) * 100 : 0;
              
              // Seed colors for layers
              const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

              return {
                  name: layer.name,
                  value: layerActualValue,
                  percent: parseFloat(actualPercent.toFixed(1)),
                  targetPercent: layer.weight,
                  color: colors[idx % colors.length],
                  deviation: actualPercent - layer.weight
              };
          }).sort((a, b) => b.targetPercent - a.targetPercent);
      }

    } else {
      // Total Asset View (Group by Asset Category)
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

      const colors: Record<string, string> = {
        '股票基金': '#3b82f6', '商品另类': '#f59e0b', '现金固收': '#64748b', '其他': '#a855f7'
      };

      return Object.keys(grouped).map(key => ({
        name: key,
        value: grouped[key],
        percent: parseFloat(((grouped[key] / endMetrics.value) * 100).toFixed(1)),
        color: colors[key] || '#cbd5e1'
      })).sort((a, b) => b.value - a.value);
    }
  }, [appliedStrategy, endSnapshot, endMetrics, viewMode, allocationView]);

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
          <button onClick={() => setViewMode('strategy')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${viewMode === 'strategy' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp size={16} />策略资产</button>
          <button onClick={() => setViewMode('total')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${viewMode === 'total' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Wallet size={16} />全部净值</button>
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
        {/* Allocation */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center justify-between mb-6">
             <h3 className="text-lg font-bold text-slate-800">{viewMode === 'strategy' ? '期末策略偏离度' : '期末资产分布'}</h3>
             {viewMode === 'strategy' && (
                 <div className="flex bg-slate-100 p-0.5 rounded-lg">
                     <button onClick={() => setAllocationView('asset')} className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${allocationView === 'asset' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><LayoutGrid size={12} /> 具体标的</button>
                     <button onClick={() => setAllocationView('layer')} className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${allocationView === 'layer' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={12} /> 策略层级</button>
                 </div>
             )}
          </div>
          {allocationData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" label={({ payload }) => `${payload.percent}%`} labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
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
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">明细数据 ({allocationView === 'layer' ? '按防御层级' : '按具体标的'})</h4>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2 px-2">
               <span className="flex-1">{allocationView === 'layer' ? '层级名称' : '资产名称'}</span>
               <span className="flex-1 text-right">持有市值</span>
               <span className="w-32 text-right">占比 / 目标 (偏离)</span>
            </div>
            <div className="space-y-1">
              {allocationData.map((item: any) => (
                <div key={item.name} className="flex items-center justify-between text-sm p-2 rounded hover:bg-slate-50 transition-colors">
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                    <span className="text-slate-700 font-medium truncate" title={item.name}>{item.name}</span>
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

        {/* Growth Curve */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">{viewMode === 'strategy' ? '策略资产增长曲线' : '家庭总资产增长曲线'}</h3>
          </div>
          {historyData.length > 0 ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={viewMode === 'strategy' ? "#f43f5e" : "#3b82f6"} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={viewMode === 'strategy' ? "#f43f5e" : "#3b82f6"} stopOpacity={0}/>
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
                  <Area type="monotone" dataKey="value" name="资产净值" stroke={viewMode === 'strategy' ? "#f43f5e" : "#3b82f6"} fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} animationDuration={500} />
                   <Area type="monotone" dataKey="invested" name="投入本金" stroke="#64748b" fillOpacity={1} fill="url(#colorInvested)" strokeWidth={2} strokeDasharray="5 5" animationDuration={500} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">该时间段内暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;