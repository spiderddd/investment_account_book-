import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, Edit2, AlertCircle, Check, History, Copy, Calendar, FileText, ChevronRight, BookOpen, Save, X, Layers, Layout, ArrowDown } from 'lucide-react';
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

// Presets based on the "Four-Tier Defense System"
const MODULE_PRESETS = [
  "第一层：秩序底线 (现金流/高股息)",
  "中间层：能源底座 (资源/垄断)",
  "第二层：战略资源 (稀缺/反制)",
  "第三层：生存与军工 (科技/安全)",
  "卫星持仓 (机动配置)"
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

  // --- Grouping Logic ---
  const groupedItems = useMemo(() => {
    if (!currentVersion) return [];
    
    const groups: Record<string, { items: StrategyTarget[], totalWeight: number }> = {};
    
    currentVersion.items.forEach(item => {
        const key = item.module || '未分类模块';
        if (!groups[key]) {
            groups[key] = { items: [], totalWeight: 0 };
        }
        groups[key].items.push(item);
        groups[key].totalWeight += item.targetWeight;
    });

    // Sort items within groups by weight desc
    Object.values(groups).forEach(g => {
        g.items.sort((a, b) => b.targetWeight - a.targetWeight);
    });

    // Convert to array and sort groups. 
    // If name contains "第X层", try to sort intelligently, otherwise alphabetical or by weight
    return Object.entries(groups).map(([name, data]) => ({
        name,
        ...data
    })).sort((a, b) => {
        // Custom sort for the manifesto layers if present
        const tierOrder = ["第一层", "中间层", "第二层", "第三层"];
        const idxA = tierOrder.findIndex(t => a.name.includes(t));
        const idxB = tierOrder.findIndex(t => b.name.includes(t));
        
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        
        return b.totalWeight - a.totalWeight; // Fallback to weight desc
    });
  }, [currentVersion]);

  // --- Version Management ---

  const handleCreateNewVersion = () => {
    // Clone the current active one or create fresh
    const base = versions.find(v => v.status === 'active') || versions[versions.length - 1];
    
    let newVersion: StrategyVersion;
    
    if (base) {
      newVersion = {
        id: generateId(),
        name: `${base.name} (修订版)`,
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

  const openItemForm = (item?: StrategyTarget, presetModule?: string) => {
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
      setItemModule(presetModule || (groupedItems.length > 0 ? groupedItems[0].name : MODULE_PRESETS[0]));
      setItemName('');
      setItemWeight('');
      setItemColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    }
    setIsAddingItem(true);
  };

  const handleAssetSelect = (assetId: string) => {
    setItemAssetId(assetId);
    const asset = assets.find(a => a.id === assetId);
    if (asset) {
      setItemName(asset.name);
      // Try to auto-guess module based on type? No, leave to user.
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
    <div className="flex flex-col lg:flex-row gap-6 pb-20 items-start h-[calc(100vh-100px)]">
      
      {/* Left Sidebar: Version History */}
      <div className="w-full lg:w-1/4 space-y-4 shrink-0">
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

      {/* Right Main: Detail View - Scrollable */}
      <div className="w-full lg:w-3/4 flex flex-col h-full overflow-hidden">
        {currentVersion && (
          <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2 pb-10 scrollbar-thin scrollbar-thumb-slate-200">
            
            {/* Header / Meta / Policy Document */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden shrink-0">
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
                              h2: ({children}) => <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3 flex items-center gap-2"><div className="w-1.5 h-6 bg-blue-500 rounded"></div>{children}</h2>,
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
            <div className="relative shrink-0">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-50 px-3 text-sm font-medium text-slate-500 flex items-center gap-2">
                    <Layout size={16} /> 资产架构 (四级防御体系)
                  </span>
                </div>
            </div>

            {/* Allocation Warning */}
            {totalWeight !== 100 && (
              <div className={`p-4 rounded-lg flex items-center gap-3 shrink-0 ${totalWeight > 100 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                <AlertCircle size={20} />
                <span className="font-bold text-sm">当前配置总比例: {totalWeight.toFixed(1)}% (建议调整至 100%)</span>
              </div>
            )}

            {/* Grouped Allocation Cards */}
            <div className="space-y-4">
              {groupedItems.length === 0 ? (
                 <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    <Layers size={48} className="mx-auto mb-4 opacity-20" />
                    <p>尚未配置任何资产架构。</p>
                    {isCurrentActive && (
                        <button 
                            onClick={() => openItemForm()}
                            className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors"
                        >
                            添加第一层防御资产
                        </button>
                    )}
                 </div>
              ) : (
                  groupedItems.map(group => (
                    <div key={group.name} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Group Header */}
                        <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-1.5 rounded border border-slate-200 text-slate-500">
                                    <Layers size={16} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-sm">{group.name}</h3>
                                    <div className="text-[10px] text-slate-500">
                                        包含 {group.items.length} 个标的
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-slate-400 uppercase">层级总仓位</span>
                                    <span className="font-bold text-blue-700 text-lg">{group.totalWeight.toFixed(1)}%</span>
                                </div>
                                {isCurrentActive && (
                                    <button 
                                        onClick={() => openItemForm(undefined, group.name)}
                                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                                        title="在该层级添加资产"
                                    >
                                        <Plus size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Items Grid */}
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {group.items.map(item => (
                                <div key={item.id} className="border border-slate-100 rounded-lg p-3 hover:shadow-md transition-shadow bg-white group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-8 rounded-full" style={{backgroundColor: item.color}}></div>
                                            <div>
                                                <div className="font-bold text-slate-700 text-sm">{item.targetName}</div>
                                                <div className="text-[10px] text-slate-400">目标权重</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-slate-800">{item.targetWeight}%</div>
                                            <div className="text-[10px] text-slate-400">
                                                (占该层级 {(item.targetWeight / group.totalWeight * 100).toFixed(0)}%)
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {isCurrentActive && (
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-slate-100 shadow-sm rounded flex">
                                             <button onClick={() => openItemForm(item)} className="p-1.5 text-slate-400 hover:text-blue-600 border-r border-slate-100">
                                                <Edit2 size={12} />
                                             </button>
                                             <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-600">
                                                <Trash2 size={12} />
                                             </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                  ))
              )}
            </div>

            {/* Add New Layer Button (implicitly adds item to new layer) */}
            {isCurrentActive && groupedItems.length > 0 && (
                <div className="text-center pt-2 pb-6">
                    <button 
                        onClick={() => openItemForm()}
                        className="inline-flex items-center gap-2 px-6 py-2 bg-white border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-all font-medium"
                    >
                        <Plus size={18} />
                        添加新的防御层级 / 资产
                    </button>
                </div>
            )}

             {/* Delete Version Button */}
             <div className="flex justify-end pt-4 pb-8 border-t border-slate-100">
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
               
               {/* Asset Selector */}
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

               {/* Module/Layer Selector with Presets */}
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">所属层级 / 模块</label>
                <div className="relative">
                    <input 
                    type="text" required placeholder="如：第一层：秩序底线"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-8"
                    value={itemModule} onChange={e => setItemModule(e.target.value)}
                    list="module-presets"
                    />
                     <datalist id="module-presets">
                        {MODULE_PRESETS.map(p => <option key={p} value={p} />)}
                        {/* Also add existing modules in this strategy to the list */}
                        {groupedItems.map(g => <option key={g.name} value={g.name} />)}
                    </datalist>
                    <ArrowDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none opacity-50" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">输入或选择所属的防御层级。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">目标权重 (%)</label>
                <div className="flex items-center gap-2">
                     <input 
                        type="number" required min="0" max="100" step="0.1"
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={itemWeight} onChange={e => setItemWeight(e.target.value)}
                    />
                    <span className="text-sm text-slate-500 font-medium">占总仓位</span>
                </div>
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