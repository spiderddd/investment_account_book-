
import { useState, useMemo } from 'react';
import { Asset, SnapshotItem, StrategyVersion, AssetCategory } from '../types';
import { Layers, HelpCircle, TrendingUp, Briefcase, Landmark, Coins, Wallet } from 'lucide-react';

const CATEGORIES: { value: AssetCategory; label: string; icon: any; color: string }[] = [
  { value: 'security', label: '股票/证券', icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
  { value: 'fund', label: '基金/ETF', icon: Briefcase, color: 'text-indigo-600 bg-indigo-50' },
  { value: 'wealth', label: '银行理财', icon: Landmark, color: 'text-cyan-600 bg-cyan-50' },
  { value: 'gold', label: '黄金/商品', icon: Coins, color: 'text-amber-600 bg-amber-50' },
  { value: 'fixed', label: '现金/存款', icon: Wallet, color: 'text-slate-600 bg-slate-50' },
  { value: 'crypto', label: '加密货币', icon: Briefcase, color: 'text-purple-600 bg-purple-50' }, 
  { value: 'other', label: '其他资产', icon: Briefcase, color: 'text-pink-600 bg-pink-50' },
];

const LAYER_COLORS = ['text-blue-600 bg-blue-50', 'text-amber-600 bg-amber-50', 'text-emerald-600 bg-emerald-50', 'text-rose-600 bg-rose-50', 'text-purple-600 bg-purple-50'];

interface AssetPerformance {
  quantity: number;
  marketValue: number;
  totalCost: number;
  unitPrice: number;
  date: string;
  isHistorical: boolean;
}

export const useAssetGrouping = (assets: Asset[], snapshots: SnapshotItem[], strategies: StrategyVersion[]) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showHeldOnly, setShowHeldOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<'category' | 'layer'>('category');
  const [selectedDate, setSelectedDate] = useState<string>('latest');

  const availableDates = useMemo(() => {
    return snapshots
      .map(s => s.date)
      .sort((a, b) => b.localeCompare(a));
  }, [snapshots]);

  const activeStrategy = useMemo(() => {
      return strategies.find(s => s.status === 'active') || strategies[strategies.length - 1];
  }, [strategies]);

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
        // Safe check for undefined assets
        if (!s.assets) return;

        s.assets.forEach(a => {
            if (a.quantity > 0) {
                const existing = map.get(a.assetId);

                if (existing && existing.date === s.date) {
                    const totalQ = existing.quantity + a.quantity;
                    const totalMV = existing.marketValue + a.marketValue;
                    const totalCost = existing.totalCost + a.totalCost;
                    
                    map.set(a.assetId, {
                        quantity: totalQ,
                        marketValue: totalMV,
                        totalCost: totalCost,
                        unitPrice: totalQ > 0 ? totalMV / totalQ : a.unitPrice, 
                        date: s.date,
                        isHistorical: isHist
                    });
                } else {
                    map.set(a.assetId, {
                        quantity: a.quantity,
                        marketValue: a.marketValue,
                        totalCost: a.totalCost,
                        unitPrice: a.unitPrice,
                        date: s.date,
                        isHistorical: isHist
                    });
                }
            }
        });
    };

    if (selectedDate !== 'latest') {
        if (viewSnapshot) processSnapshot(viewSnapshot, false);
    } else {
        const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
        sorted.forEach(s => {
            processSnapshot(s, true); 
        });

        if (sorted.length > 0) {
            const latest = sorted[sorted.length - 1];
            // Ensure latest has assets before accessing
            if (latest && latest.assets) {
                latest.assets.forEach(a => {
                    if (a.quantity > 0 && map.has(a.assetId)) {
                        const rec = map.get(a.assetId)!;
                        if (rec.date === latest.date) {
                            rec.isHistorical = false;
                        }
                    }
                });
            }
        }
    }
    return map;
  }, [snapshots, selectedDate, viewSnapshot]);

  const displaySections = useMemo(() => {
    let sections: any[] = [];

    if (groupBy === 'category') {
        sections = CATEGORIES.map(c => ({
            id: c.value,
            label: c.label,
            icon: c.icon,
            color: c.color,
            items: []
        }));
    } else {
        if (activeStrategy && activeStrategy.layers) {
            sections = activeStrategy.layers.map((l, idx) => ({
                id: l.id,
                label: l.name,
                icon: Layers,
                color: LAYER_COLORS[idx % LAYER_COLORS.length],
                items: []
            }));
        }
        sections.push({
            id: 'unassigned',
            label: '未分配 / 其他',
            icon: HelpCircle,
            color: 'text-slate-400 bg-slate-100',
            items: []
        });
    }

    const assetToSectionMap = new Map<string, string>(); 

    if (groupBy === 'layer' && activeStrategy) {
        activeStrategy.layers.forEach(l => {
            l.items.forEach(t => {
                assetToSectionMap.set(t.assetId, l.id);
            });
        });
    }

    assets.forEach(asset => {
        const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (asset.ticker && asset.ticker.toLowerCase().includes(searchTerm.toLowerCase()));
        if (!matchesSearch) return;

        if (showHeldOnly && !assetPerformanceMap.has(asset.id)) {
            return;
        }

        let sectionIndex = -1;
        
        if (groupBy === 'category') {
             sectionIndex = sections.findIndex(s => s.id === asset.type);
        } else {
             const layerId = assetToSectionMap.get(asset.id);
             if (layerId) {
                 sectionIndex = sections.findIndex(s => s.id === layerId);
             } else {
                 sectionIndex = sections.length - 1; 
             }
        }

        if (sectionIndex !== -1) {
            sections[sectionIndex].items.push(asset);
        }
    });

    sections.forEach(sec => {
        sec.items.sort((a: Asset, b: Asset) => {
            const valA = assetPerformanceMap.get(a.id)?.marketValue || 0;
            const valB = assetPerformanceMap.get(b.id)?.marketValue || 0;
            return valB - valA; 
        });
    });

    return sections.filter(s => s.items.length > 0);

  }, [assets, searchTerm, assetPerformanceMap, showHeldOnly, groupBy, activeStrategy]);

  return {
      searchTerm, setSearchTerm,
      showHeldOnly, setShowHeldOnly,
      groupBy, setGroupBy,
      selectedDate, setSelectedDate,
      availableDates,
      activeStrategy,
      assetPerformanceMap,
      displaySections,
      CATEGORIES
  };
}
