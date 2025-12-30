import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2, Edit2, Coins, Briefcase, Landmark, TrendingUp, Wallet, Filter, X, Save, AlertCircle } from 'lucide-react';
import { Asset, AssetCategory } from '../types';

interface AssetManagerProps {
  assets: Asset[];
  onUpdate: () => void; // Trigger reload in parent
  onCreate: (asset: Partial<Asset>) => Promise<void>;
  onEdit: (id: string, asset: Partial<Asset>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const CATEGORIES: { value: AssetCategory; label: string; icon: any; color: string }[] = [
  { value: 'security', label: '股票/证券', icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
  { value: 'fund', label: '基金/ETF', icon: Briefcase, color: 'text-indigo-600 bg-indigo-50' },
  { value: 'gold', label: '黄金/商品', icon: Coins, color: 'text-amber-600 bg-amber-50' },
  { value: 'fixed', label: '现金/定存', icon: Landmark, color: 'text-slate-600 bg-slate-50' },
  { value: 'crypto', label: '加密货币', icon: Wallet, color: 'text-purple-600 bg-purple-50' },
  { value: 'other', label: '其他资产', icon: Briefcase, color: 'text-pink-600 bg-pink-50' },
];

export const AssetManager: React.FC<AssetManagerProps> = ({ assets, onUpdate, onCreate, onEdit, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<AssetCategory | 'all'>('all');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AssetCategory>('security');
  const [formTicker, setFormTicker] = useState('');

  // Filtering
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (a.ticker && a.ticker.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = filterType === 'all' || a.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [assets, searchTerm, filterType]);

  const openModal = (asset?: Asset) => {
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
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload = {
      name: formName,
      type: formType,
      ticker: formTicker
    };

    if (editingId) {
      await onEdit(editingId, payload);
    } else {
      await onCreate(payload);
    }
    
    setIsModalOpen(false);
    onUpdate();
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`确定要删除资产 "${name}" 吗？\n注意：如果已有策略或快照使用了该资产，可能会导致数据显示错误。`)) {
      await onDelete(id);
      onUpdate();
    }
  };

  const getCategoryMeta = (type: AssetCategory) => {
    return CATEGORIES.find(c => c.value === type) || CATEGORIES[CATEGORIES.length - 1];
  };

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">资产库管理</h2>
          <p className="text-slate-500 text-sm">定义您的投资标的字典，方便在策略和记账中引用。</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Plus size={18} />
          新增资产
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索资产名称或代码..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <button 
             onClick={() => setFilterType('all')}
             className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border ${filterType === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            全部
          </button>
          {CATEGORIES.map(cat => (
             <button 
               key={cat.value}
               onClick={() => setFilterType(cat.value)}
               className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border flex items-center gap-1 ${filterType === cat.value ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
               <cat.icon size={14} />
               {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-100 border-dashed">
             <Coins size={48} className="mx-auto mb-4 opacity-20" />
             <p>没有找到符合条件的资产。</p>
          </div>
        ) : (
          filteredAssets.map(asset => {
            const meta = getCategoryMeta(asset.type);
            const Icon = meta.icon;
            
            return (
              <div key={asset.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group relative">
                <div className="flex justify-between items-start mb-3">
                   <div className={`p-2 rounded-lg ${meta.color}`}>
                     <Icon size={20} />
                   </div>
                   <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openModal(asset)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(asset.id, asset.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded">
                        <Trash2 size={16} />
                      </button>
                   </div>
                </div>
                <div>
                   <h3 className="font-bold text-slate-800 text-lg mb-1">{asset.name}</h3>
                   <div className="flex items-center gap-2 text-sm">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs font-medium">{meta.label}</span>
                      {asset.ticker && <span className="text-slate-400 font-mono">{asset.ticker}</span>}
                   </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95">
             <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
               <h3 className="font-bold text-slate-800">{editingId ? '编辑资产' : '定义新资产'}</h3>
               <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                 <X size={20} />
               </button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Warning for deletes */}
                <div className="bg-blue-50 p-3 rounded-lg flex gap-3 text-sm text-blue-800">
                  <AlertCircle className="shrink-0" size={18} />
                  <p>在此定义的资产，可在“策略”和“记账”功能中直接被引用。</p>
                </div>

                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">资产类型</label>
                   <div className="grid grid-cols-2 gap-2">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setFormType(cat.value)}
                          className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-2 transition-colors ${formType === cat.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          <cat.icon size={14} />
                          {cat.label}
                        </button>
                      ))}
                   </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">资产名称 (必填)</label>
                   <input 
                     className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                     placeholder="例如：贵州茅台、招行金条"
                     value={formName}
                     onChange={e => setFormName(e.target.value)}
                     required
                   />
                </div>

                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">代码 / 备注 (选填)</label>
                   <input 
                     className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                     placeholder="例如：600519、AU9999"
                     value={formTicker}
                     onChange={e => setFormTicker(e.target.value)}
                   />
                </div>

                <div className="pt-4 flex gap-3">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50">取消</button>
                   <button type="submit" className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2">
                     <Save size={18} /> 保存
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
