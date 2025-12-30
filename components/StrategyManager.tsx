import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, Edit2, AlertCircle, Check, History, Copy, Calendar, FileText, ChevronRight, BookOpen, Save, X, Search } from 'lucide-react';
import { StrategyVersion, StrategyTarget, Asset } from '../types';
import { generateId, StorageService } from '../services/storageService';

interface StrategyManagerProps {
  strategies: StrategyVersion[]; 
  assets: Asset[]; // Added assets prop
  onUpdate: (versions: StrategyVersion[]) => void;
}

// Curated preset colors
const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', 
  '#f97316', '#14b8a6', '#84cc16', '#64748b',
];

const StrategyManager: React.FC<StrategyManagerProps> = ({ strategies: versions, assets, onUpdate }) => {
  // State
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  
  // Meta Form State
  const [metaName, setMetaName] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [metaDate, setMetaDate] = useState('');

  // Item Form State
  const [itemAssetId, setItemAssetId] = useState('');
  const [itemModule, setItemModule] = useState('');
  const [itemName, setItemName] = useState(''); // This will be auto-filled or read-only mostly
  const [itemWeight, setItemWeight] = useState('');
  const [itemColor, setItemColor] = useState(PRESET_COLORS[0]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Initialize view
  useEffect(() => {
    if (versions.length > 0 && !activeVersionId) {
      // Default to active one, or the most recent one
      const active = versions.find(v => v.status === 'active');
      setActiveVersionId(active ? active.id : versions[0].id);
    }
  }, [versions]);

  const currentVersion = versions.find(v => v.id === activeVersionId);
  const isCurrentActive = currentVersion?.status === 'active';

  // --- Version Management ---

  const handleCreateNewVersion = () => {
    // Clone the current active one or create fresh
    const base = versions.find(v => v.status === 'active') || versions[versions.length - 1];
    
    let newVersion: StrategyVersion;
    
    if (base) {
      newVersion = {
        id: generateId(),
        name: `${base.name} (2025修订)`,
        description: base.description, // Inherit the constitution
        startDate: new Date().toISOString().slice(0, 10),
        status: 'active',
        items: base.items.map(item => ({...item})) // Deep copy items
      };
    } else {
      newVersion = StorageService.createDefaultStrategy();
    }

    // Archive the old active one
    const updatedVersions = versions.map(v => 
      v.status === 'active' ? { ...v, status: 'archived' as const } : v
    );

    onUpdate([...updatedVersions, newVersion]);
    setActiveVersionId(newVersion.id);
    // Auto enter edit mode for the new policy
    setMetaName(newVersion.name);
    setMetaDesc(newVersion.description);
    setMetaDate(newVersion.startDate);
    setIsEditingMeta(true);
  };

  const handleDeleteVersion = (id: string) => {
    if (confirm('删除此策略版本？如果已有快照使用了此版本，可能会导致历史数据显示异常。')) {
      const updated = versions.filter(v => v.id !== id);
      onUpdate(updated);
      if (activeVersionId === id) setActiveVersionId(null);
    }
  };

  const handleSaveMeta = () => {
    if (!currentVersion) return;
    const updated = versions.map(v => 
      v.id === currentVersion.id 
        ? { ...v, name: metaName, description: metaDesc, startDate: metaDate }
        : v
    );
    onUpdate(updated);
    setIsEditingMeta(false);
  };

  // --- Item Management ---

  const openItemForm = (item?: StrategyTarget) => {
    if (item) {
      setEditingItemId(item.id);
      setItemAssetId(item.assetId);
      setItemModule(item.module);
      setItemName(item.targetName);
      setItemWeight(item.targetWeight.toString());
      setItemColor(item.color);
    } else {
      setEditingItemId(null);
      setItemAssetId('');
      setItemModule('');
      setItemName('');
      setItemWeight('');
      setItemColor(PRESET_COLORS[0]);
    }
    setIsAddingItem(true);
  };

  const handleAssetSelect = (assetId: string) => {
    setItemAssetId(assetId);
    const asset = assets.find(a => a.id === assetId);
    if (asset) {
      setItemName(asset.name);
      // Removed auto-fill logic for module to allow custom user definition (e.g. "Survival Layer")
    }
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVersion) return;
    if (!itemAssetId) {
        alert("请选择一个资产标的");
        return;
    }

    const weightNum = parseFloat(itemWeight);
    if (isNaN(weightNum) || weightNum <= 0) return;

    const newItem: StrategyTarget = {
      id: editingItemId || generateId(), 
      assetId: itemAssetId, // Link to global asset
      module: itemModule,
      targetName: itemName, // Cache name
      targetWeight: weightNum,
      color: itemColor
    };

    let newItems = [...currentVersion.items];
    if (editingItemId) {
      newItems = newItems.map(i => i.id === editingItemId ? newItem : i);
    } else {
      // Check for duplicates
      if (newItems.some(i => i.assetId === itemAssetId)) {
          alert("该资产已存在于策略中");
          return;
      }
      newItems.push(newItem);
    }

    const updatedVersions = versions.map(v => 
      v.id === currentVersion.id ? { ...v, items: newItems } : v
    );
    onUpdate(updatedVersions);
    setIsAddingItem(false);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!currentVersion || !confirm('移除此配置项？')) return;
    const updatedVersions = versions.map(v => 
      v.id === currentVersion.id ? { ...v, items: v.items.filter(i => i.id !== itemId) } : v
    );
    onUpdate(updatedVersions);
  };

  // Calculations
  const totalWeight = currentVersion ? currentVersion.items.reduce((sum, i) => sum + i.targetWeight, 0) : 0;

  if (versions.length === 0) {
    return (
       <div className="flex flex-col items-center justify-center h-96 text-center">
        <BookOpen size={64} className="text-blue-200 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 mb-3">建立您的第一份投资宪法</h2>
        <p className="text-slate-500 max-w-md mb-8">
          投资不是随机的买卖，而是基于既定规则的长期博弈。
          <br/>创建一个版本，写下您的核心原则。
        </p>
        <button 
          onClick={handleCreateNewVersion}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all transform hover:scale-105"
        >
          创建初始策略
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-20 items-start">
      
      {/* Left Sidebar: Version History */}
      <div className="w-full lg:w-1/4 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <History size={18} className="text-slate-400" />
              版本时间线
            </h3>
            <button 
              onClick={handleCreateNewVersion}
              className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1 shadow-sm"
            >
              <Copy size={12} />
              修订
            </button>
          </div>
          
          <div className="space-y-3">
            {versions.sort((a,b) => (b.startDate || '').localeCompare(a.startDate || '')).map(v => (
              <div 
                key={v.id}
                onClick={() => setActiveVersionId(v.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all relative ${
                  activeVersionId === v.id 
                    ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' 
                    : 'bg-white border-slate-100 hover:border-blue-100 hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-bold text-sm ${activeVersionId === v.id ? 'text-blue-800' : 'text-slate-700'}`}>
                    {v.name}
                  </span>
                  {v.status === 'active' && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={10} />
                  <span>{v.startDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Main: Detail View */}
      <div className="w-full lg:w-3/4">
        {currentVersion && (
          <div className="space-y-8">
            
            {/* Header / Meta / Policy Document */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
               {/* Header Bar */}
               <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                       <BookOpen size={20} className="text-blue-600"/>
                       投资策略说明书 (IPS)
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      版本: {currentVersion.name} &nbsp;|&nbsp; 生效: {currentVersion.startDate} &nbsp;|&nbsp; 状态: {currentVersion.status === 'active' ? '执行中' : '已归档'}
                    </p>
                  </div>
                  
                  {isCurrentActive && !isEditingMeta && (
                     <button 
                      onClick={() => {
                        setMetaName(currentVersion.name);
                        setMetaDesc(currentVersion.description);
                        setMetaDate(currentVersion.startDate);
                        setIsEditingMeta(true);
                      }}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <Edit2 size={16} />
                      编辑文档
                    </button>
                  )}
               </div>

               {/* Document Content */}
               <div className="p-6 md:p-8">
                  {!isEditingMeta ? (
                    <article className="prose prose-slate prose-sm md:prose-base max-w-none">
                       {currentVersion.description ? (
                         <ReactMarkdown 
                            components={{
                              h1: ({children}) => <h1 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">{children}</h1>,
                              h2: ({children}) => <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3">{children}</h2>,
                              h3: ({children}) => <h3 className="text-lg font-bold text-slate-700 mt-4 mb-2">{children}</h3>,
                              ul: ({children}) => <ul className="list-disc pl-5 space-y-1 my-2 text-slate-700">{children}</ul>,
                              li: ({children}) => <li className="pl-1">{children}</li>,
                              p: ({children}) => <p className="mb-4 text-slate-600 leading-relaxed">{children}</p>,
                              blockquote: ({children}) => <blockquote className="border-l-4 border-blue-200 pl-4 py-1 my-4 bg-blue-50/50 rounded-r text-slate-700 italic">{children}</blockquote>,
                              strong: ({children}) => <strong className="font-bold text-slate-900">{children}</strong>
                            }}
                         >
                           {currentVersion.description}
                         </ReactMarkdown>
                       ) : (
                         <div className="text-slate-400 italic text-center py-8">
                           暂无策略文档。点击右上角“编辑”撰写您的投资宪法。
                         </div>
                       )}
                    </article>
                  ) : (
                    <div className="space-y-4 animate-in fade-in">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">策略版本名称</label>
                          <input 
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={metaName} onChange={e => setMetaName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">生效日期</label>
                          <input 
                            type="date"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={metaDate} onChange={e => setMetaDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                           <label className="block text-xs font-bold text-slate-500">说明书内容 (支持 Markdown)</label>
                           <a href="https://markdown.com.cn/basic-syntax/" target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">Markdown 语法参考</a>
                        </div>
                        <textarea 
                          className="w-full px-4 py-3 border border-slate-200 rounded-lg h-96 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                          placeholder="# 我的投资原则..."
                          value={metaDesc} onChange={e => setMetaDesc(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <button 
                          onClick={() => setIsEditingMeta(false)} 
                          className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                        >
                          <X size={16} /> 取消
                        </button>
                        <button 
                          onClick={handleSaveMeta} 
                          className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Save size={16} /> 保存文档
                        </button>
                      </div>
                    </div>
                  )}
               </div>
            </div>

            {/* Quantitative Allocation Section */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-50 px-3 text-sm font-medium text-slate-500">具体的资产配置 (Quantitative)</span>
                </div>
            </div>

            {/* Allocation Warning */}
            {totalWeight !== 100 && (
              <div className={`p-4 rounded-lg flex items-center gap-3 ${totalWeight > 100 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                <AlertCircle size={20} />
                <span className="font-bold text-sm">当前配置总比例: {totalWeight.toFixed(1)}% (建议调整至 100%)</span>
              </div>
            )}

            {/* Allocation Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">目标持仓明细</h3>
                {isCurrentActive && (
                  <button 
                    onClick={() => openItemForm()}
                    className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus size={16} />
                    添加标的
                  </button>
                )}
              </div>
              
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase">
                    <th className="p-4 font-semibold">模块 / 类别</th>
                    <th className="p-4 font-semibold">具体标的</th>
                    <th className="p-4 font-semibold">目标权重</th>
                    <th className="p-4 font-semibold">图表颜色</th>
                    {isCurrentActive && <th className="p-4 font-semibold text-right">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentVersion.items.length === 0 ? (
                     <tr><td colSpan={5} className="p-8 text-center text-slate-400">尚未配置任何资产标的。</td></tr>
                  ) : (
                    currentVersion.items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-600 text-sm font-medium">{item.module}</td>
                        <td className="p-4 font-bold text-slate-800">{item.targetName}</td>
                        <td className="p-4 text-slate-800">
                          <span className="bg-slate-100 px-2 py-1 rounded text-sm font-mono">{item.targetWeight}%</span>
                        </td>
                        <td className="p-4">
                           <div className="w-6 h-6 rounded-full border border-slate-200" style={{backgroundColor: item.color}}></div>
                        </td>
                        {isCurrentActive && (
                          <td className="p-4 text-right">
                             <div className="flex justify-end gap-2">
                                <button onClick={() => openItemForm(item)} className="p-1.5 text-slate-400 hover:text-blue-600 border border-slate-200 bg-white rounded shadow-sm">
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 bg-white rounded shadow-sm">
                                  <Trash2 size={14} />
                                </button>
                             </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

             {/* Delete Version Button */}
             <div className="flex justify-end pt-4">
                <button 
                  onClick={() => handleDeleteVersion(currentVersion.id)}
                  className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} /> 删除此版本 (慎用)
                </button>
             </div>

          </div>
        )}
      </div>

      {/* Item Modal Form */}
      {isAddingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
             <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingItemId ? '编辑配置' : '添加配置'}</h3>
              <button onClick={() => setIsAddingItem(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
               
               {/* New Asset Selector */}
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">选择资产标的</label>
                <div className="relative">
                    <select 
                        required
                        className="w-full appearance-none px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        value={itemAssetId}
                        onChange={e => handleAssetSelect(e.target.value)}
                    >
                        <option value="">-- 请选择资产 --</option>
                        {assets.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                        ))}
                    </select>
                    <ChevronRight className="absolute right-3 top-2.5 text-slate-400 rotate-90 pointer-events-none" size={16} />
                </div>
                {assets.length === 0 && (
                    <div className="text-xs text-red-500 mt-1">
                        资产库为空，请先在“资产库”页面添加资产。
                    </div>
                )}
               </div>

               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">模块/策略类别</label>
                <input 
                  type="text" required placeholder="如：生存层 / 结构层 / 核心持仓"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={itemModule} onChange={e => setItemModule(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1">用于将不同资产进行分组统计</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">目标权重 (%)</label>
                <input 
                  type="number" required min="0" max="100" step="0.1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={itemWeight} onChange={e => setItemWeight(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">显示颜色</label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c} type="button"
                      onClick={() => setItemColor(c)}
                      style={{backgroundColor: c}}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${itemColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''}`}
                    >
                      {itemColor === c && <Check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsAddingItem(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50">取消</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyManager;