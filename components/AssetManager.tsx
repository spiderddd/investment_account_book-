import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Trash2, Edit2, Coins, Briefcase, Landmark, TrendingUp, Wallet, X, Save, AlertCircle, ChevronDown, ChevronRight, Clock, History, BarChart2 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend 
} from 'recharts';
import { Asset, AssetCategory, SnapshotItem } from '../types';

interface AssetManagerProps {
  assets: Asset[];
  snapshots: SnapshotItem[];
  onUpdate: () => void; // Trigger reload in parent
  onCreate: (asset: Partial<Asset>) => Promise<void>;
  onEdit: (id: string, asset: Partial<Asset>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const CATEGORIES: { value: AssetCategory; label: string; icon: any; color: string }[] = [
  { value: 'security', label: '股票/证券', icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
  { value: 'fund', label: '基金/ETF', icon: Briefcase, color: 'text-indigo-600 bg-indigo-50' },
  { value: 'wealth', label: '银行理财', icon: Landmark, color: 'text-cyan-600 bg-cyan-50' },
  { value: 'gold', label: '黄金/商品', icon: Coins, color: 'text-amber-600 bg-amber-50' },
  { value: 'fixed', label: '现金/存款', icon: Wallet, color: 'text-slate-600 bg-slate-50' },
  { value: 'crypto', label: '加密货币', icon: Briefcase, color: 'text-purple-600 bg-purple-50' }, 
  { value: 'other', label: '其他资产', icon: Briefcase, color: 'text-pink-600 bg-pink-50' },
];

interface AssetPerformance {
  quantity: number;
  marketValue: number;
  totalCost: number;
  unitPrice: number;
  date: string; // The date of this record
  isHistorical: boolean; // True if this is from a past snapshot
}

export const AssetManager: React.FC<AssetManagerProps> = ({ assets, snapshots, onUpdate, onCreate, onEdit, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<AssetCategory | 'all'>('all');
  
  // Date Selection State
  const [selectedDate, setSelectedDate] = useState<string>('latest');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AssetCategory>('security');
  const [formTicker, setFormTicker] = useState('');

  // History View Modal State
  const [viewHistoryId, setViewHistoryId] = useState<string | null>(null);

  // UI State
  const [isClearedOpen, setIsClearedOpen] = useState(false);

  // Available Dates for Dropdown
  const availableDates = useMemo(() => {
    return snapshots
      .map(s => s.date)
      .sort((a, b) => b.localeCompare(a)); // Descending
  }, [snapshots]);

  // --- Data Logic: Performance Map (Snapshots -> Current Status) ---
  const viewSnapshot = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;
    if (selectedDate === 'latest') {
        return [...snapshots].sort((a, b) => b.date.localeCompare(a.date))[0];
    }
    return snapshots.find(s => s.date === selectedDate) || null;
  }, [snapshots, selectedDate]);

  const assetPerformanceMap = useMemo(() => {
    const map = new Map<string, AssetPerformance>();
    
    const processSnapshot = (s: SnapshotItem, isHist: boolean) => {
        s.assets.forEach(a => {
            if (a.quantity > 0) {
                map.set(a.assetId, {
                    quantity: a.quantity,
                    marketValue: a.marketValue,
                    totalCost: a.totalCost,
                    unitPrice: a.unitPrice,
                    date: s.date,
                    isHistorical: isHist
                });
            }
        });
    };

    if (selectedDate !== 'latest') {
        if (viewSnapshot) processSnapshot(viewSnapshot, false);
    } else {
        // "Latest" Mode logic
        const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
        sorted.forEach(s => {
            processSnapshot(s, true); 
        });
        if (sorted.length > 0) {
            const latest = sorted[sorted.length - 1];
            latest.assets.forEach(a => {
                if (a.quantity > 0) {
                    map.set(a.assetId, {
                        quantity: a.quantity,
                        marketValue: a.marketValue,
                        totalCost: a.totalCost,
                        unitPrice: a.unitPrice,
                        date: latest.date,
                        isHistorical: false 
                    });
                }
            });
        }
    }
    return map;
  }, [snapshots, selectedDate, viewSnapshot]);

  // --- Data Logic: Specific Asset History (For History Modal) ---
  const selectedAssetHistory = useMemo(() => {
    if (!viewHistoryId) return [];
    
    return snapshots
        .map(snap => {
            const record = snap.assets.find(a => a.assetId === viewHistoryId);
            if (!record) return null;
            return {
                date: snap.date,
                unitPrice: record.unitPrice,
                quantity: record.quantity,
                marketValue: record.marketValue,
                totalCost: record.totalCost,
                profit: record.marketValue - record.totalCost,
                roi: record.totalCost > 0 ? ((record.marketValue - record.totalCost) / record.totalCost * 100) : 0
            };
        })
        .filter(item => item !== null)
        .sort((a, b) => a!.date.localeCompare(b!.date));
  }, [snapshots, viewHistoryId]);


  // --- Filtering ---
  const { heldAssets, clearedAssets, totalHeldValue, totalHeldProfit } = useMemo(() => {
    const held: Asset[] = [];
    const cleared: Asset[] = [];
    let totalVal = 0;
    let totalProfit = 0;

    const filtered = assets.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (a.ticker && a.ticker.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = filterType === 'all' || a.type === filterType;
      return matchesSearch && matchesType;
    });

    filtered.forEach(asset => {
      const perf = assetPerformanceMap.get(asset.id);
      
      // If asset is currently held (exists in map AND not historical)
      if (perf && !perf.isHistorical) {
        held.push(asset);
        totalVal += perf.marketValue;
        totalProfit += (perf.marketValue - perf.totalCost);
      } else {
        // Either historical (cleared) or new (no record)
        cleared.push(asset);
      }
    });

    return { heldAssets: held, clearedAssets: cleared, totalHeldValue: totalVal, totalHeldProfit: totalProfit };
  }, [assets, searchTerm, filterType, assetPerformanceMap]);


  // --- Handlers ---

  const openEditModal = (asset?: Asset) => {
    if (asset) {
      setEditingId(asset.id);
      setFormName(asset.name);
      setFormType(asset.type);
      setFormTicker(asset.ticker || '');
    } else {
      setEditingId(null);
      setFormName('');
      setFormType('security');
      setFormTicker('');
    }
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload = { name: formName, type: formType, ticker: formTicker };
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

  const renderAssetCard = (asset: Asset, isHeld: boolean) => {
    const meta = getCategoryMeta(asset.type);
    const Icon = meta.icon;
    const status = assetPerformanceMap.get(asset.id);

    // Calculate metrics or defaults for new assets
    const marketValue = status ? status.marketValue : 0;
    const totalCost = status ? status.totalCost : 0;
    const profit = marketValue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const isProfitable = profit >= 0;

    // Chinese Red/Green Convention
    const trendColor = isProfitable ? 'text-rose-600' : 'text-emerald-600';
    const trendBg = isProfitable ? 'bg-rose-50' : 'bg-emerald-50';
    const trendSign = isProfitable ? '+' : '';

    return (
      <div 
        key={asset.id} 
        className={`bg-white rounded-xl border transition-all duration-200 group relative flex flex-col justify-between
          ${isHeld 
            ? 'border-slate-100 shadow-sm hover:shadow-md' 
            : 'border-slate-100 bg-slate-50 opacity-60 hover:opacity-100 hover:shadow-sm'
          }`}
      >
        <div 
           className="p-5 flex-1 cursor-pointer"
           onClick={() => setViewHistoryId(asset.id)}
        >
            {/* Header: Identity */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl shrink-0 ${isHeld ? meta.color : 'bg-slate-200 text-slate-400 grayscale'}`}>
                        <Icon size={22} />
                    </div>
                    <div>
                        <h3 className={`font-bold text-base leading-tight ${isHeld ? 'text-slate-800' : 'text-slate-600'}`}>
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
                    
                    {/* Profitability Indicators - Show even if cleared, as requested */}
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
                <div>持有: {status.quantity.toLocaleString()}</div>
                <div>成本: ¥{status.totalCost.toLocaleString()}</div>
             </div>
        )}
      </div>
    );
  };

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">资产库管理</h2>
          <p className="text-slate-500 text-sm">定义您的投资标的字典，点击卡片查看历史走势。</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索资产名称..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <button onClick={() => setFilterType('all')} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border ${filterType === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>全部</button>
          {CATEGORIES.map(cat => (
             <button key={cat.value} onClick={() => setFilterType(cat.value)} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border flex items-center gap-1 ${filterType === cat.value ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
               <cat.icon size={14} />{cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {heldAssets.length === 0 && clearedAssets.length === 0 && (
        <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-100 border-dashed">
             <Coins size={48} className="mx-auto mb-4 opacity-20" />
             <p>没有找到符合条件的资产。</p>
        </div>
      )}

      {/* Held Assets Section */}
      {heldAssets.length > 0 && (
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 px-1 gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Wallet size={18} className="text-blue-600" />
              {selectedDate === 'latest' ? '目前持有' : `${selectedDate} 时持有`}
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{heldAssets.length}</span>
            </h3>
            <div className="flex items-center gap-3">
                 <div className="text-sm font-medium text-slate-600 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm flex items-center gap-2">
                    <span className="text-slate-400 text-xs">总市值</span>
                    <span className="font-bold text-slate-800">¥{totalHeldValue.toLocaleString()}</span>
                 </div>
                 <div className="text-sm font-medium text-slate-600 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm flex items-center gap-2">
                    <span className="text-slate-400 text-xs">总浮盈</span>
                    <span className={`font-bold ${totalHeldProfit >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {totalHeldProfit >= 0 ? '+' : ''}¥{totalHeldProfit.toLocaleString()}
                    </span>
                 </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {heldAssets.map(asset => renderAssetCard(asset, true))}
          </div>
        </div>
      )}

      {/* Cleared Assets Section */}
      {clearedAssets.length > 0 && (
        <div className="mb-8">
          <button 
            onClick={() => setIsClearedOpen(!isClearedOpen)}
            className="flex items-center gap-2 w-full text-left mb-4 px-1 group outline-none"
          >
            {isClearedOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
            <h3 className="font-bold text-slate-500 group-hover:text-slate-700 transition-colors">
              {selectedDate === 'latest' ? '已清空 / 历史持有 / 观察中' : `${selectedDate} 时未持有`}
            </h3>
            <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full">{clearedAssets.length}</span>
          </button>
          
          {isClearedOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
              {clearedAssets.map(asset => renderAssetCard(asset, false))}
            </div>
          )}
        </div>
      )}

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
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">代码 / 备注 (选填)</label>
                   <input className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formTicker} onChange={e => setFormTicker(e.target.value)} />
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
                    {/* Summary Cards */}
                    {selectedAssetHistory.length > 0 ? (
                        <>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="text-xs text-slate-500 mb-1">当前市值</div>
                                <div className="text-xl font-bold text-slate-800">
                                    ¥{selectedAssetHistory[selectedAssetHistory.length - 1]!.marketValue.toLocaleString()}
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="text-xs text-slate-500 mb-1">累计盈亏</div>
                                {(() => {
                                    const last = selectedAssetHistory[selectedAssetHistory.length - 1]!;
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
                                    {selectedAssetHistory[selectedAssetHistory.length - 1]!.quantity.toLocaleString()}
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
                                        <AreaChart data={selectedAssetHistory}>
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
                                        <LineChart data={selectedAssetHistory}>
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
                                            <th className="px-4 py-3 text-right">单价</th>
                                            <th className="px-4 py-3 text-right">持仓量</th>
                                            <th className="px-4 py-3 text-right">总成本</th>
                                            <th className="px-4 py-3 text-right">市值</th>
                                            <th className="px-4 py-3 text-right">盈亏</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {[...selectedAssetHistory].reverse().map((row) => (
                                            <tr key={row!.date} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium text-slate-700">{row!.date}</td>
                                                <td className="px-4 py-3 text-right">{row!.unitPrice.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right">{row!.quantity.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-slate-500">¥{row!.totalCost.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-800">¥{row!.marketValue.toLocaleString()}</td>
                                                <td className={`px-4 py-3 text-right font-medium ${row!.profit >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {row!.profit >= 0 ? '+' : ''}{row!.profit.toLocaleString()}
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
                </div>
            </div>
        </div>
      )}
    </div>
  );
};