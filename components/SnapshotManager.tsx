import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Calendar, Trash2, Coins, Landmark, Briefcase, TrendingUp, DollarSign, Save, X, Activity, Search, FileText, ChevronDown, ChevronUp, ArrowRight, Wallet, Bitcoin } from 'lucide-react';
import { SnapshotItem, StrategyVersion, AssetRecord, AssetCategory, Asset } from '../types';
import { generateId, StorageService } from '../services/storageService';

interface SnapshotManagerProps {
  snapshots: SnapshotItem[];
  strategies: StrategyVersion[];
  assets?: Asset[]; // Global dictionary passed from App
  onUpdate: (snapshots: SnapshotItem[]) => void;
  onSave?: (snapshot: SnapshotItem) => void;
  onCreateAsset?: (asset: Partial<Asset>) => Promise<void>;
}

// Temporary state for editing a row
interface AssetRowInput {
  recordId: string;
  assetId?: string; // Link to global asset
  strategyId?: string;
  
  // Display
  name: string;
  category: AssetCategory;
  
  // Inputs
  price: string;
  quantityChange: string; 
  costChange: string; 
  
  // Computed preview
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
  const [viewMode, setViewMode] = useState<'list' | 'entry'>('list');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  
  // Form State
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 7));
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<AssetRowInput[]>([]);
  
  // Asset Creation Modal
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetCategory>('security');

  // List View State
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  
  const sortedSnapshots = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));

  const activeStrategy = useMemo(() => {
    return StorageService.getStrategyForDate(versions, date) || versions[versions.length - 1];
  }, [versions, date]);

  const previousSnapshot = useMemo(() => {
    return snapshots
      .filter(s => s.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [snapshots, date]);

  // --- Entry Logic ---

  const initEntryForm = (snapshotId?: string) => {
    let baseDate = new Date().toISOString().slice(0, 7);
    let baseNote = '';
    let initialRows: AssetRowInput[] = [];

    const existing = snapshots.find(s => s.id === snapshotId);
    if (existing) {
      baseDate = existing.date;
      baseNote = existing.note || '';
      initialRows = existing.assets.map(a => ({
        recordId: a.id,
        assetId: a.assetId,
        strategyId: a.strategyId,
        name: a.name,
        category: a.category,
        price: a.unitPrice.toString(),
        quantityChange: a.addedQuantity.toString(),
        costChange: a.addedPrincipal.toString(),
        prevQuantity: a.quantity - a.addedQuantity,
        prevCost: a.totalCost - a.addedPrincipal
      }));
    } else {
      // New Snapshot Logic
      
      // 1. Add Strategy Items (Plan)
      if (activeStrategy) {
        activeStrategy.items.forEach(item => {
          const prevAsset = previousSnapshot?.assets.find(a => a.assetId === item.assetId);
          initialRows.push({
            recordId: generateId(),
            assetId: item.assetId,
            strategyId: item.id, // Link to strategy target
            name: item.targetName,
            category: 'security', // Default assumption, should lookup asset type really
            price: prevAsset ? prevAsset.unitPrice.toString() : '',
            quantityChange: '',
            costChange: '',
            prevQuantity: prevAsset ? prevAsset.quantity : 0,
            prevCost: prevAsset ? prevAsset.totalCost : 0
          });
        });
      }

      // 2. Add Other Assets carried over (Legacy holdings not in strategy)
      if (previousSnapshot) {
        previousSnapshot.assets.forEach(a => {
          // If not already added via strategy list above
          const alreadyAdded = initialRows.find(r => r.assetId === a.assetId);
          if (!alreadyAdded) {
             initialRows.push({
              recordId: generateId(),
              assetId: a.assetId,
              strategyId: undefined,
              name: a.name,
              category: a.category,
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
  };

  const updateRow = (index: number, field: 'price' | 'quantityChange' | 'costChange', value: string) => {
    const newRows = [...rows];
    const row = newRows[index];
    row[field] = value;

    // --- Intelligent Sync for Wealth/Fixed ---
    // If user inputs "Cost Change" (Deposit Principal), we assume "Quantity Change" (Balance) increases by same amount
    // unless Quantity is already manually edited.
    if ((row.category === 'fixed' || row.category === 'wealth') && field === 'costChange') {
        // Only auto-sync if quantity hasn't been touched yet or matches previous principal input
        // Simple logic: overwrite quantity change to match principal change for convenience
        // User can manually correct Quantity afterwards if it differs (e.g. fees)
        row.quantityChange = value;
    }

    setRows(newRows);
  };

  // Logic to add a NEW row from the global dictionary
  const addAssetRow = (asset: Asset) => {
    // Check if exists
    if (rows.find(r => r.assetId === asset.id)) {
      alert("该资产已在列表中");
      return;
    }
    
    // Check previous value
    const prevAsset = previousSnapshot?.assets.find(a => a.assetId === asset.id);
    const isCashLike = asset.type === 'fixed' || asset.type === 'wealth';
    
    setRows([
      ...rows,
      {
        recordId: generateId(),
        assetId: asset.id,
        strategyId: undefined,
        name: asset.name,
        category: asset.type,
        price: prevAsset ? prevAsset.unitPrice.toString() : (isCashLike ? '1' : ''),
        quantityChange: '',
        costChange: '',
        prevQuantity: prevAsset ? prevAsset.quantity : 0,
        prevCost: prevAsset ? prevAsset.totalCost : 0
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
        // Wealth and Fixed items ALWAYS have unit price of 1 for simplified bookkeeping
        const price = (r.category === 'fixed' || r.category === 'wealth') ? 1 : (parseFloat(r.price) || 0);
        const qChange = parseFloat(r.quantityChange) || 0;
        const cChange = parseFloat(r.costChange) || 0;
        
        const newQuantity = r.prevQuantity + qChange;
        const newCost = r.prevCost + cChange;

        return {
            id: r.recordId,
            assetId: r.assetId || generateId(), // Fallback
            strategyId: r.strategyId,
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
            note: note // Save the note
        };

        onSave(newSnapshot);
        setViewMode('list');
    }
  };

  // --- Quick Asset Creation ---
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

  // --- Render Helpers ---

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

  // --- View: Entry Form ---
  
  if (viewMode === 'entry') {
    const totalAssetsVal = rows.reduce((sum, r) => {
       const p = parseFloat(r.price) || (r.category === 'fixed' || r.category === 'wealth' ? 1 : 0);
       const q = r.prevQuantity + (parseFloat(r.quantityChange) || 0);
       return sum + (p * q);
    }, 0);
    
    // Filter out assets already in the list to show available ones in dropdown (simplified)
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

          {/* Config Area: Date, Asset, Note */}
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
                                  e.target.value = ""; // Reset
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

             {/* Markdown Note Section */}
             <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
                  <FileText size={14} />
                  本月投资笔记 (Markdown) - <span className="font-normal opacity-70">记录当月市场观点、操作逻辑或备忘</span>
                </label>
                <textarea 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono min-h-[100px]"
                  placeholder="# 本月大事记&#10;- 美联储降息预期增强...&#10;- 增持了黄金..."
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
                  {/* Changed background to Red tint for money input */}
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
                  
                  // Implied Profit Calculation for this specific row action
                  // For Wealth/Fixed: Profit = (Added Quantity * 1) - Added Principal
                  // For Security: Profit can't be easily calc'd just from flow, need valuation change.
                  // But for the user request "Bookkeeping In/Out", showing implied interest for Wealth is helpful.
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
                      {/* Changed input text color to Red for Principal/Cost */}
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
                         {!row.strategyId && (
                           <button onClick={() => removeRow(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                         )}
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

  // --- View: List ---

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
        >
          <Plus size={18} />
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
            const netInput = s.assets.reduce((sum, a) => sum + a.addedPrincipal, 0);
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
                    <div className="text-right hidden sm:block">
                       <div className="text-xs text-slate-500">本月净投入</div>
                       {/* Red for Positive Input (Inflow to investment), Green for Negative (Outflow) */}
                       <div className={`font-medium ${netInput > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {netInput > 0 ? '+' : ''}
                          {netInput.toLocaleString()}
                       </div>
                    </div>
                    <div className="flex gap-2">
                       <button 
                        onClick={() => initEntryForm(s.id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="编辑"
                       >
                         <Calendar size={18} />
                       </button>
                       {/* Delete in API mode usually requires more checks, kept simple here */}
                       <button className="p-2 text-slate-300 cursor-not-allowed rounded-lg">
                         <Trash2 size={18} />
                       </button>
                    </div>
                 </div>
              </div>
              
              {/* Assets Preview */}
              <div className="px-4 py-3 border-b border-slate-50 flex gap-2 overflow-x-auto no-scrollbar">
                 {s.assets.slice(0, 5).map(a => (
                   <div key={a.id} className="text-xs px-2 py-1 bg-slate-50 rounded border border-slate-100 whitespace-nowrap text-slate-600 flex items-center gap-1">
                      {getCategoryIcon(a.category)}
                      <span>{a.name}</span>
                   </div>
                 ))}
                 {s.assets.length > 5 && <span className="text-xs text-slate-400 self-center">+{s.assets.length - 5} 更多</span>}
              </div>

              {/* Note Display Section */}
              {s.note ? (
                 <div className="px-4 py-2 bg-yellow-50/30">
                   <button 
                     onClick={() => toggleNote(s.id)}
                     className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 w-full"
                   >
                     {expandedNotes.has(s.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                     <span>投资笔记</span>
                     {!expandedNotes.has(s.id) && <span className="text-slate-400 font-normal truncate max-w-[200px] ml-2">{s.note}</span>}
                   </button>
                   
                   {expandedNotes.has(s.id) && (
                     <div className="mt-2 text-sm text-slate-700 prose prose-sm max-w-none prose-p:my-1">
                        <ReactMarkdown>{s.note}</ReactMarkdown>
                     </div>
                   )}
                 </div>
              ) : (
                <div className="px-4 py-1">
                  <span className="text-[10px] text-slate-300 italic">本月未留笔记</span>
                </div>
              )}

            </div>
          )})
        )}
      </div>
    </div>
  );
};

export default SnapshotManager;