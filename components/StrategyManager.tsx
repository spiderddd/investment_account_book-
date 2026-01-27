import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, Edit2, AlertCircle, History, Copy, Calendar, BookOpen, Save, X, Layers, Layout, Calculator } from 'lucide-react';
import { StrategyVersion, StrategyLayer, StrategyTarget, Asset } from '../types';
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

const StrategyManager: React.FC<StrategyManagerProps> = ({ strategies: versions, assets, onUpdate }) => {
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  
  // Meta Form State
  const [metaName, setMetaName] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [metaDate, setMetaDate] = useState('');

  // Modals
  const [modalLayer, setModalLayer] = useState<{ isOpen: boolean, layerId?: string, name: string, desc: string, weight: string }>({ isOpen: false, name: '', desc: '', weight: '' });
  const [modalAsset, setModalAsset] = useState<{ isOpen: boolean, layerId: string, item?: StrategyTarget, assetId: string, weight: string, note: string, color: string }>({ isOpen: false, layerId: '', assetId: '', weight: '', note: '', color: PRESET_COLORS[0] });

  // Initialization
  useEffect(() => {
    if (versions.length > 0 && !activeVersionId) {
      const active = versions.find(v => v.status === 'active');
      setActiveVersionId(active ? active.id : versions[0].id);
    }
  }, [versions]);

  const currentVersion = versions.find(v => v.id === activeVersionId);
  const isCurrentActive = currentVersion?.status === 'active';

  // --- Core: Save Logic ---
  // Unlike before, we don't need to parse/serialize layers. The object structure in `currentVersion.layers` is the truth.
  // We just need to clone and update the version object in the `versions` array.

  const updateCurrentVersion = (newLayers: StrategyLayer[]) => {
      if (!currentVersion) return;
      const updatedVersions = versions.map(v => 
        v.id === currentVersion.id ? { ...v, layers: newLayers } : v
      );
      onUpdate(updatedVersions);
  };

  // --- Handlers: Layer Modal ---
  const openLayerModal = (layer?: StrategyLayer) => {
      if (layer) {
          setModalLayer({ isOpen: true, layerId: layer.id, name: layer.name, desc: layer.description || '', weight: layer.weight.toString() });
      } else {
          setModalLayer({ isOpen: true, name: '', desc: '', weight: '' });
      }
  };

  const submitLayerModal = (e: React.FormEvent) => {
      e.preventDefault();
      const w = parseFloat(modalLayer.weight);
      if (!modalLayer.name || isNaN(w)) return;
      if (!currentVersion) return;

      let newLayers = [...currentVersion.layers];
      
      if (modalLayer.layerId) {
          // Edit
          newLayers = newLayers.map(l => l.id === modalLayer.layerId ? { 
              ...l, name: modalLayer.name, description: modalLayer.desc, weight: w 
          } : l);
      } else {
          // Add
          newLayers.push({ 
              id: generateId(), 
              name: modalLayer.name, 
              description: modalLayer.desc, 
              weight: w, 
              items: [] 
          });
      }
      
      // Sort by weight desc just to keep clean? Or keep user order? Let's sort by weight for now as per dashboard logic
      newLayers.sort((a,b) => b.weight - a.weight);

      updateCurrentVersion(newLayers);
      setModalLayer({ ...modalLayer, isOpen: false });
  };

  const handleDeleteLayer = (layerId: string) => {
      if (!confirm("确定删除该层级及其所有资产吗？")) return;
      if (!currentVersion) return;
      const newLayers = currentVersion.layers.filter(l => l.id !== layerId);
      updateCurrentVersion(newLayers);
  };


  // --- Handlers: Asset Modal ---
  const openAssetModal = (layerId: string, item?: StrategyTarget) => {
      if (item) {
          setModalAsset({ 
              isOpen: true, layerId, item, 
              assetId: item.assetId, weight: item.weight.toString(), note: item.note || '', color: item.color 
          });
      } else {
          setModalAsset({ 
              isOpen: true, layerId, 
              assetId: '', weight: '', note: '', color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)] 
          });
      }
  };

  const submitAssetModal = (e: React.FormEvent) => {
      e.preventDefault();
      const w = parseFloat(modalAsset.weight);
      if (!modalAsset.assetId || isNaN(w)) return;
      if (!currentVersion) return;
      
      const assetObj = assets.find(a => a.id === modalAsset.assetId);
      if (!assetObj) return;

      const newLayers = currentVersion.layers.map(l => {
          if (l.id !== modalAsset.layerId) return l;
          
          let newItems = [...l.items];
          if (modalAsset.item) {
              // Edit
              newItems = newItems.map(i => i.id === modalAsset.item!.id ? {
                  ...i,
                  assetId: modalAsset.assetId,
                  targetName: assetObj.name,
                  weight: w,
                  note: modalAsset.note,
                  color: modalAsset.color
              } : i);
          } else {
              // Add
              if (newItems.find(i => i.assetId === modalAsset.assetId)) { alert('该层级已包含此资产'); return l; }
              newItems.push({
                  id: generateId(),
                  assetId: modalAsset.assetId,
                  targetName: assetObj.name,
                  weight: w,
                  note: modalAsset.note,
                  color: modalAsset.color
              });
          }
          // Sort by inner weight desc
          newItems.sort((a, b) => b.weight - a.weight);
          return { ...l, items: newItems };
      });

      updateCurrentVersion(newLayers);
      setModalAsset({ ...modalAsset, isOpen: false });
  };

  const handleDeleteAsset = (layerId: string, itemId: string) => {
      if (!confirm("删除此资产配置？")) return;
      if (!currentVersion) return;
      const newLayers = currentVersion.layers.map(l => {
          if (l.id !== layerId) return l;
          return { ...l, items: l.items.filter(i => i.id !== itemId) };
      });
      updateCurrentVersion(newLayers);
  };


  // --- Meta Handlers ---
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
            layers: JSON.parse(JSON.stringify(base.layers)) // Deep copy
        };
    } else {
        newVersion = StorageService.createDefaultStrategy();
    }
    const updated = versions.map(v => v.status === 'active' ? { ...v, status: 'archived' as const } : v);
    onUpdate([...updated, newVersion]);
    setActiveVersionId(newVersion.id);
  };

  const handleSaveMeta = () => {
    if (!currentVersion) return;
    const updated = versions.map(v => 
      v.id === currentVersion.id ? { ...v, name: metaName, description: metaDesc, startDate: metaDate } : v
    );
    onUpdate(updated);
    setIsEditingMeta(false);
  };

  const totalLayerWeight = currentVersion ? currentVersion.layers.reduce((sum, l) => sum + l.weight, 0) : 0;

  if (versions.length === 0) {
      return <div className="p-10 text-center"><button onClick={handleCreateNewVersion} className="bg-blue-600 text-white px-6 py-2 rounded">初始化策略</button></div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-20 items-start h-[calc(100vh-100px)]">
      
      {/* Sidebar */}
      <div className="w-full lg:w-1/4 space-y-4 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><History size={18} className="text-slate-400" />版本时间线</h3>
            <button onClick={handleCreateNewVersion} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Copy size={12} />修订</button>
          </div>
          <div className="space-y-3">
            {versions.sort((a,b) => b.startDate.localeCompare(a.startDate)).map(v => (
              <div key={v.id} onClick={() => setActiveVersionId(v.id)} className={`p-3 rounded-lg border cursor-pointer ${activeVersionId === v.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-bold text-sm ${activeVersionId === v.id ? 'text-blue-800' : 'text-slate-700'}`}>{v.name}</span>
                  {v.status === 'active' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">Active</span>}
                </div>
                <div className="text-xs text-slate-400">{v.startDate}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full lg:w-3/4 flex flex-col h-full overflow-hidden">
        {currentVersion && (
          <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2 pb-10 scrollbar-thin scrollbar-thumb-slate-200">
            
            {/* IPS Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
               <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BookOpen size={20} className="text-blue-600"/>投资策略说明书</h2>
                    <p className="text-xs text-slate-500 mt-1">{currentVersion.name}</p>
                  </div>
                  {isCurrentActive && !isEditingMeta && (
                     <button onClick={() => { setMetaName(currentVersion.name); setMetaDesc(currentVersion.description); setMetaDate(currentVersion.startDate); setIsEditingMeta(true); }} className="px-4 py-2 bg-white border border-slate-200 text-sm rounded hover:text-blue-600 flex gap-2"><Edit2 size={16} /> 编辑</button>
                  )}
               </div>
               <div className="p-6">
                  {isEditingMeta ? (
                    <div className="space-y-4">
                       <input className="w-full px-3 py-2 border rounded" value={metaName} onChange={e => setMetaName(e.target.value)} placeholder="版本名称"/>
                       <textarea className="w-full px-3 py-2 border rounded h-32" value={metaDesc} onChange={e => setMetaDesc(e.target.value)} placeholder="Markdown 内容"/>
                       <div className="flex justify-end gap-2">
                           <button onClick={() => setIsEditingMeta(false)} className="px-3 py-1 border rounded">取消</button>
                           <button onClick={handleSaveMeta} className="px-3 py-1 bg-slate-900 text-white rounded">保存</button>
                       </div>
                    </div>
                  ) : (
                    <article className="prose prose-sm max-w-none text-slate-600">
                       <ReactMarkdown>{currentVersion.description || '*暂无文档*'}</ReactMarkdown>
                    </article>
                  )}
               </div>
            </div>

            {/* Architecture Section */}
            <div>
                <div className="flex justify-between items-center mb-4 px-1">
                     <span className="flex items-center gap-2 font-bold text-slate-700"><Layout size={18}/> 资产架构配置</span>
                     <div className={`px-3 py-1 rounded-lg border flex items-center gap-2 ${Math.abs(totalLayerWeight - 100) < 0.1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {Math.abs(totalLayerWeight - 100) > 0.1 && <AlertCircle size={14} />}
                        <span className="text-xs font-bold">总仓位: {totalLayerWeight.toFixed(1)}%</span>
                     </div>
                </div>

                <div className="space-y-6">
                    {currentVersion.layers.map(layer => (
                        <div key={layer.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            {/* Layer Header */}
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-slate-800">{layer.name}</h3>
                                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{layer.weight}%</span>
                                    </div>
                                    {layer.description && <p className="text-xs text-slate-500 mt-1">{layer.description}</p>}
                                </div>
                                {isCurrentActive && (
                                    <div className="flex gap-2">
                                        <button onClick={() => openLayerModal(layer)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Edit2 size={16}/></button>
                                        <button onClick={() => handleDeleteLayer(layer.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={16}/></button>
                                    </div>
                                )}
                            </div>

                            {/* Assets List */}
                            <div className="p-4">
                                <div className="space-y-2">
                                    {layer.items.map(item => (
                                        <div key={item.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:border-blue-100 transition-colors bg-slate-50/50">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="w-1.5 h-8 rounded-full" style={{backgroundColor: item.color}}></div>
                                                <div>
                                                    <div className="font-bold text-sm text-slate-700">{item.targetName}</div>
                                                    {item.note && <div className="text-xs text-slate-500 mt-0.5 max-w-md">{item.note}</div>}
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-6">
                                                <div>
                                                    <div className="text-xs text-slate-400">层内占比</div>
                                                    <div className="font-bold text-slate-700">{item.weight}%</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-slate-400">全局权重</div>
                                                    <div className="font-mono text-xs text-slate-500">{(layer.weight * item.weight / 100).toFixed(1)}%</div>
                                                </div>
                                                {isCurrentActive && (
                                                    <div className="flex gap-1 ml-2">
                                                        <button onClick={() => openAssetModal(layer.id, item)} className="p-1 text-slate-300 hover:text-blue-600"><Edit2 size={14}/></button>
                                                        <button onClick={() => handleDeleteAsset(layer.id, item.id)} className="p-1 text-slate-300 hover:text-red-600"><Trash2 size={14}/></button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {isCurrentActive && (
                                    <button 
                                        onClick={() => openAssetModal(layer.id)}
                                        className="mt-4 w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-400 text-sm hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Plus size={16} /> 添加资产到 {layer.name}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {isCurrentActive && (
                        <button 
                            onClick={() => openLayerModal()}
                            className="w-full py-4 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors font-bold flex items-center justify-center gap-2"
                        >
                            <Layers size={20} /> 创建新的防御层级
                        </button>
                    )}
                </div>
            </div>

          </div>
        )}
      </div>

      {/* --- Modals --- */}
      
      {/* Layer Modal */}
      {modalLayer.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95">
                <div className="px-6 py-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">编辑防御层级</h3>
                    <button onClick={() => setModalLayer({...modalLayer, isOpen: false})}><X size={20} className="text-slate-400"/></button>
                </div>
                <form onSubmit={submitLayerModal} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">层级名称</label>
                        <input required className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="如：第一层：秩序底线" value={modalLayer.name} onChange={e => setModalLayer({...modalLayer, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">目标仓位 (%)</label>
                        <input required type="number" step="0.1" className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" value={modalLayer.weight} onChange={e => setModalLayer({...modalLayer, weight: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">备注说明</label>
                        <textarea className="w-full border rounded px-3 py-2 h-20 focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="简述该层级的战略意义..." value={modalLayer.desc} onChange={e => setModalLayer({...modalLayer, desc: e.target.value})} />
                    </div>
                    <div className="pt-2">
                        <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold">保存层级</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Asset Modal */}
      {modalAsset.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95">
                <div className="px-6 py-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">配置资产</h3>
                    <button onClick={() => setModalAsset({...modalAsset, isOpen: false})}><X size={20} className="text-slate-400"/></button>
                </div>
                <form onSubmit={submitAssetModal} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">选择资产</label>
                        <select required className="w-full border rounded px-3 py-2 bg-white" value={modalAsset.assetId} onChange={e => setModalAsset({...modalAsset, assetId: e.target.value})}>
                            <option value="">-- 请选择 --</option>
                            {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">层内占比 (%)</label>
                        <div className="flex items-center gap-2">
                             <input required type="number" step="0.1" className="flex-1 border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" value={modalAsset.weight} onChange={e => setModalAsset({...modalAsset, weight: e.target.value})} />
                             <span className="text-xs text-slate-400">占该层级的比例</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">选股逻辑 / 备注</label>
                        <textarea className="w-full border rounded px-3 py-2 h-20 focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="为什么选择这个资产？逻辑是什么？" value={modalAsset.note} onChange={e => setModalAsset({...modalAsset, note: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">标识颜色</label>
                        <div className="flex gap-2 flex-wrap">
                            {PRESET_COLORS.map(c => (
                                <button type="button" key={c} onClick={() => setModalAsset({...modalAsset, color: c})} style={{backgroundColor: c}} className={`w-6 h-6 rounded-full ${modalAsset.color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} />
                            ))}
                        </div>
                    </div>
                    <div className="pt-2">
                        <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold">保存配置</button>
                    </div>
                </form>
            </div>
        </div>
      )}

    </div>
  );
};

export default StrategyManager;