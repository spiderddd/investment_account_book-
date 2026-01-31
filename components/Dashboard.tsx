
import React from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { TrendingUp, DollarSign, Activity, Wallet, History, Calendar, Filter, ArrowRight, ChevronRight, ArrowLeft, Layers, Loader2 } from 'lucide-react';
import { StrategyVersion, SnapshotItem } from '../types';
import { useDashboardData } from '../hooks/useDashboardData';

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

  const displayValue = endMetrics.value;
  const displayInvested = endMetrics.invested; 
  const periodProfit = timeRange === 'all' 
    ? (endMetrics.value - endMetrics.invested)
    : (endMetrics.value - endMetrics.invested) - (startMetrics.value - startMetrics.invested);
  const returnRate = displayInvested > 0 ? (periodProfit / displayInvested) * 100 : 0;

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">{viewMode === 'strategy' ? '期末策略市值' : '期末总资产'}</span>
            <DollarSign className="text-rose-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
              {loadingDetails ? <span className="text-slate-300 animate-pulse">...</span> : `¥${displayValue.toLocaleString()}`}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">期末总本金</span>
            <Activity className="text-blue-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
              {loadingDetails ? <span className="text-slate-300 animate-pulse">...</span> : `¥${displayInvested.toLocaleString()}`}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
          {timeRange !== 'all' && <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-bl-lg">区间收益</div>}
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">{timeRange === 'all' ? '历史累计盈亏' : `${rangeConfig.label}盈亏`}</span>
            <TrendingUp className={periodProfit >= 0 ? "text-rose-500" : "text-emerald-500"} size={20} />
          </div>
          {loadingDetails ? (
              <div className="text-2xl font-bold text-slate-300 animate-pulse">...</div>
          ) : (
             <>
                <div className={`text-2xl font-bold ${periodProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{periodProfit >= 0 ? '+' : ''}{periodProfit.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>{timeRange === 'all' ? '累计回报率' : '区间回报率'}:</span>
                    <span className={`font-mono ${periodProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{periodProfit >= 0 ? '+' : ''}{returnRate.toFixed(2)}%</span>
                </div>
             </>
          )}
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
          
          {loadingDetails ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg animate-pulse">
                <Loader2 className="animate-spin mb-2" />
                <span className="text-xs">加载明细中...</span>
            </div>
          ) : allocationData.length > 0 ? (
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
                    {allocationData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />)}
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
            {loadingDetails ? (
                <div className="space-y-2">
                    <div className="h-8 bg-slate-100 rounded animate-pulse"></div>
                    <div className="h-8 bg-slate-100 rounded animate-pulse"></div>
                    <div className="h-8 bg-slate-100 rounded animate-pulse"></div>
                </div>
            ) : (
                <>
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
                </>
            )}
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
          {loadingDetails ? (
              <div className="mt-8 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-4">
                      <Loader2 className="animate-spin text-slate-400" size={16} />
                      <span className="text-sm text-slate-500">正在计算区间变动明细...</span>
                  </div>
              </div>
          ) : breakdownData.length > 0 && (
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
                              {breakdownData.map((row: any) => {
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
