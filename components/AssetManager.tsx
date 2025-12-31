import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Trash2, Edit2, Coins, Briefcase, Landmark, TrendingUp, Wallet, X, Save, AlertCircle, ChevronDown, ChevronRight, Clock, History, BarChart2, Eye, EyeOff 
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
  const [showHeldOnly, setShowHeldOnly] = useState(false);
  
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

  // --- Data Logic: Grouped Columns ---
  const columns = useMemo(() => {
    const groups = new Map<AssetCategory, Asset[]>();
    
    // Initialize groups
    CATEGORIES.forEach(c => groups.set(c.value, []));

    // Filter and assign assets
    assets.forEach(asset => {
      // 1. Filter by search
      const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (asset.ticker && asset.ticker.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return;

      // 2. Filter by Holding Status
      // If showHeldOnly is true, we only show assets present in the performance map (quantity > 0)
      if (showHeldOnly && !assetPerformanceMap.has(asset.id)) {
        return;
      }

      // 3. Add to group
      const list = groups.get(asset.type);
      if (list) list.push(asset);
    });

    // Sort assets inside each group by Market Value Desc
    groups.forEach((list) => {
      list.sort((a, b) => {
        const valA = assetPerformanceMap.get(a.id)?.marketValue || 0;
        const valB = assetPerformanceMap.get(b.id)?.marketValue || 0;
        return valB - valA; // High to Low
      });
    });

    return groups;
  }, [assets, searchTerm, assetPerformanceMap, showHeldOnly]);

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

  const renderAssetCard = (asset: Asset) => {
    const status = assetPerformanceMap.get(asset.id);
    const isHeld = !!status && !status.isHistorical; 
    
    const marketValue = status ? status.marketValue : 0;
    const totalCost = status ? status.totalCost : 0;
    const profit = marketValue - totalCost;
    const isProfitable = profit >= 0;

    const trendColor = isProfitable ? 'text-rose-600' : 'text-emerald-600';

    return (
      <div 
        key={asset.id} 
        className={`bg-white rounded-lg p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden ${isHeld ? 'border-slate-200' : 'border-slate-100 opacity-70 hover:opacity-100 bg-slate-50'}`}
        onClick={() => setViewHistoryId(asset.id)}
      >
        {isHeld && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500 rounded-l-lg"></div>}
        
        <div className="flex justify-between items-start mb-4">
            <div>
                <h4 className={`font-bold text-base ${isHeld ? 'text-slate-800' : 'text-slate-500'}`}>{asset.name}</h4>
                {asset.ticker && <div className="text-xs text-slate-400 font-mono mt-0.5">{asset.ticker}</div>}
            </div>
            
             <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-3 bg-white/90 rounded shadow-sm p-1">
                <button onClick={(e) => { e.stopPropagation(); openEditModal(asset); }} className="p-1.5 hover:text-blue-600"><Edit2 size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(asset.id, asset.name); }} className="p-1.5 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
        </div>

        <div>
            {status ? (
                <>
                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs text-slate-400 uppercase tracking-wide">当前市值</span>
                        <span className={`font-bold font-mono text-lg ${isHeld ? 'text-slate-900' : 'text-slate-500'}`}>¥{marketValue.toLocaleString()}</span>
                    </div>
                    {totalCost > 0 && (
                        <div className="flex items-baseline justify-between text-xs">
                            <span className="text-slate-400">浮动盈亏</span>
                            <span className={`font-medium ${trendColor}`}>{profit > 0 ? '+' : ''}{profit.toLocaleString()}</span>
                        </div>
                    )}
                     {!isHeld && <div className="text-[10px] text-slate-400 text-right mt-2 border-t border-slate-100 pt-1">已清仓 / 历史数据</div>}
                </>
            ) : (
                <div className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded">暂无持仓记录</div>
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-10 h-[calc(100vh-100px)] flex flex-col">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">资产库看板</h2>
          <p className="text-slate-500 text-sm">全量资产管理，按类别分组。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      <div className="relative w-full max-w-md mb-6 shrink-0">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索资产名称 / 代码..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
      </div>

      {/* Vertical Stack Layout with Responsive Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
        {CATEGORIES.map(cat => {
            const items = columns.get(cat.value) || [];
            
            // If no items match (and we are searching, or just empty in general), hide the section to keep it clean
            if (items.length === 0) return null;
            
            return (
                <div key={cat.value} className="bg-slate-50/50 rounded-xl border border-slate-100 p-4">
                    {/* Section Header */}
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200/60">
                         <div className={`p-1.5 rounded-lg ${cat.color}`}>
                             <cat.icon size={16} />
                         </div>
                         <h3 className="font-bold text-slate-700">{cat.label}</h3>
                         <span className="bg-white text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-200 shadow-sm ml-auto">
                           {items.length}
                         </span>
                    </div>

                    {/* Responsive Grid - Enlarged Cards (max 3 cols) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {items.map(asset => renderAssetCard(asset))}
                    </div>
                </div>
            )
        })}
        
        {/* Empty State if all filtered out */}
        {assets.length > 0 && Array.from(columns.values()).every(list => list.length === 0) && (
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