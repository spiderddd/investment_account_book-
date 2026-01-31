
import { StrategyVersion, StrategyTarget } from '../types';

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
