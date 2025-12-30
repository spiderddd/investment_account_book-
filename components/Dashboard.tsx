import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { TrendingUp, DollarSign, Activity, Wallet, HelpCircle, History } from 'lucide-react';
import { StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';
import { ProjectGuide } from './ProjectGuide';

interface DashboardProps {
  strategies: StrategyVersion[]; 
  snapshots: SnapshotItem[];
}

type ViewMode = 'strategy' | 'total';

const Dashboard: React.FC<DashboardProps> = ({ strategies: versions, snapshots }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('strategy');
  const [showGuide, setShowGuide] = useState(false);

  // --- Derived Data ---
  const latestSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null;
    return [...snapshots].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [snapshots]);

  // Find the strategy version that applies to the latest snapshot
  const appliedStrategy = useMemo(() => {
    if (!latestSnapshot) return null;
    return StorageService.getStrategyForDate(versions, latestSnapshot.date);
  }, [versions, latestSnapshot]);

  // Calculations
  const totalAssetsValue = latestSnapshot ? latestSnapshot.totalValue : 0;
  
  // Strategy Specific Value (Sum of assets that are linked to strategy)
  const strategyAssetsValue = useMemo(() => {
    if (!latestSnapshot) return 0;
    return latestSnapshot.assets
      .filter(a => a.strategyId) // Only assets linked to a strategy target
      .reduce((sum, a) => sum + a.marketValue, 0);
  }, [latestSnapshot]);

  const totalInvested = latestSnapshot ? latestSnapshot.totalInvested : 0;
  
  // Approximate Strategy Invested (harder to track perfectly without full history separation, but we can sum cost basis of current strategy assets)
  const strategyInvested = useMemo(() => {
     if (!latestSnapshot) return 0;
     return latestSnapshot.assets
       .filter(a => a.strategyId)
       .reduce((sum, a) => sum + a.totalCost, 0);
  }, [latestSnapshot]);

  const displayValue = viewMode === 'strategy' ? strategyAssetsValue : totalAssetsValue;
  const displayInvested = viewMode === 'strategy' ? strategyInvested : totalInvested;
  const displayProfit = displayValue - displayInvested;

  // Chart Data: Allocation
  const allocationData = useMemo(() => {
    if (!latestSnapshot) return [];
    
    if (viewMode === 'strategy') {
      // Compare Actual vs Strategy Targets
      if (!appliedStrategy) return [];

      const actualMap = new Map<string, number>();
      latestSnapshot.assets.forEach(a => {
        if (a.strategyId) actualMap.set(a.strategyId, a.marketValue);
      });

      return appliedStrategy.items.map(s => {
        const actualValue = actualMap.get(s.id) || 0;
        const actualPercent = strategyAssetsValue > 0 ? (actualValue / strategyAssetsValue) * 100 : 0;
        
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
      // Total Asset Distribution by Category
      const data = [];
      const grouped = latestSnapshot.assets.reduce((acc, curr) => {
        const cat = curr.category === 'security' ? '股票基金' : 
                    curr.category === 'gold' ? '实物商品' : 
                    curr.category === 'fixed' ? '现金定存' : '其他';
        acc[cat] = (acc[cat] || 0) + curr.marketValue;
        return acc;
      }, {} as Record<string, number>);

      const colors: Record<string, string> = {
        '股票基金': '#3b82f6',
        '实物商品': '#f59e0b',
        '现金定存': '#64748b',
        '其他': '#a855f7'
      };

      return Object.keys(grouped).map(key => ({
        name: key,
        value: grouped[key],
        percent: parseFloat(((grouped[key] / totalAssetsValue) * 100).toFixed(1)),
        color: colors[key] || '#cbd5e1'
      })).sort((a, b) => b.value - a.value);
    }
  }, [appliedStrategy, latestSnapshot, strategyAssetsValue, totalAssetsValue, viewMode]);

  // Chart Data: History
  const historyData = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return sorted.map(s => {
      // For strategy view, we filter assets in that snapshot
      const sVal = viewMode === 'total' 
        ? s.totalValue 
        : s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.marketValue, 0);
        
      const sInv = viewMode === 'total'
        ? s.totalInvested
        : s.assets.filter(a => a.strategyId).reduce((sum, a) => sum + a.totalCost, 0);

      return {
        date: s.date,
        value: sVal,
        invested: sInv
      };
    });
  }, [snapshots, viewMode]);

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
      <button 
        onClick={() => setShowGuide(true)}
        className="absolute -top-2 right-0 md:top-0 text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1 text-sm"
      >
        <HelpCircle size={18} />
        <span className="hidden md:inline">使用指南</span>
      </button>

      {/* View Switcher */}
      <div className="flex justify-center mb-6">
        <div className="bg-slate-200 p-1 rounded-xl inline-flex">
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
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">
              {viewMode === 'strategy' ? '策略持仓市值' : '总资产净值'}
            </span>
            <DollarSign className="text-emerald-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ¥{displayValue.toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">总投入本金</span>
            <Activity className="text-blue-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ¥{displayInvested.toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">累计盈亏</span>
            <TrendingUp className={displayProfit >= 0 ? "text-emerald-500" : "text-rose-500"} size={20} />
          </div>
          <div className={`text-2xl font-bold ${displayProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {displayProfit >= 0 ? '+' : ''}
            {displayProfit.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
             收益率: {displayInvested > 0 ? ((displayProfit / displayInvested) * 100).toFixed(2) : 0}%
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Allocation Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-6">
            {viewMode === 'strategy' ? '策略目标偏离度' : '大类资产分布'}
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
              明细数据
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
          <h3 className="text-lg font-bold text-slate-800 mb-6">
             {viewMode === 'strategy' ? '策略资产增长曲线' : '家庭总资产增长曲线'}
          </h3>
          {historyData.length > 0 ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={viewMode === 'strategy' ? "#10b981" : "#3b82f6"} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={viewMode === 'strategy' ? "#10b981" : "#3b82f6"} stopOpacity={0}/>
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
                    stroke={viewMode === 'strategy' ? "#10b981" : "#3b82f6"} 
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                    strokeWidth={2}
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
                  />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">
              暂无历史数据
            </div>
          )}
        </div>
      </div>

      {showGuide && <ProjectGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
};

export default Dashboard;