import { StrategyVersion, SnapshotItem, StrategyTarget, AssetCategory } from '../types';

export const LAYER_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

export const CATEGORY_COLORS: Record<string, string> = {
  '股票基金': '#3b82f6', 
  '商品另类': '#f59e0b', 
  '现金固收': '#64748b', 
  '其他': '#a855f7'
};

// --- Core Helpers ---

export const getStrategyForDate = (versions: StrategyVersion[], dateStr: string): StrategyVersion | null => {
    if (!versions || versions.length === 0) return null;
    const sorted = [...versions].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const targetDate = dateStr.length === 7 ? `${dateStr}-31` : dateStr;
    return sorted.find(v => v.startDate <= targetDate) || sorted[sorted.length - 1]; 
};

export const getAssetTargetMap = (strategy: StrategyVersion | null) => {
    const map = new Map<string, { target: StrategyTarget, layerId: string }>();
    if (!strategy) return map;
    strategy.layers.forEach(layer => {
        layer.items.forEach(target => {
            map.set(target.assetId, { target, layerId: layer.id });
        });
    });
    return map;
};

export const getSnapshotMetrics = (
    s: SnapshotItem | null, 
    viewMode: 'strategy' | 'total',
    versions: StrategyVersion[]
) => {
    if (!s) return { value: 0, invested: 0 };
    if (viewMode === 'total') {
      return { value: s.totalValue, invested: s.totalInvested };
    } else {
      // DYNAMIC CALCULATION: Only sum assets that exist in the active strategy for THIS snapshot
      const strat = getStrategyForDate(versions, s.date);
      const map = getAssetTargetMap(strat);
      
      const value = s.assets.filter(a => map.has(a.assetId)).reduce((sum, a) => sum + a.marketValue, 0);
      const invested = s.assets.filter(a => map.has(a.assetId)).reduce((sum, a) => sum + a.totalCost, 0);
      return { value, invested };
    }
};

// --- Chart Data Calculators ---

export const calculateAllocationData = (
    endSnapshot: SnapshotItem | null,
    activeStrategy: StrategyVersion | null,
    viewMode: 'strategy' | 'total',
    selectedLayerId: string | null
) => {
    if (!endSnapshot) return [];
    
    // 1. Total View (Asset Categories)
    if (viewMode === 'total') {
        const totalValue = endSnapshot.totalValue;
        const grouped = endSnapshot.assets.reduce((acc, curr) => {
            let cat = '其他';
            switch (curr.category) {
              case 'security': case 'fund': cat = '股票基金'; break;
              case 'fixed': case 'wealth': cat = '现金固收'; break;
              case 'gold': case 'crypto': cat = '商品另类'; break;
              default: cat = '其他';
            }
            acc[cat] = (acc[cat] || 0) + curr.marketValue;
            return acc;
        }, {} as Record<string, number>);

        return Object.keys(grouped).map(key => ({
            name: key,
            value: grouped[key],
            percent: parseFloat(((grouped[key] / totalValue) * 100).toFixed(1)),
            color: CATEGORY_COLORS[key] || '#cbd5e1'
        })).sort((a, b) => b.value - a.value);
    }

    // 2. Strategy View
    if (!activeStrategy) return [];
    const assetTargetMap = getAssetTargetMap(activeStrategy);
    
    // Calculate strategy total value (subset of snapshot)
    const stratTotal = endSnapshot.assets
        .filter(a => assetTargetMap.has(a.assetId))
        .reduce((sum, a) => sum + a.marketValue, 0);

    // 2a. Level 1: Layer View (Root)
    if (selectedLayerId === null) {
        return activeStrategy.layers.map((layer, idx) => {
            const layerActualValue = endSnapshot.assets.reduce((sum, asset) => {
                const mapping = assetTargetMap.get(asset.assetId);
                if (mapping && mapping.layerId === layer.id) {
                    return sum + asset.marketValue;
                }
                return sum;
            }, 0);

            const actualPercent = stratTotal > 0 ? (layerActualValue / stratTotal) * 100 : 0;
            
            return {
                id: layer.id,
                name: layer.name,
                value: layerActualValue,
                percent: parseFloat(actualPercent.toFixed(1)),
                targetPercent: layer.weight,
                color: LAYER_COLORS[idx % LAYER_COLORS.length],
                deviation: actualPercent - layer.weight,
                isLayer: true
            };
        }).sort((a, b) => b.targetPercent - a.targetPercent);
    } 
    
    // 2b. Level 2: Asset View (Drill Down)
    else {
        const layer = activeStrategy.layers.find(l => l.id === selectedLayerId);
        if (!layer) return [];

        const getTargetActualValue = (target: StrategyTarget) => {
            const assets = endSnapshot.assets.filter(a => a.assetId === target.assetId);
            return assets.reduce((sum, a) => sum + a.marketValue, 0);
        };

        const layerTotalValue = layer.items.reduce((sum, t) => sum + getTargetActualValue(t), 0);
        
        // Auto Weights logic
        const fixedItems = layer.items.filter(t => t.weight >= 0);
        const autoItems = layer.items.filter(t => t.weight === -1);
        const usedWeight = fixedItems.reduce((sum, t) => sum + t.weight, 0);
        const remainingWeight = Math.max(0, 100 - usedWeight);
        const calculatedAutoWeight = autoItems.length > 0 ? (remainingWeight / autoItems.length) : 0;

        return layer.items.map(t => {
            const actualValue = getTargetActualValue(t);
            const actualInnerPercent = layerTotalValue > 0 ? (actualValue / layerTotalValue) * 100 : 0;
            const targetInnerPercent = t.weight === -1 ? calculatedAutoWeight : t.weight;

            return {
                id: t.id,
                name: t.targetName,
                value: actualValue,
                percent: parseFloat(actualInnerPercent.toFixed(1)),
                targetPercent: parseFloat(targetInnerPercent.toFixed(1)),
                color: t.color,
                deviation: actualInnerPercent - targetInnerPercent,
                isLayer: false
            };
        }).sort((a, b) => b.value - a.value);
    }
};

