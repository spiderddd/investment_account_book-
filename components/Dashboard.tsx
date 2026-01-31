
import React from 'react';
import { History, TrendingUp, Wallet, Calendar, Filter, ArrowRight } from 'lucide-react';
import { StrategyVersion, SnapshotItem } from '../types';
import { useDashboardData } from '../hooks/useDashboardData';
import { MetricsCards } from './dashboard/MetricsCards';
import { AllocationSection } from './dashboard/AllocationSection';
import { HistorySection } from './dashboard/HistorySection';

interface DashboardProps {
  strategies: StrategyVersion[]; 
  snapshots: SnapshotItem[];
}

const Dashboard: React.FC<DashboardProps> = ({ strategies: versions, snapshots }) => {
  const {
    viewMode, setViewMode,
    timeRange, setTimeRange,
    selectedLayerId, setSelectedLayerId,
    rangeConfig,
    startSnapshot, endSnapshot,
    loadingDetails,
    endMetrics, startMetrics,
    activeStrategyEnd,
    allocationData,
    historyData,
    breakdownData,
    breakdownTotals
  } = useDashboardData(versions, snapshots);

  const selectedLayerInfo = activeStrategyEnd?.layers.find(l => l.id === selectedLayerId);

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
           {(['all', 'ytd', '1y'] as const).map((range) => (
             <button key={range} onClick={() => setTimeRange(range)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${timeRange === range ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {range === 'all' ? '全部' : range === 'ytd' ? '今年' : '近一年'}
             </button>
           ))}
        </div>
      </div>
      
      {/* Analysis Banner */}
      {timeRange !== 'all' && (
        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
           <Filter size={12} className="text-blue-500" />
           <span className="font-semibold text-blue-700">{rangeConfig.label}区间分析:</span>
           <div className="flex items-center gap-1">
             <span className="bg-white px-1.5 py-0.5 rounded border border-blue-100">{startSnapshot ? startSnapshot.date : '期初'}</span>
             <ArrowRight size={12} className="text-blue-300" />
             <span className="bg-white px-1.5 py-0.5 rounded border border-blue-100">{endSnapshot?.date || '...'}</span>
           </div>
           <span className="text-slate-400 ml-auto hidden sm:inline">基于区间变动计算盈亏</span>
        </div>
      )}

      {/* Metrics Cards */}
      <MetricsCards 
          viewMode={viewMode}
          timeRange={timeRange}
          rangeConfig={rangeConfig}
          loading={loadingDetails}
          endMetrics={endMetrics}
          startMetrics={startMetrics}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Allocation Pie Chart & Details List */}
        <AllocationSection 
            loading={loadingDetails}
            viewMode={viewMode}
            selectedLayerId={selectedLayerId}
            setSelectedLayerId={setSelectedLayerId}
            allocationData={allocationData}
            selectedLayerInfo={selectedLayerInfo}
        />

        {/* RIGHT: History Area Chart & Breakdown Table */}
        <HistorySection 
            loading={loadingDetails}
            viewMode={viewMode}
            selectedLayerId={selectedLayerId}
            selectedLayerInfo={selectedLayerInfo}
            historyData={historyData}
            breakdownData={breakdownData}
            breakdownTotals={breakdownTotals}
            rangeConfig={rangeConfig}
            startSnapshot={startSnapshot}
            endSnapshot={endSnapshot}
        />
      </div>
    </div>
  );
};

export default Dashboard;
