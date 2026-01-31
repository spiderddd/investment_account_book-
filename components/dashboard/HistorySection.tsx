
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Layers, Loader2 } from 'lucide-react';
import { SnapshotItem, StrategyLayer } from '../../types';

interface HistorySectionProps {
    loading: boolean;
    viewMode: 'strategy' | 'total';
    selectedLayerId: string | null;
    selectedLayerInfo?: StrategyLayer;
    historyData: any[];
    breakdownData: any[];
    breakdownTotals: any;
    rangeConfig: { label: string };
    startSnapshot: SnapshotItem | null;
    endSnapshot: SnapshotItem | null;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
    loading, viewMode, selectedLayerId, selectedLayerInfo, historyData, 
    breakdownData, breakdownTotals, rangeConfig, startSnapshot, endSnapshot
}) => {
    return (
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
                                    <stop offset="5%" stopColor={viewMode === 'strategy' ? (selectedLayerId ? "#8b5cf6" : "#f43f5e") : "#3b82f6"} stopOpacity={0.1} />
                                    <stop offset="95%" stopColor={viewMode === 'strategy' ? (selectedLayerId ? "#8b5cf6" : "#f43f5e") : "#3b82f6"} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#64748b" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={30} />
                            <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(value) => `¥${value / 1000}k`} />
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
            <div className="mt-8 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Layers size={14} className="text-slate-400" />
                        {viewMode === 'total' ? '本期类别变动明细' : (selectedLayerId ? '本期资产变动明细' : '本期层级变动明细')}
                    </h4>
                    <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded">
                        区间: {startSnapshot ? startSnapshot.date : '期初'} → {endSnapshot?.date || '...'}
                    </span>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 mb-4 py-4 justify-center">
                        <Loader2 className="animate-spin text-slate-400" size={16} />
                        <span className="text-sm text-slate-500">正在计算区间变动明细...</span>
                    </div>
                ) : breakdownData.length > 0 ? (
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
                                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }}></div>
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
                                    )
                                })}
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
                ) : (
                    <div className="text-xs text-slate-400 italic text-center py-4">无变动数据</div>
                )}
            </div>
        </div>
    );
};