export const calculateHistoryData = (
    snapshots: SnapshotItem[],
    versions: StrategyVersion[],
    viewMode: 'strategy' | 'total',
    selectedLayerId: string | null,
    activeStrategyEnd: StrategyVersion | null
) => {
    // Determine scope of assets to include in history
    let targetAssetIds: Set<string> | null = null;
    
    if (viewMode === 'strategy' && selectedLayerId && activeStrategyEnd) {
       const layer = activeStrategyEnd.layers.find(l => l.id === selectedLayerId);
       if (layer) {
           targetAssetIds = new Set(layer.items.map(i => i.assetId));
       }
    }

    return snapshots.map(s => {
      let val = 0;
      let inv = 0;
      
      if (viewMode === 'strategy') {
          // Dynamic calculation based on strategy active AT THAT TIME
          const stratAtTime = getStrategyForDate(versions, s.date);
          const mapAtTime = getAssetTargetMap(stratAtTime);

          if (targetAssetIds) {
              const assets = s.assets.filter(a => targetAssetIds!.has(a.assetId) && mapAtTime.has(a.assetId));
              val = assets.reduce((sum, a) => sum + a.marketValue, 0);
              inv = assets.reduce((sum, a) => sum + a.totalCost, 0);
          } else {
              const assets = s.assets.filter(a => mapAtTime.has(a.assetId));
              val = assets.reduce((sum, a) => sum + a.marketValue, 0);
              inv = assets.reduce((sum, a) => sum + a.totalCost, 0);
          }
      } else {
          val = s.totalValue;
          inv = s.totalInvested;
      }

      return {
        date: s.date,
        value: val,
        invested: inv
      };
    });
};

export const calculateBreakdownData = (
    startSnapshot: SnapshotItem | null,
    endSnapshot: SnapshotItem | null,
    activeStrategy: StrategyVersion | null,
    viewMode: 'strategy' | 'total',
    selectedLayerId: string | null
) => {
    if (!endSnapshot) return [];
    
    // Helper to get stats for a set of Asset IDs
    const getStats = (s: SnapshotItem | null, assetIds: Set<string>) => {
        if (!s) return { v: 0, c: 0 };
        const relevant = s.assets.filter(a => assetIds.has(a.assetId));
        return {
            v: relevant.reduce((sum, a) => sum + a.marketValue, 0),
            c: relevant.reduce((sum, a) => sum + a.totalCost, 0)
        };
    };

    // 1. Total View Breakdown
    if (viewMode === 'total') {
        const categories = ['股票基金', '现金固收', '商品另类', '其他'];
        const catMap: Record<string, string> = {
            'security': '股票基金', 'fund': '股票基金',
            'fixed': '现金固收', 'wealth': '现金固收',
            'gold': '商品另类', 'crypto': '商品另类',
            'other': '其他'
        };

        const calcCatStats = (s: SnapshotItem | null) => {
            const res: Record<string, { v: number, c: number }> = {};
            categories.forEach(c => res[c] = { v: 0, c: 0 });
            if (!s) return res;
            
            s.assets.forEach(a => {
                const cat = catMap[a.category] || '其他';
                if (res[cat]) {
                    res[cat].v += a.marketValue;
                    res[cat].c += a.totalCost;
                }
            });
            return res;
        };

        const endStats = calcCatStats(endSnapshot);
        const startStats = calcCatStats(startSnapshot);

        return categories.map(cat => {
            const end = endStats[cat];
            const start = startStats[cat];
             return {
                id: cat,
                name: cat,
                color: CATEGORY_COLORS[cat] || '#cbd5e1',
                endVal: end.v,
                endCost: end.c,
                changeVal: end.v - start.v,
                changeInput: end.c - start.c,
                profit: (end.v - end.c) - (start.v - start.c)
            };
        }).filter(r => r.endVal > 0 || Math.abs(r.changeVal) > 0 || Math.abs(r.profit) > 0).sort((a,b) => b.endVal - a.endVal);
    }
    
    // 2. Strategy Breakdown
    if (!activeStrategy) return [];

    // 2a. Assets Breakdown (Drill Down)
    if (selectedLayerId) {
        const layer = activeStrategy.layers.find(l => l.id === selectedLayerId);
        if (!layer) return [];
        
        return layer.items.map(item => {
            const assetIds = new Set<string>([item.assetId]);
            const end = getStats(endSnapshot, assetIds);
            const start = getStats(startSnapshot, assetIds);
            
            return {
                id: item.id,
                name: item.targetName,
                color: item.color,
                endVal: end.v,
                endCost: end.c, 
                changeVal: end.v - start.v,
                changeInput: end.c - start.c,
                profit: (end.v - end.c) - (start.v - start.c)
            };
        }).sort((a,b) => b.endVal - a.endVal);
    } 
    
    // 2b. Layers Breakdown (Top Level)
    else {
        return activeStrategy.layers.map((layer, idx) => {
            const assetIds = new Set<string>(layer.items.map(i => i.assetId));
            const end = getStats(endSnapshot, assetIds);
            const start = getStats(startSnapshot, assetIds);
            
            return {
                id: layer.id,
                name: layer.name,
                color: LAYER_COLORS[idx % LAYER_COLORS.length],
                endVal: end.v,
                endCost: end.c,
                changeVal: end.v - start.v,
                changeInput: end.c - start.c,
                profit: (end.v - end.c) - (start.v - start.c)
            };
        });
    }
};
