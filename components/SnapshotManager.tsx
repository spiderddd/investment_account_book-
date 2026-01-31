
import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus, Calendar, Trash2, Coins, Landmark, Briefcase, TrendingUp, DollarSign, Save, X, Activity, Search, FileText, ChevronDown, ChevronUp, ArrowRight, Wallet, Bitcoin, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { SnapshotItem, StrategyVersion, AssetRecord, AssetCategory, Asset } from '../types';
import { generateId, StorageService } from '../services/storageService';
import { getStrategyForDate } from '../utils/calculators';
import { useData } from '../contexts/DataContext';

interface SnapshotManagerProps {
  snapshots: SnapshotItem[];
  strategies: StrategyVersion[];
  assets?: Asset[]; 
  onUpdate: (snapshots: SnapshotItem[]) => void;
  onSave?: (snapshot: SnapshotItem) => void;
  onCreateAsset?: (asset: Partial<Asset>) => Promise<void>;
}

interface AssetRowInput {
  recordId: string;
  assetId?: string; 
  name: string;
  category: AssetCategory;
  price: string;
  quantityChange: string; 
  costChange: string; 
  prevQuantity: number;
  prevCost: number;
}

const SnapshotManager: React.FC<SnapshotManagerProps> = ({ 
  snapshots, 
  strategies: versions, 
  assets = [],
  onUpdate, 
  onSave, 
  onCreateAsset 
}) => {
  // Use Pagination from Context
  const { snapshotPage, setSnapshotPage, snapshotTotal } = useData();

  const [viewMode, setViewMode] = useState<'list' | 'entry'>('list');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 7));
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<AssetRowInput[]>([]);
  
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetCategory>('security');

  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  
  const sortedSnapshots = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));

  const activeStrategy = useMemo(() => {
    return getStrategyForDate(versions, date) || versions[versions.length - 1];
  }, [versions, date]);

  // --- Entry Logic ---

  const initEntryForm = async (snapshotId?: string) => {
    setLoadingDetails(true);
    let baseDate = new Date().toISOString().slice(0, 7);
    let baseNote = '';
    let initialRows: AssetRowInput[] = [];

    try {
        let existing: SnapshotItem | null = null;
        let prevDetails: SnapshotItem | null = null;

        // Fetch current if editing
        if (snapshotId) {
            existing = await StorageService.getSnapshot(snapshotId);
        }

        // Fetch previous for "carry over" logic
        const refDate = existing ? existing.date : baseDate;
        
        // We need to fetch the lightweight summary of the previous snapshot first to get its ID
        // Since the current list might be paginated and not contain the previous one,
        // we use the History API (all lightweight snapshots) or just search in current if lucky.
        // For robustness, we assume we might need to fetch the history list if not found.
        let prevSummary = snapshots.find(s => s.date < refDate);
        if (!prevSummary) {
           // Fallback: try to find from history endpoint (all items)
           const historyList = await StorageService.getSnapshotsHistory();
           prevSummary = historyList.filter(s => s.date < refDate).sort((a, b) => b.date.localeCompare(a.date))[0];
        } else {
           // If found in current page, ensure we pick the closest one
           prevSummary = snapshots.filter(s => s.date < refDate).sort((a, b) => b.date.localeCompare(a.date))[0];
        }
        
        if (prevSummary) {
            prevDetails = await StorageService.getSnapshot(prevSummary.id);
        }

        if (existing) {
          baseDate = existing.date;
          baseNote = existing.note || '';
          if (existing.assets) {
              initialRows = existing.assets.map(a => {
                const realAsset = assets.find(def => def.id === a.assetId);
                const prevAsset = prevDetails?.assets?.find(pa => pa.assetId === a.assetId);

                return {
                    recordId: a.id,
                    assetId: a.assetId,
                    name: realAsset ? realAsset.name : a.name, 
                    category: realAsset ? realAsset.type : a.category, 
                    price: a.unitPrice.toString(),
                    quantityChange: a.addedQuantity.toString(),
                    costChange: a.addedPrincipal.toString(),
                    // Calculate "Previous" based on current minus added, OR from previous snapshot directly
                    prevQuantity: prevAsset ? prevAsset.quantity : (a.quantity - a.addedQuantity),
                    prevCost: prevAsset ? prevAsset.totalCost : (a.totalCost - a.addedPrincipal)
                };
              });
          }
        } else {
          // New Snapshot Logic
          if (activeStrategy && activeStrategy.layers) {
            const allTargets = activeStrategy.layers.flatMap(l => l.items);
            allTargets.forEach(item => {
              const realAsset = assets.find(a => a.id === item.assetId);
              const prevAsset = prevDetails?.assets?.find(a => a.assetId === item.assetId);
              
              initialRows.push({
                recordId: generateId(),
                assetId: item.assetId,
                name: realAsset ? realAsset.name : item.targetName, 
                category: realAsset ? realAsset.type : 'security', 
                price: prevAsset ? prevAsset.unitPrice.toString() : '',
                quantityChange: '',
                costChange: '',
                prevQuantity: prevAsset ? prevAsset.quantity : 0,
                prevCost: prevAsset ? prevAsset.totalCost : 0
              });
            });
          }

          if (prevDetails && prevDetails.assets) {
            prevDetails.assets.forEach(a => {
              const alreadyAdded = initialRows.find(r => r.assetId === a.assetId);
              if (!alreadyAdded) { 
                 const realAsset = assets.find(def => def.id === a.assetId);
                 initialRows.push({
                  recordId: generateId(),
                  assetId: a.assetId,
                  name: realAsset ? realAsset.name : a.name,
                  category: realAsset ? realAsset.type : a.category,
                  price: a.unitPrice.toString(),
                  quantityChange: '',
                  costChange: '',
                  prevQuantity: a.quantity,
                  prevCost: a.totalCost
                });
              }
            });
          }
        }

        setDate(baseDate);
        setNote(baseNote);
        setRows(initialRows);
        setSelectedSnapshotId(snapshotId || null);
        setViewMode('entry');
    } catch (e) {
        console.error("Error loading snapshot details", e);
        alert("无法加载快照详情，请检查网络连接");
    } finally {
        setLoadingDetails(false);
    }
  };

  const updateRow = (index: number, field: 'price' | 'quantityChange' | 'costChange', value: string) => {
    const newRows = [...rows];
    const row = newRows[index];
    row[field] = value;
    if ((row.category === 'fixed' || row.category === 'wealth') && field === 'costChange') {
        row.quantityChange = value;
    }
    setRows(newRows);
  };

  const addAssetRow = (asset: Asset) => {
    if (rows.find(r => r.assetId === asset.id)) {
      alert("该资产已在列表中");
      return;
    }
    const isCashLike = asset.type === 'fixed' || asset.type === 'wealth';
    setRows([
      ...rows,
      {
        recordId: generateId(),
        assetId: asset.id,
        name: asset.name,
        category: asset.type,
        price: isCashLike ? '1' : '',
        quantityChange: '',
        costChange: '',
        prevQuantity: 0, 
        prevCost: 0
      }
    ]);
  };

  const removeRow = (index: number) => {
    if(confirm('移除此资产记录？(若该资产有持仓，移除意味着该月持仓归零)')) {
      const newRows = [...rows];
      newRows.splice(index, 1);
      setRows(newRows);
    }
  };

  const handleSubmit = () => {
    if (onSave) {
        const finalAssets: AssetRecord[] = rows.map(r => {
        const price = (r.category === 'fixed' || r.category === 'wealth') ? 1 : (parseFloat(r.price) || 0);
        const qChange = parseFloat(r.quantityChange) || 0;
        const cChange = parseFloat(r.costChange) || 0;
        const newQuantity = r.prevQuantity + qChange;
        const newCost = r.prevCost + cChange;

        return {
            id: r.recordId,
            assetId: r.assetId || generateId(),
            name: r.name,
            category: r.category,
            unitPrice: price,
            quantity: newQuantity,
            marketValue: newQuantity * price,
            totalCost: newCost,
            addedPrincipal: cChange,
            addedQuantity: qChange
        };
        });

        const totalVal = finalAssets.reduce((sum, a) => sum + a.marketValue, 0);
        const totalInv = finalAssets.reduce((sum, a) => sum + a.totalCost, 0);

        const newSnapshot: SnapshotItem = {
            id: selectedSnapshotId || generateId(),
            date,
            assets: finalAssets,
            totalValue: totalVal,
            totalInvested: totalInv,
            note: note
        };

        onSave(newSnapshot);
        setViewMode('list');
    }
  };

  const handleCreateNewAsset = async () => {
      if (newAssetName && onCreateAsset) {
          await onCreateAsset({
              name: newAssetName,
              type: newAssetType
          });
          setNewAssetName('');
          setIsCreatingAsset(false);
      }
  };

  const toggleNote = (id: string) => {
    const newSet = new Set(expandedNotes);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedNotes(newSet);
  };

  const getCategoryIcon = (c: AssetCategory) => {
    switch (c) {
      case 'security': return <TrendingUp size={16} className="text-blue-600"/>;
      case 'fund': return <Briefcase size={16} className="text-indigo-600"/>;
      case 'wealth': return <Landmark size={16} className="text-cyan-600"/>;
      case 'gold': return <Coins size={16} className="text-amber-600"/>;
      case 'fixed': return <Wallet size={16} className="text-slate-600"/>; 
      case 'crypto': return <Bitcoin size={16} className="text-purple-600"/>; 
      default: return <Briefcase size={16} className="text-pink-600"/>;
    }
  };

  if (viewMode === 'entry') {
     // ... (Keep existing Entry View code unchanged, just ensuring it's wrapped properly)
     const totalAssetsVal = rows.reduce((sum, r) => {
       const p = parseFloat(r.price) || (r.category === 'fixed' || r.category === 'wealth' ? 1 : 0);
       const q = r.prevQuantity + (parseFloat(r.quantityChange) || 0);
       return sum + (p * q);
    }, 0);
    
    const availableAssets = assets.filter(a => !rows.find(r => r.assetId === a.id));

    return (
      <div className="pb-20">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
            <div>
               <h2 className="text-xl font-bold text-slate-800">
                 {selectedSnapshotId ? '编辑资产负债表' : '录入月度账本'}
               </h2>
               <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                 <span>{date}</span>
                 <span>•</span>
                 <span>总资产: ¥{totalAssetsVal.toLocaleString()}</span>
               </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => setViewMode('list')} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg">取消</button>
               <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2">
                 <Save size={18} /> 保存
               </button>
            </div>
          </div>

          {/* Config Area */}
          <div className="p-6 border-b border-slate-100 space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="max-w-xs relative">
                  <label className="text-xs font-bold text-slate-400 mb-1 block">账期 (Month)</label>
                  <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input 
                      type="month"
                      className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={date} onChange={e => setDate(e.target.value)}
                      disabled={!!selectedSnapshotId} 
                      />
                  </div>
               </div>
               <div>
                  <label className="text-xs font-bold text-slate-400 mb-1 block">添加资产 (Add Asset)</label>
                  <div className="flex gap-2">
                      <select 
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          onChange={(e) => {
                              const asset = assets.find(a => a.id === e.target.value);
                              if (asset) {
                                  addAssetRow(asset);
                                  e.target.value = ""; 
                              }
                          }}
                      >
                          <option value="">+ 选择已定义的资产...</option>
                          {availableAssets.map(a => (
                              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                          ))}
                      </select>
                      <button 
                          onClick={() => setIsCreatingAsset(true)}
                          className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                          title="创建新资产"
                      >
                          <Plus size={18} />
                      </button>
                  </div>
               </div>
             </div>

             <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
                  <FileText size={14} />
                  本月投资笔记 (Markdown)
                </label>
                <textarea 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono min-h-[100px]"
                  placeholder="# 本月大事记..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
             </div>
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                  <th className="p-4 w-64 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">资产名称</th>
                  <th className="p-4 w-32 text-right">当前单价</th>
                  <th className="p-4 w-40 text-right bg-blue-50/30">本月变动 (份额)</th>
                  <th className="p-4 w-40 text-right bg-rose-50/30">本月流水 (本金)</th>
                  <th className="p-4 w-32 text-right">持有总量</th>
                  <th className="p-4 w-40 text-right">当前市值</th>
                  <th className="p-4 w-16 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const isCashLike = row.category === 'fixed' || row.category === 'wealth';
                  const p = parseFloat(row.price) || (isCashLike ? 1 : 0);
                  const qChange = parseFloat(row.quantityChange) || 0;
                  const cChange = parseFloat(row.costChange) || 0;
                  const currentQ = row.prevQuantity + qChange;
                  const currentVal = currentQ * p;
                  
                  const impliedProfit = isCashLike ? (qChange - cChange) : 0;

                  return (
                    <tr key={row.recordId} className="hover:bg-slate-50 group">
                      <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                         <div className="flex items-center gap-3">
                           <div className={`p-1.5 rounded-lg bg-slate-100`}>
                             {getCategoryIcon(row.category)}
                           </div>
                           <div>
                             <div className="font-bold text-slate-800">{row.name}</div>
                             <div className="text-[10px] text-slate-400 uppercase">{row.category}</div>
                           </div>
                         </div>
                      </td>
                      <td className="p-4">
                        <input 
                           type="number" step="0.0001" placeholder="0.00"
                           className={`w-full text-right px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none ${isCashLike ? 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed' : 'border-slate-200'}`}
                           value={isCashLike ? '1.00' : row.price} 
                           onChange={e => !isCashLike && updateRow(idx, 'price', e.target.value)}
                           disabled={isCashLike} 
                        />
                      </td>
                      <td className="p-4 bg-blue-50/30 relative">
                        <input 
                           type="number" step="0.0001" placeholder="0"
                           className="w-full text-right px-2 py-1 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-blue-700 font-medium"
                           value={row.quantityChange} onChange={e => updateRow(idx, 'quantityChange', e.target.value)}
                        />
                         {isCashLike && Math.abs(impliedProfit) > 0.01 && (
                            <div className={`text-[10px] text-right mt-1 font-medium ${impliedProfit > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                               {impliedProfit > 0 ? '利息/收益 +' : '费用 -'}{Math.abs(impliedProfit).toLocaleString()}
                            </div>
                        )}
                      </td>
                      <td className="p-4 bg-rose-50/30">
                         <input 
                           type="number" step="0.01" placeholder="0.00"
                           className="w-full text-right px-2 py-1 border border-rose-200 rounded focus:ring-2 focus:ring-rose-500 outline-none text-rose-700 font-medium"
                           value={row.costChange} onChange={e => updateRow(idx, 'costChange', e.target.value)}
                        />
                      </td>
                      <td className="p-4 text-right text-slate-600">
                        <div>{currentQ.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                        {row.prevQuantity > 0 && <div className="text-[10px] text-slate-400">前: {row.prevQuantity.toLocaleString()}</div>}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800">
                        ¥{currentVal.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </td>
                      <td className="p-4 text-center">
                           <button onClick={() => removeRow(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Asset Modal */}
        {isCreatingAsset && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
                    <h3 className="font-bold text-lg mb-4">定义新资产</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">资产名称</label>
                            <input 
                                className="w-full border rounded px-3 py-2"
                                value={newAssetName}
                                onChange={e => setNewAssetName(e.target.value)}
                                placeholder="如：贵州茅台"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">资产类型</label>
                            <select 
                                className="w-full border rounded px-3 py-2"
                                value={newAssetType}
                                onChange={e => setNewAssetType(e.target.value as AssetCategory)}
                            >
                                <option value="security">股票/证券</option>
                                <option value="fund">基金/ETF</option>
                                <option value="wealth">银行理财</option>
                                <option value="gold">贵金属/商品</option>
                                <option value="fixed">现金/存款</option>
                                <option value="crypto">加密货币</option>
                                <option value="other">其他</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={() => setIsCreatingAsset(false)} className="px-4 py-2 text-slate-500">取消</button>
                        <button onClick={handleCreateNewAsset} className="px-4 py-2 bg-blue-600 text-white rounded">创建</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // --- View: List (Pagination Added) ---
  const totalPages = Math.ceil(snapshotTotal / 20); // Hardcoded limit matches Context default
  const hasNext = snapshotPage < totalPages;
  const hasPrev = snapshotPage > 1;

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">月度账本</h2>
          <p className="text-slate-500 text-sm">统一管理所有资产的市值与流水变动。</p>
        </div>
        <button 
          onClick={() => initEntryForm()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-sm"
          disabled={loadingDetails}
        >
          {loadingDetails ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          记一笔
        </button>
      </div>

      <div className="space-y-4">
        {sortedSnapshots.length === 0 ? (
           <div className="bg-white p-12 text-center rounded-xl border border-slate-100 text-slate-400">
             <Activity size={48} className="mx-auto mb-4 opacity-20" />
             <p>暂无记录。点击右上角开始记账。</p>
           </div>
        ) : (
          sortedSnapshots.map(s => {
            return (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                 <div className="flex items-center gap-3">
                   <div className="bg-white border border-slate-200 p-2 rounded-lg shadow-sm text-center min-w-[3.5rem]">
                     <div className="text-xs text-slate-500 uppercase">{s.date.split('-')[0]}</div>
                     <div className="text-lg font-bold text-slate-800">{s.date.split('-')[1]}</div>
                   </div>
                   <div>
                     <div className="text-sm text-slate-500">总资产</div>
                     <div className="font-bold text-slate-800 text-lg">¥{s.totalValue.toLocaleString()}</div>
                   </div>
                 </div>
                 
                 <div className="flex items-center gap-6">
                    <div className="flex gap-2">
                       <button onClick={() => initEntryForm(s.id)} disabled={loadingDetails} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            {loadingDetails && selectedSnapshotId === s.id ? <Loader2 className="animate-spin" size={18}/> : <Calendar size={18} />}
                       </button>
                    </div>
                 </div>
              </div>
              
              {s.note ? (
                 <div className="px-4 py-2 bg-yellow-50/30">
                   <button onClick={() => toggleNote(s.id)} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 w-full">
                     {expandedNotes.has(s.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                     <span>投资笔记</span>
                     {!expandedNotes.has(s.id) && <span className="text-slate-400 font-normal truncate max-w-[200px] ml-2">{s.note}</span>}
                   </button>
                   {expandedNotes.has(s.id) && (
                     <div className="mt-2 text-sm text-slate-700 prose prose-sm max-w-none prose-p:my-1 prose-table:border-collapse prose-th:border prose-th:border-slate-200 prose-th:p-2 prose-td:border prose-td:border-slate-200 prose-td:p-2 prose-th:bg-slate-50">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.note}</ReactMarkdown>
                     </div>
                   )}
                 </div>
              ) : (
                <div className="px-4 py-1"><span className="text-[10px] text-slate-300 italic">本月未留笔记</span></div>
              )}
            </div>
          )})
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
            <button 
                onClick={() => setSnapshotPage(snapshotPage - 1)}
                disabled={!hasPrev}
                className={`p-2 rounded-lg flex items-center gap-1 text-sm font-medium ${!hasPrev ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-200 bg-white shadow-sm border border-slate-200'}`}
            >
                <ChevronLeft size={16} /> 上一页
            </button>
            <span className="text-sm text-slate-500 font-medium">
                第 {snapshotPage} 页 / 共 {totalPages} 页
            </span>
            <button 
                onClick={() => setSnapshotPage(snapshotPage + 1)}
                disabled={!hasNext}
                className={`p-2 rounded-lg flex items-center gap-1 text-sm font-medium ${!hasNext ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-200 bg-white shadow-sm border border-slate-200'}`}
            >
                下一页 <ChevronRight size={16} />
            </button>
        </div>
      )}

    </div>
  );
};

export default SnapshotManager;
