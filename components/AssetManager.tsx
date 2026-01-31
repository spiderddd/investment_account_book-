
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Trash2, Edit2, History, BarChart2, Eye, EyeOff, Layers, LayoutGrid, AlertCircle, X, Save, TrendingUp, Loader2, Clock, ChevronDown
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend 
} from 'recharts';
import { Asset, AssetCategory, SnapshotItem, StrategyVersion } from '../types';
import { StorageService } from '../services/storageService';
import { useAssetGrouping } from '../hooks/useAssetGrouping';

interface AssetManagerProps {
  assets: Asset[];
  snapshots: SnapshotItem[];
  strategies: StrategyVersion[]; 
  onUpdate: () => void; 
  onCreate: (asset: Partial<Asset>) => Promise<void>;
  onEdit: (id: string, asset: Partial<Asset>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

interface AssetHistoryRecord {
  date: string;
  unitPrice: number;
  quantity: number;
  marketValue: number;
  totalCost: number;
  profit: number;
  roi: number;
  addedQuantity: number;
  addedPrincipal: number;
}

export const AssetManager: React.FC<AssetManagerProps> = ({ assets, snapshots, strategies, onUpdate, onCreate, onEdit, onDelete }) => {
  const {
      searchTerm, setSearchTerm,
      showHeldOnly, setShowHeldOnly,
      groupBy, setGroupBy,
      selectedDate, setSelectedDate,
      availableDates,
      activeStrategy,
      assetPerformanceMap,
      displaySections,
      CATEGORIES
  } = useAssetGrouping(assets, snapshots, strategies);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AssetCategory>('security');
  const [formTicker, setFormTicker] = useState('');
  const [formNote, setFormNote] = useState('');

  // History View Modal State
  const [viewHistoryId, setViewHistoryId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<AssetHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // --- Async Data Fetching for History ---
  useEffect(() => {
    if (viewHistoryId) {
        setLoadingHistory(true);
        StorageService.getAssetHistory(viewHistoryId)
            .then(data => {
                const aggMap = new Map<string, AssetHistoryRecord>();
                
                data.forEach((row: any) => {
                    const existing = aggMap.get(row.date);
                    if (existing) {
                        existing.quantity += row.quantity;
                        existing.marketValue += row.marketValue;
                        existing.totalCost += row.totalCost;
                        existing.addedQuantity += row.addedQuantity;
                        existing.addedPrincipal += row.addedPrincipal;
                        existing.profit = existing.marketValue - existing.totalCost;
                        existing.roi = existing.totalCost > 0 ? (existing.profit / existing.totalCost * 100) : 0;
                        existing.unitPrice = existing.quantity > 0 ? existing.marketValue / existing.quantity : row.unitPrice;
                    } else {
                        aggMap.set(row.date, {
                            date: row.date,
                            unitPrice: row.unitPrice,
                            quantity: row.quantity,
                            marketValue: row.marketValue,
                            totalCost: row.totalCost,
                            profit: row.marketValue - row.totalCost,
                            roi: row.totalCost > 0 ? ((row.marketValue - row.totalCost) / row.totalCost * 100) : 0,
                            addedQuantity: row.addedQuantity,
                            addedPrincipal: row.addedPrincipal
                        });
                    }
                });
                
                const sortedHistory = Array.from(aggMap.values()).sort((a, b) => a.date.localeCompare(b.date));
                setHistoryData(sortedHistory);
            })
            .catch(err => {
                console.error("Failed to load history", err);
                setHistoryData([]);
            })
            .finally(() => setLoadingHistory(false));
    } else {
        setHistoryData([]);
    }
  }, [viewHistoryId]);

  // --- Handlers ---
  const openEditModal = (asset?: Asset) => {
    if (asset) {
      setEditingId(asset.id);
      setFormName(asset.name);
      setFormType(asset.type);
      setFormTicker(asset.ticker || '');
      setFormNote(asset.note || '');
    } else {
      setEditingId(null);
      setFormName('');
      setFormType('security');
      setFormTicker('');
      setFormNote('');
    }
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload = { name: formName, type: formType, ticker: formTicker, note: formNote };
    if (editingId) await onEdit(editingId, payload);
    else await onCreate(payload);
    
    setIsEditModalOpen(false);
    onUpdate();
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`确定要删除资产 "${name}" 吗？`)) {
      await onDelete(id);
      onUpdate();
    }
  };

  const getCategoryMeta = (type: AssetCategory) => {
    return CATEGORIES.find(c => c.value === type) || CATEGORIES[CATEGORIES.length - 1];
  };

  // --- Renderers ---

  const renderAssetCard = (asset: Asset) => {
    const meta = getCategoryMeta(asset.type);
    const Icon = meta.icon;
    const status = assetPerformanceMap.get(asset.id);
    const isHeld = !!status && !status.isHistorical; 
    
    const marketValue = status ? status.marketValue : 0;
    const totalCost = status ? status.totalCost : 0;
    const profit = marketValue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const isProfitable = profit >= 0;

    const trendColor = isProfitable ? 'text-rose-600' : 'text-emerald-600';
    const trendBg = isProfitable ? 'bg-rose-50' : 'bg-emerald-50';
    const trendSign = isProfitable ? '+' : '';

    return (
      <div 
        key={asset.id} 
        className={`bg-white rounded-xl border transition-all duration-200 group relative flex flex-col justify-between
          ${isHeld 
            ? 'border-slate-200 shadow-sm hover:shadow-md' 
            : 'border-slate-100 bg-slate-50 opacity-60 hover:opacity-100 hover:shadow-sm'
          }`}
        onClick={() => setViewHistoryId(asset.id)}
      >
        <div className="p-5 flex-1 cursor-pointer">
            {/* Header: Identity */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl shrink-0 ${isHeld ? meta.color : 'bg-slate-200 text-slate-400 grayscale'}`}>
                        <Icon size={22} />
                    </div>
                    <div className="overflow-hidden">
                        <h3 className={`font-bold text-base leading-tight truncate ${isHeld ? 'text-slate-800' : 'text-slate-600'}`} title={asset.name}>
                            {asset.name}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                            {asset.ticker && <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{asset.ticker}</span>}
                            <span>{meta.label}</span>
                        </div>
                    </div>
                </div>
                
                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity -mr-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setViewHistoryId(asset.id)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors" title="历史">
                        <History size={16} />
                    </button>
                    <button onClick={() => openEditModal(asset)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors" title="编辑">
                        <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(asset.id, asset.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded transition-colors" title="删除">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div>
                 <div className="text-[11px] font-medium text-slate-400 mb-0.5 uppercase tracking-wider flex items-center gap-2">
                    {isHeld 
                        ? '当前市值' 
                        : (status ? `清仓市值 (${status.date})` : '暂无持仓')
                    }
                    {!isHeld && !status && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px]">New</span>}
                 </div>
                 
                 <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div className={`text-2xl font-bold font-mono tracking-tight ${isHeld ? 'text-slate-900' : 'text-slate-500'}`}>
                        ¥{marketValue.toLocaleString()}
                    </div>
                    
                    {/* Profitability Indicators */}
                    {status && status.totalCost > 0 && (
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-sm font-bold ${trendBg} ${trendColor}`}>
                            <span>{trendSign}{Math.abs(profit).toLocaleString()}</span>
                            <span className="opacity-80 text-xs">| {trendSign}{roi.toFixed(2)}%</span>
                        </div>
                    )}
                 </div>
            </div>
        </div>
        
        {/* Footer for Held Assets */}
        {isHeld && status && (
             <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/30 rounded-b-xl flex justify-between items-center text-xs text-slate-500">
                <div>持有: <span className="font-medium text-slate-700">{status.quantity.toLocaleString()}</span></div>
                <div>成本: <span className="font-medium text-slate-700">¥{status.totalCost.toLocaleString()}</span></div>
             </div>
        )}
      </div>
    );
  };

  return (
    <div className="pb-10">
      {/* Header Area */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">资产库看板</h2>
          <p className="text-slate-500 text-sm">全量资产管理与分析。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            {/* Group By Toggle */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <button 
                    onClick={() => setGroupBy('category')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        groupBy === 'category' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <LayoutGrid size={16} />
                    <span className="hidden sm:inline">按类别</span>
                </button>
                <button 
                    onClick={() => setGroupBy('layer')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        groupBy === 'layer' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Layers size={16} />
                    <span className="hidden sm:inline">按层级</span>
                </button>
            </div>

             {/* Filter Toggle */}
             <button 
                onClick={() => setShowHeldOnly(!showHeldOnly)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border shadow-sm ${
                    showHeldOnly 
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                title={showHeldOnly ? "点击显示所有资产" : "点击仅显示当前持仓"}
            >
                {showHeldOnly ? <Eye size={16} /> : <EyeOff size={16} />}
                <span className="hidden sm:inline">{showHeldOnly ? '仅看持仓' : '查看全部'}</span>
            </button>

            <div className="relative">
                <select 
                    className="appearance-none bg-white border border-slate-200 pl-9 pr-8 py-2 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                >
                    <option value="latest">显示最新持仓</option>
                    {availableDates.map(date => (
                        <option key={date} value={date}>回溯: {date}</option>
                    ))}
                </select>
                <Clock size={16} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <ChevronDown size={16} className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" />
            </div>

            <button 
                onClick={() => openEditModal()}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-sm"
            >
                <Plus size={18} />
                <span className="hidden sm:inline">新增资产</span>
            </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-md mb-6">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索资产名称 / 代码..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
      </div>
      
      {/* Sub-header for Strategy Mode */}
      {groupBy === 'layer' && activeStrategy && (
           <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-center gap-3 text-sm text-indigo-800">
               <Layers size={18} />
               <span>当前分组依据策略：<strong>{activeStrategy.name}</strong></span>
           </div>
      )}

      {/* Vertical Stack Layout */}
      <div className="space-y-6">
        {displaySections.map((section: any) => (
            <div key={section.id} className="bg-slate-50/50 rounded-xl border border-slate-100 p-4">
                {/* Section Header */}
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200/60">
                        <div className={`p-1.5 rounded-lg ${section.color}`}>
                            <section.icon size={16} />
                        </div>
                        <h3 className="font-bold text-slate-700">{section.label}</h3>
                        <span className="bg-white text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-200 shadow-sm ml-auto">
                        {section.items.length}
                        </span>
                </div>

                {/* Responsive Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {section.items.map((asset: Asset) => renderAssetCard(asset))}
                </div>
            </div>
        ))}
        
        {/* Empty State if all filtered out */}
        {assets.length > 0 && displaySections.length === 0 && (
            <div className="text-center py-20 text-slate-400">
                <Search size={48} className="mx-auto mb-4 opacity-20" />
                <p>
                    {showHeldOnly ? '当前视图下无持仓资产' : '未找到匹配的资产'}
                </p>
                {showHeldOnly && (
                    <button 
                        onClick={() => setShowHeldOnly(false)}
                        className="mt-2 text-blue-600 hover:underline text-sm"
                    >
                        切换到“查看全部”
                    </button>
                )}
            </div>
        )}

        {assets.length === 0 && (
             <div className="text-center py-20 text-slate-400">
                <Plus size={48} className="mx-auto mb-4 opacity-20" />
                <p>资产库为空，请点击右上角添加。</p>
            </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95">
             <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
               <h3 className="font-bold text-slate-800">{editingId ? '编辑资产' : '定义新资产'}</h3>
               <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                 <X size={20} />
               </button>
             </div>
             
             <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg flex gap-3 text-sm text-blue-800">
                  <AlertCircle className="shrink-0" size={18} />
                  <p>在此定义的资产，可在“策略”和“记账”功能中直接被引用。</p>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">资产类型</label>
                   <div className="grid grid-cols-2 gap-2">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.value} type="button" onClick={() => setFormType(cat.value)}
                          className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-2 transition-colors ${formType === cat.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          <cat.icon size={14} />{cat.label}
                        </button>
                      ))}
                   </div>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">资产名称 (必填)</label>
                   <input className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formName} onChange={e => setFormName(e.target.value)} required />
                </div>
                
                {['security', 'fund', 'wealth'].includes(formType) && (
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">资产代码 (Ticker)</label>
                        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" value={formTicker} onChange={e => setFormTicker(e.target.value)} placeholder="如: 00700.HK" />
                    </div>
                )}
                
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">备注 (选填)</label>
                   <textarea className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none h-20" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="资产备注信息..." />
                </div>
                
                <div className="pt-4 flex gap-3">
                   <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50">取消</button>
                   <button type="submit" className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2"><Save size={18} /> 保存</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* History Detail Modal */}
      {viewHistoryId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-4">
                        <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                            {(() => {
                                const asset = assets.find(a => a.id === viewHistoryId);
                                const MetaIcon = asset ? getCategoryMeta(asset.type).icon : TrendingUp;
                                return <MetaIcon className="text-slate-700" size={24} />;
                            })()}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">
                                {assets.find(a => a.id === viewHistoryId)?.name}
                            </h2>
                            <p className="text-xs text-slate-500">历史持仓走势分析</p>
                        </div>
                    </div>
                    <button onClick={() => setViewHistoryId(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loadingHistory ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                            <Loader2 size={32} className="animate-spin mb-2" />
                            <p>正在加载历史数据...</p>
                        </div>
                    ) : (
                        <>
                        {/* Summary Cards */}
                        {historyData.length > 0 ? (
                            <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="text-xs text-slate-500 mb-1">当前市值</div>
                                    <div className="text-xl font-bold text-slate-800">
                                        ¥{historyData[historyData.length - 1]!.marketValue.toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="text-xs text-slate-500 mb-1">累计盈亏</div>
                                    {(() => {
                                        const last = historyData[historyData.length - 1]!;
                                        const p = last.marketValue - last.totalCost;
                                        return (
                                            <div className={`text-xl font-bold ${p >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {p >= 0 ? '+' : ''}{p.toLocaleString()}
                                            </div>
                                        )
                                    })()}
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="text-xs text-slate-500 mb-1">持有数量</div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {historyData[historyData.length - 1]!.quantity.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Charts Area */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Market Value vs Cost Chart */}
                                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        <TrendingUp size={16} /> 市值 vs 成本
                                    </h4>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={historyData}>
                                                <defs>
                                                    <linearGradient id="colorMv" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="date" tick={{fontSize:10}} tickLine={false} axisLine={false} />
                                                <YAxis tick={{fontSize:10}} tickLine={false} axisLine={false} tickFormatter={val => `${val/1000}k`} />
                                                <RechartsTooltip />
                                                <Area type="monotone" dataKey="marketValue" name="市值" stroke="#f43f5e" fillOpacity={1} fill="url(#colorMv)" />
                                                <Area type="monotone" dataKey="totalCost" name="成本" stroke="#94a3b8" strokeDasharray="5 5" fill="none" />
                                                <Legend />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Price History Chart */}
                                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        <BarChart2 size={16} /> 单价走势
                                    </h4>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={historyData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="date" tick={{fontSize:10}} tickLine={false} axisLine={false} />
                                                <YAxis tick={{fontSize:10}} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                                <RechartsTooltip />
                                                <Line type="stepAfter" dataKey="unitPrice" name="单价" stroke="#3b82f6" strokeWidth={2} dot={{r:3}} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* History Table */}
                            <div>
                                <h4 className="font-bold text-slate-700 mb-4">历史明细表</h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                                            <tr>
                                                <th className="px-4 py-3">日期</th>
                                                <th className="px-4 py-3 text-right">变动(份额)</th>
                                                <th className="px-4 py-3 text-right">流水(本金)</th>
                                                <th className="px-4 py-3 text-right">单价</th>
                                                <th className="px-4 py-3 text-right">持仓量</th>
                                                <th className="px-4 py-3 text-right">总成本</th>
                                                <th className="px-4 py-3 text-right">市值</th>
                                                <th className="px-4 py-3 text-right">盈亏</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {[...historyData].reverse().map((row) => (
                                                <tr key={row.date} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 font-medium text-slate-700">{row.date}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        {row.addedQuantity !== 0 ? (
                                                            <span className={row.addedQuantity > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                                                {row.addedQuantity > 0 ? '+' : ''}{row.addedQuantity.toLocaleString()}
                                                            </span>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {row.addedPrincipal !== 0 ? (
                                                            <span className={row.addedPrincipal > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                                                {row.addedPrincipal > 0 ? '+' : ''}{row.addedPrincipal.toLocaleString()}
                                                            </span>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">{row.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                                    <td className="px-4 py-3 text-right">{row.quantity.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right text-slate-500">¥{row.totalCost.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-800">¥{row.marketValue.toLocaleString()}</td>
                                                    <td className={`px-4 py-3 text-right font-medium ${row.profit >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {row.profit >= 0 ? '+' : ''}{row.profit.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            </>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                                <History size={48} className="mb-4 opacity-20" />
                                <p>该资产暂无历史快照记录。</p>
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
