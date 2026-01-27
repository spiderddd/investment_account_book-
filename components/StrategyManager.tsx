import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, Edit2, AlertCircle, Check, History, Copy, Calendar, BookOpen, Save, X, Layers, Layout, ChevronRight, GripVertical, Calculator, ArrowRight } from 'lucide-react';
import { StrategyVersion, StrategyTarget, Asset } from '../types';
import { generateId, StorageService } from '../services/storageService';

interface StrategyManagerProps {
  strategies: StrategyVersion[]; 
  assets: Asset[]; 
  onUpdate: (versions: StrategyVersion[]) => void;
}

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', 
  '#f97316', '#14b8a6', '#84cc16', '#64748b',
];

// Helper to clean floats
const strip = (num: number) => parseFloat(num.toFixed(2));

interface LayerData {
    name: string; // Module Name
    weight: number; // 0-100 (The weight of this layer in the total portfolio)
    items: (StrategyTarget & { innerWeight: number })[]; // Items with their relative weight inside the layer
}

const StrategyManager: React.FC<StrategyManagerProps> = ({ strategies: versions, assets, onUpdate }) => {
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  
  // Meta Form State
  const [metaName, setMetaName] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [metaDate, setMetaDate] = useState('');

  // Local editing state for the active version's items (to prevent jitter)
  // We parse the flat list into layers on load, and flatten it back on save.
  const [localLayers, setLocalLayers] = useState<LayerData[]>([]);

  // Item Adding State
  const [addingToLayer, setAddingToLayer] = useState<string | null>(null); // Layer Name
  const [newAssetId, setNewAssetId] = useState('');

  // Initialization
  useEffect(() => {
    if (versions.length > 0 && !activeVersionId) {
      const active = versions.find(v => v.status === 'active');
      setActiveVersionId(active ? active.id : versions[0].id);
    }
  }, [versions]);

  const currentVersion = versions.find(v => v.id === activeVersionId);
  const isCurrentActive = currentVersion?.status === 'active';

  // --- Parsing Logic: Flat Items -> Hierarchical Layers ---
  useEffect(() => {
    if (!currentVersion) return;

    const groups: Record<string, { totalWeight: number, items: StrategyTarget[] }> = {};
    
    // 1. Group by Module
    currentVersion.items.forEach(item => {
        const key = item.module || '默认层级';
        if (!groups[key]) groups[key] = { totalWeight: 0, items: [] };
        groups[key].items.push(item);
        groups[key].totalWeight += item.targetWeight;
    });

    // 2. Convert to LayerData
    const layers: LayerData[] = Object.entries(groups).map(([name, data]) => {
        const layerWeight = strip(data.totalWeight);
        
        const itemsWithInner = data.items.map(item => ({
            ...item,
            // Calculate inner weight: (Absolute / LayerTotal) * 100
            innerWeight: layerWeight > 0 ? strip((item.targetWeight / layerWeight) * 100) : 0
        })).sort((a, b) => b.innerWeight - a.innerWeight);

        return {
            name,
            weight: layerWeight,
            items: itemsWithInner
        };
    });

    // 3. Sort Layers (Custom order logic)
    const tierOrder = ["第一层", "中间层", "第二层", "第三层", "卫星"];
    layers.sort((a, b) => {
        const idxA = tierOrder.findIndex(t => a.name.includes(t));
        const idxB = tierOrder.findIndex(t => b.name.includes(t));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return b.weight - a.weight;
    });

    setLocalLayers(layers);
  }, [currentVersion]);

  // --- Core: Flatten & Save Logic ---
  const saveLayersToVersion = (layers: LayerData[]) => {
      if (!currentVersion) return;

      const newItems: StrategyTarget[] = [];
      
      layers.forEach(layer => {
          layer.items.forEach(item => {
              // Recalculate Absolute Weight: LayerWeight * InnerWeight
              const absoluteWeight = strip((layer.weight / 100) * (item.innerWeight / 100) * 100);
              
              newItems.push({
                  id: item.id,
                  assetId: item.assetId,
                  module: layer.name, // The layer name IS the module
                  targetName: item.targetName,
                  targetWeight: absoluteWeight,
                  color: item.color
              });
          });
      });

      const updatedVersions = versions.map(v => 
        v.id === currentVersion.id ? { ...v, items: newItems } : v
      );
      
      // We assume optimistic update, but we also update local state to reflect the calculation results (rounding etc)
      onUpdate(updatedVersions);
  };

  // --- Handlers: Layer Manipulation ---

  const handleUpdateLayerName = (oldName: string, newName: string) => {
      if (!newName.trim()) return;
      const newLayers = localLayers.map(l => l.name === oldName ? { ...l, name: newName } : l);
      setLocalLayers(newLayers); // Optimistic UI
      saveLayersToVersion(newLayers);
  };

  const handleUpdateLayerWeight = (layerName: string, newWeightStr: string) => {
      const newWeight = parseFloat(newWeightStr);
      if (isNaN(newWeight) || newWeight < 0) return;
      
      const newLayers = localLayers.map(l => l.name === layerName ? { ...l, weight: newWeight } : l);
      setLocalLayers(newLayers);
      saveLayersToVersion(newLayers);
  };

  const handleAddLayer = () => {
      const name = prompt("请输入新层级名称 (如：第四层：机动战队)");
      if (!name) return;
      if (localLayers.find(l => l.name === name)) { alert("层级名称已存在"); return; }
      
      const newLayers = [...localLayers, { name, weight: 0, items: [] }];
      setLocalLayers(newLayers);
      saveLayersToVersion(newLayers);
  };

  const handleDeleteLayer = (layerName: string) => {
      if(!confirm(`确定删除层级 "${layerName}" 及其所有资产配置吗？`)) return;
      const newLayers = localLayers.filter(l => l.name !== layerName);
      setLocalLayers(newLayers);
      saveLayersToVersion(newLayers);
  };

  // --- Handlers: Item Manipulation ---

  const handleUpdateInnerWeight = (layerName: string, itemId: string, newInnerStr: string) => {
      const newInner = parseFloat(newInnerStr);
      if (isNaN(newInner) || newInner < 0) return;

      const newLayers = localLayers.map(l => {
          if (l.name !== layerName) return l;
          return {
              ...l,
              items: l.items.map(i => i.id === itemId ? { ...i, innerWeight: newInner } : i)
          };
      });
      setLocalLayers(newLayers);
      saveLayersToVersion(newLayers);
  };

  const handleAddItemToLayer = (layerName: string) => {
      if (!newAssetId) return;
      const asset = assets.find(a => a.id === newAssetId);
      if (!asset) return;

      const newItem: StrategyTarget & { innerWeight: number } = {
          id: generateId(),
          assetId: asset.id,
          module: layerName,
          targetName: asset.name,
          targetWeight: 0, // Will be calculated on save
          innerWeight: 0, // Start at 0
          color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
      };

      const newLayers = localLayers.map(l => {
          if (l.name !== layerName) return l;
          if (l.items.find(i => i.assetId === asset.id)) { alert("该资产已在此层级中"); return l; }
          return { ...l, items: [...l.items, newItem] };
      });

      setLocalLayers(newLayers);
      saveLayersToVersion(newLayers);
      setAddingToLayer(null);
      setNewAssetId('');
  };

  const handleDeleteItem = (layerName: string, itemId: string) => {
      const newLayers = localLayers.map(l => {
          if (l.name !== layerName) return l;
          return { ...l, items: l.items.filter(i => i.id !== itemId) };
      });
      setLocalLayers(newLayers);
      saveLayersToVersion(newLayers);
  };


  // --- Version Meta Handlers ---
  const handleCreateNewVersion = () => {
    const base = versions.find(v => v.status === 'active') || versions[versions.length - 1];
    let newVersion: StrategyVersion;
    if (base) {
      newVersion = {
        id: generateId(),
        name: `${base.name} (修订版)`,
        description: base.description,
        startDate: new Date().toISOString().slice(0, 10),
        status: 'active',
        items: base.items.map(item => ({...item}))
      };
    } else {
      newVersion = StorageService.createDefaultStrategy();
    }
    const updatedVersions = versions.map(v => v.status === 'active' ? { ...v, status: 'archived' as const } : v);
    onUpdate([...updatedVersions, newVersion]);
    setActiveVersionId(newVersion.id);
    setMetaName(newVersion.name);
    setMetaDesc(newVersion.description);
    setMetaDate(newVersion.startDate);
    setIsEditingMeta(true);
  };

  const handleSaveMeta = () => {
    if (!currentVersion) return;
    const updated = versions.map(v => 
      v.id === currentVersion.id ? { ...v, name: metaName, description: metaDesc, startDate: metaDate } : v
    );
    onUpdate(updated);
    setIsEditingMeta(false);
  };

  const handleDeleteVersion = (id: string) => {
    if (confirm('删除此策略版本？')) {
      const updated = versions.filter(v => v.id !== id);
      onUpdate(updated);
      if (activeVersionId === id) setActiveVersionId(null);
    }
  };

  // Calculations
  const totalLayerWeight = localLayers.reduce((sum, l) => sum + l.weight, 0);

  if (versions.length === 0) {
    return (
       <div className="flex flex-col items-center justify-center h-96 text-center">
        <BookOpen size={64} className="text-blue-200 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 mb-3">建立您的第一份投资宪法</h2>
        <button onClick={handleCreateNewVersion} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all">创建初始策略</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-20 items-start h-[calc(100vh-100px)]">
      
      {/* Sidebar: Versions */}
      <div className="w-full lg:w-1/4 space-y-4 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><History size={18} className="text-slate-400" />版本时间线</h3>
            <button onClick={handleCreateNewVersion} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1 shadow-sm"><Copy size={12} />修订</button>
          </div>
          <div className="space-y-3">
            {versions.sort((a,b) => (b.startDate || '').localeCompare(a.startDate || '')).map(v => (
              <div key={v.id} onClick={() => setActiveVersionId(v.id)} className={`p-3 rounded-lg border cursor-pointer transition-all relative ${activeVersionId === v.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' : 'bg-white border-slate-100 hover:border-blue-100 hover:shadow-sm'}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-bold text-sm ${activeVersionId === v.id ? 'text-blue-800' : 'text-slate-700'}`}>{v.name}</span>
                  {v.status === 'active' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase">Active</span>}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400"><Calendar size={10} /><span>{v.startDate}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full lg:w-3/4 flex flex-col h-full overflow-hidden">
        {currentVersion && (
          <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2 pb-10 scrollbar-thin scrollbar-thumb-slate-200">
            
            {/* Header / IPS */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden shrink-0">
               <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BookOpen size={20} className="text-blue-600"/>投资策略说明书 (IPS)</h2>
                    <p className="text-xs text-slate-500 mt-1">版本: {currentVersion.name} &nbsp;|&nbsp; 状态: {currentVersion.status === 'active' ? '执行中' : '已归档'}</p>
                  </div>
                  {isCurrentActive && !isEditingMeta && (
                     <button onClick={() => { setMetaName(currentVersion.name); setMetaDesc(currentVersion.description); setMetaDate(currentVersion.startDate); setIsEditingMeta(true); }} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center gap-2 shadow-sm"><Edit2 size={16} /> 编辑文档</button>
                  )}
               </div>

               <div className="p-6 md:p-8">
                  {!isEditingMeta ? (
                    <article className="prose prose-slate prose-sm md:prose-base max-w-none">
                       {currentVersion.description ? <ReactMarkdown>{currentVersion.description}</ReactMarkdown> : <div className="text-slate-400 italic text-center py-8">暂无策略文档。</div>}
                    </article>
                  ) : (
                    <div className="space-y-4 animate-in fade-in">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">版本名称</label><input className="w-full px-3 py-2 border rounded-lg" value={metaName} onChange={e => setMetaName(e.target.value)}/></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">生效日期</label><input type="date" className="w-full px-3 py-2 border rounded-lg" value={metaDate} onChange={e => setMetaDate(e.target.value)}/></div>
                      </div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">说明书内容</label><textarea className="w-full px-4 py-3 border rounded-lg h-64 font-mono text-sm" value={metaDesc} onChange={e => setMetaDesc(e.target.value)}/></div>
                      <div className="flex justify-end gap-3"><button onClick={() => setIsEditingMeta(false)} className="px-4 py-2 border rounded-lg">取消</button><button onClick={handleSaveMeta} className="px-6 py-2 bg-slate-900 text-white rounded-lg">保存</button></div>
                    </div>
                  )}
               </div>
            </div>

            {/* Strategy Structure Header */}
            <div className="relative shrink-0 flex items-center justify-center pt-2">
                 <span className="bg-slate-50 px-4 py-1 rounded-full text-sm font-bold text-slate-600 flex items-center gap-2 border border-slate-200 shadow-sm z-10">
                    <Layout size={16} /> 资产架构配置 (双层防御体系)
                  </span>
                  <div className="absolute inset-x-0 h-px bg-slate-200 top-1/2"></div>
            </div>

            {/* Total Weight Warning */}
            <div className="flex justify-between items-center px-1">
                 <div className="text-xs font-bold text-slate-500">
                     宏观层级总仓位
                 </div>
                 <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${Math.abs(totalLayerWeight - 100) < 0.1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {Math.abs(totalLayerWeight - 100) > 0.1 && <AlertCircle size={14} />}
                    <span className="font-mono font-bold">{totalLayerWeight.toFixed(1)}%</span>
                    <span className="text-xs opacity-70">/ 100%</span>
                 </div>
            </div>

            {/* Layers List */}
            <div className="space-y-6">
                {localLayers.map(layer => {
                    const layerTotalInner = layer.items.reduce((sum, i) => sum + i.innerWeight, 0);
                    const isLayerBalanced = Math.abs(layerTotalInner - 100) < 0.1;

                    return (
                        <div key={layer.name} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group">
                            {/* Level 1: Layer Header */}
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                                    <div className="bg-white p-1.5 rounded border border-slate-200 text-slate-500 cursor-grab active:cursor-grabbing">
                                        <GripVertical size={16} />
                                    </div>
                                    <div className="flex-1">
                                        {isCurrentActive ? (
                                            <input 
                                                className="bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none font-bold text-slate-800 w-full"
                                                value={layer.name}
                                                onChange={e => handleUpdateLayerName(layer.name, e.target.value)}
                                            />
                                        ) : (
                                            <h3 className="font-bold text-slate-800">{layer.name}</h3>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                                    <span className="text-xs text-slate-400 font-medium">该层级目标仓位</span>
                                    <div className="flex items-center gap-1">
                                        {isCurrentActive ? (
                                            <input 
                                                type="number" className="w-16 text-right font-bold text-blue-700 border-b border-blue-200 focus:outline-none focus:border-blue-500 bg-transparent"
                                                value={layer.weight}
                                                onChange={e => handleUpdateLayerWeight(layer.name, e.target.value)}
                                            />
                                        ) : (
                                            <span className="font-bold text-blue-700">{layer.weight}%</span>
                                        )}
                                        <span className="text-slate-400 font-light">%</span>
                                    </div>
                                </div>
                                
                                {isCurrentActive && (
                                    <button onClick={() => handleDeleteLayer(layer.name)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Level 2: Inner Items */}
                            <div className="p-4 bg-white">
                                <div className="space-y-2">
                                    {layer.items.length === 0 && (
                                        <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-100 rounded-lg">
                                            该层级暂无资产
                                        </div>
                                    )}
                                    
                                    {layer.items.map(item => (
                                        <div key={item.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group/item border border-transparent hover:border-slate-100 transition-colors">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="w-2 h-8 rounded-full" style={{backgroundColor: item.color}}></div>
                                                <div>
                                                    <div className="font-medium text-slate-700 text-sm">{item.targetName}</div>
                                                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <span>全局绝对权重:</span>
                                                        <span className="font-mono text-slate-600">{(layer.weight * item.innerWeight / 100).toFixed(2)}%</span>
                                                        {isCurrentActive && <span className="text-slate-300">(自动计算)</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-slate-400">层内占比</span>
                                                    <div className="flex items-center gap-1">
                                                        {isCurrentActive ? (
                                                            <input 
                                                                type="number" className="w-12 text-right font-bold text-slate-700 border-b border-slate-200 focus:outline-none focus:border-blue-500 bg-transparent text-sm"
                                                                value={item.innerWeight}
                                                                onChange={e => handleUpdateInnerWeight(layer.name, item.id, e.target.value)}
                                                            />
                                                        ) : (
                                                            <span className="font-bold text-slate-700 text-sm">{item.innerWeight}%</span>
                                                        )}
                                                        <span className="text-xs text-slate-400">%</span>
                                                    </div>
                                                </div>
                                                
                                                {isCurrentActive && (
                                                    <button onClick={() => handleDeleteItem(layer.name, item.id)} className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Inner Footer: Add & Stats */}
                                <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center">
                                    <div className="flex-1">
                                        {isCurrentActive && (
                                            addingToLayer === layer.name ? (
                                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                                    <select 
                                                        className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 max-w-[150px]"
                                                        value={newAssetId}
                                                        onChange={e => setNewAssetId(e.target.value)}
                                                        autoFocus
                                                    >
                                                        <option value="">+ 选择资产...</option>
                                                        {assets.filter(a => !layer.items.find(i => i.assetId === a.id)).map(a => (
                                                            <option key={a.id} value={a.id}>{a.name}</option>
                                                        ))}
                                                    </select>
                                                    <button onClick={() => handleAddItemToLayer(layer.name)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={!newAssetId}><Check size={14}/></button>
                                                    <button onClick={() => setAddingToLayer(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X size={14}/></button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setAddingToLayer(layer.name)} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">
                                                    <Plus size={14} /> 添加资产到此层级
                                                </button>
                                            )
                                        )}
                                    </div>
                                    <div className={`text-xs font-medium flex items-center gap-1 ${isLayerBalanced ? 'text-slate-400' : 'text-amber-600'}`}>
                                        <Calculator size={12} />
                                        层内合计: {layerTotalInner.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            
                            {/* Layer Inner Progress Bar */}
                            <div className="h-1 w-full bg-slate-100 flex">
                                {layer.items.map(item => (
                                    <div key={item.id} style={{width: `${item.innerWeight}%`, backgroundColor: item.color}} title={`${item.targetName}: ${item.innerWeight}%`}></div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {isCurrentActive && (
                    <button 
                        onClick={handleAddLayer}
                        className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-all font-bold flex flex-col items-center justify-center gap-2"
                    >
                        <Layers size={24} className="opacity-50" />
                        创建新的防御层级
                    </button>
                )}
            </div>

             {/* Delete Version Button */}
             <div className="flex justify-end pt-4 pb-8 border-t border-slate-100 mt-8">
                <button onClick={() => handleDeleteVersion(currentVersion.id)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                  <Trash2 size={12} /> 删除此版本 (慎用)
                </button>
             </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default StrategyManager;