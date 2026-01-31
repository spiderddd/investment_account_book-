
import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus, Calendar, Trash2, TrendingUp, Briefcase, Landmark, Coins, Wallet, Bitcoin, Save, FileText, ChevronDown, ChevronUp, Loader2, ChevronLeft, ChevronRight, Activity, MessageSquare } from 'lucide-react';
import { SnapshotItem, StrategyVersion, AssetCategory, Asset } from '../types';
import { getStrategyForDate } from '../utils/calculators';
import { useData } from '../contexts/DataContext';
import { useSnapshotForm } from '../hooks/useSnapshotForm';

interface SnapshotManagerProps {
  snapshots: SnapshotItem[];
  strategies: StrategyVersion[];
  assets?: Asset[]; 
  onUpdate: (snapshots: SnapshotItem[]) => void;
  onSave?: (snapshot: SnapshotItem) => void;
  onCreateAsset?: (asset: Partial<Asset>) => Promise<void>;
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
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetCategory>('security');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  
  // Track which rows have their note input expanded in Entry Mode
  const [expandedRowNotes, setExpandedRowNotes] = useState<Set<string>>(new Set());

  const sortedSnapshots = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));

  // Determine active strategy based on form date or current date
  const tempDate = new Date().toISOString().slice(0, 7);
  const activeStrategy = useMemo(() => {
    return getStrategyForDate(versions, tempDate) || versions[versions.length - 1];
  }, [versions, tempDate]);

  // Use Custom Hook for Form Logic
  const {
      date, setDate,
      note, setNote,
      rows,
      loadingDetails,
      selectedSnapshotId,
      initEntryForm,
      updateRow,
      addAssetRow,
      removeRow,
      prepareSubmission
  } = useSnapshotForm(snapshots, assets, activeStrategy);

  // Wrappers
  const handleInitEntry = async (id?: string) => {
      await initEntryForm(id);
      setExpandedRowNotes(new Set()); // Reset expanded rows
      setViewMode('entry');
  };

  const handleSubmit = () => {
    if (onSave) {
        const snapshot = prepareSubmission();
        onSave(snapshot);
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

  const toggleRowNote = (recordId: string) => {
      const newSet = new Set(expandedRowNotes);
      if (newSet.has(recordId)) newSet.delete(recordId);
      else newSet.add(recordId);
      setExpandedRowNotes(newSet);
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
     const totalAssetsVal = rows.reduce((sum, r) => {
       const p = parseFloat(r.price) || (r.category === 'fixed' || r.category === 'wealth' ? 1 : 0);
       // Calculate effective quantity change based on sign
       const sign = r.transactionType === 'sell' ? -1 : 1;
       const qChange = (parseFloat(r.quantityChange) || 0) * sign;
       const q = r.prevQuantity + qChange;
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
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                  <th className="p-4 w-64 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">资产名称</th>
                  <th className="p-4 w-28 text-right">当前单价</th>
                  <th className="p-4 w-56 text-right bg-blue-50/30">
                    <div className="flex justify-end gap-2 items-center">
                        本月变动 (份额)
                    </div>
                  </th>
                  <th className="p-4 w-40 text-right bg-rose-50/30">本月流水 (本金)</th>
                  <th className="p-4 w-32 text-right">持有总量</th>
                  <th className="p-4 w-40 text-right">当前市值</th>
                  <th className="p-4 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const isCashLike = row.category === 'fixed' || row.category === 'wealth';
                  const p = parseFloat(row.price) || (isCashLike ? 1 : 0);
                  
                  // Calculate display values based on transaction type
                  const sign = row.transactionType === 'sell' ? -1 : 1;
                  const qChangeAbs = parseFloat(row.quantityChange) || 0;
                  const cChangeAbs = parseFloat(row.costChange) || 0;
                  
                  // Calculate implied signed values
                  const qChangeSigned = qChangeAbs * sign;
                  const cChangeSigned = cChangeAbs * sign;
                  
                  const currentQ = row.prevQuantity + qChangeSigned;
                  const currentVal = currentQ * p;
                  
                  // Profit calc for fixed assets: Profit = (Q_change - C_change)
                  const impliedProfit = isCashLike ? (qChangeSigned - cChangeSigned) : 0;
                  
                  // Determine step based on category
                  const quantityStep = row.category === 'security' ? "100" : (row.category === 'fund' ? "0.01" : "1");

                  const hasNote = row.note && row.note.trim().length > 0;
                  const isExpanded = expandedRowNotes.has(row.recordId);

                  return (
                    <React.Fragment key={row.recordId}>
                        <tr className="hover:bg-slate-50 group">
                        <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-lg bg-slate-100`}>
                                {getCategoryIcon(row.category)}
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-slate-800">{row.name}</div>
                                <div className="text-[10px] text-slate-400 uppercase">{row.category}</div>
                            </div>
                            <button 
                                onClick={() => toggleRowNote(row.recordId)}
                                className={`p-1.5 rounded transition-colors ${hasNote ? 'text-blue-500 bg-blue-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                                title="添加交易备注"
                            >
                                <MessageSquare size={16} fill={hasNote ? "currentColor" : "none"} />
                            </button>
                            </div>
                        </td>
                        <td className="p-4">
                            <input 
                            type="number" step="0.001" placeholder="0.000"
                            className={`w-full text-right px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none ${isCashLike ? 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed' : 'border-slate-200'}`}
                            value={isCashLike ? '1.000' : row.price} 
                            onChange={e => !isCashLike && updateRow(idx, 'price', e.target.value)}
                            disabled={isCashLike} 
                            />
                        </td>
                        <td className="p-4 bg-blue-50/30 relative">
                            <div className="flex items-center gap-2">
                                {/* Buy/Sell Toggle */}
                                <div className="flex bg-white rounded-md border border-blue-200 p-0.5 shrink-0">
                                    <button 
                                        onClick={() => updateRow(idx, 'transactionType', 'buy')}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded ${row.transactionType === 'buy' ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        买入
                                    </button>
                                    <button 
                                        onClick={() => updateRow(idx, 'transactionType', 'sell')}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded ${row.transactionType === 'sell' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        卖出
                                    </button>
                                </div>
                                <input 
                                    type="number" step={quantityStep} placeholder="0"
                                    className={`w-full text-right px-2 py-1 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium ${row.transactionType === 'sell' ? 'text-rose-600' : 'text-blue-700'}`}
                                    value={row.quantityChange} 
                                    onChange={e => updateRow(idx, 'quantityChange', e.target.value)}
                                />
                            </div>
                            
                            {isCashLike && Math.abs(impliedProfit) > 0.01 && (
                                <div className={`text-[10px] text-right mt-1 font-medium ${impliedProfit > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {impliedProfit > 0 ? '利息/收益 +' : '费用 -'}{Math.abs(impliedProfit).toLocaleString()}
                                </div>
                            )}
                        </td>
                        <td className="p-4 bg-rose-50/30">
                            <input 
                            type="number" step="0.01" placeholder="0.00"
                            className={`w-full text-right px-2 py-1 border border-rose-200 rounded focus:ring-2 focus:ring-rose-500 outline-none font-medium ${row.transactionType === 'sell' ? 'text-rose-600' : 'text-rose-700'}`}
                            value={row.costChange} onChange={e => updateRow(idx, 'costChange', e.target.value)}
                            />
                        </td>
                        <td className="p-4 text-right text-slate-600">
                            <div className="font-bold">{currentQ.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                            {row.prevQuantity > 0 && <div className="text-[10px] text-slate-400">前: {row.prevQuantity.toLocaleString()}</div>}
                        </td>
                        <td className="p-4 text-right font-bold text-slate-800">
                            ¥{currentVal.toLocaleString(undefined, {maximumFractionDigits: 0})}
                        </td>
                        <td className="p-4 text-center">
                            <button onClick={() => removeRow(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                        </td>
                        </tr>
                        {isExpanded && (
                             <tr className="bg-slate-50/50">
                                <td colSpan={7} className="px-4 pb-4 pt-1 border-b border-slate-100">
                                    <div className="flex items-start gap-2">
                                        <MessageSquare size={16} className="text-slate-400 mt-2 shrink-0" />
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">该笔资产变动备注</label>
                                            <input 
                                                className="w-full text-sm bg-white border border-slate-200 rounded px-3 py-2 text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                                placeholder="例如：看好后市加仓；急需资金卖出..."
                                                value={row.note}
                                                onChange={e => updateRow(idx, 'note', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </td>
                             </tr>
                        )}
                    </React.Fragment>
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
          onClick={() => handleInitEntry()}
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
                       <button onClick={() => handleInitEntry(s.id)} disabled={loadingDetails} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
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
