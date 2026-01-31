
import React from 'react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Loader2, Search, ChevronRight } from 'lucide-react';
import { StrategyLayer } from '../../types';

interface AllocationSectionProps {
    loading: boolean;
    viewMode: 'strategy' | 'total';
    selectedLayerId: string | null;
    setSelectedLayerId: (id: string | null) => void;
    allocationData: any[];
    selectedLayerInfo?: StrategyLayer;
}

export const AllocationSection: React.FC<AllocationSectionProps> = ({
    loading, viewMode, selectedLayerId, setSelectedLayerId, allocationData, selectedLayerInfo
}) => {
    return (
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

            {/* Chart Area */}
            {loading ? (
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
                <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg">
                    <div className="text-center">
                        <Search size={32} className="mx-auto mb-2 opacity-50" />
                        <span>暂无分布数据</span>
                    </div>
                </div>
            )}

            {/* List Area */}
            <div className="mt-6 border-t border-slate-50 pt-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    {viewMode === 'total' ? '按资产类别' : (selectedLayerId ? '层级内资产明细' : '按防御层级 (点击查看详情)')}
                </h4>

                {loading ? (
                    <div className="space-y-2">
                        <div className="h-8 bg-slate-100 rounded animate-pulse"></div>
                        <div className="h-8 bg-slate-100 rounded animate-pulse"></div>
                        <div className="h-8 bg-slate-100 rounded animate-pulse"></div>
                    </div>
                ) : allocationData.length > 0 ? (
                    <>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2 px-2">
                            <span className="flex-1">名称</span>
                            <span className="flex-1 text-right">持有市值</span>
                            <span className="w-32 text-right">占比 / 目标 (偏离)</span>
                        </div>
                        <div className="space-y-1">
                            {allocationData.map((item: any) => {
                                // Safety check for stale data during transition
                                const deviation = item.deviation || 0;
                                const targetPercent = item.targetPercent ?? '-';
                                
                                return (
                                <div
                                    key={item.id || item.name}
                                    onClick={() => {
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
                                                    <span className="text-xs text-slate-400">/ {targetPercent}%</span>
                                                </div>
                                                <span className={`text-[10px] font-medium ${Math.abs(deviation) > 2 ? (deviation > 0 ? 'text-amber-600' : 'text-blue-600') : 'text-slate-300'}`}>
                                                    {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{item.percent}%</span>
                                        )}
                                    </div>
                                </div>
                            )})}
                        </div>
                    </>
                ) : (
                    <div className="text-xs text-slate-400 italic text-center py-4">无数据条目</div>
                )}
            </div>
        </div>
    );
};
