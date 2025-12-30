import { StrategyVersion, SnapshotItem, Asset, AppData } from '../types';

// Configuration: Assume API is at the same host or proxy
const API_BASE = '/api'; 

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const StorageService = {
  // --- Assets ---
  getAssets: async (): Promise<Asset[]> => {
    try {
      const res = await fetch(`${API_BASE}/assets`);
      if (!res.ok) throw new Error('Failed to fetch assets');
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  createAsset: async (asset: Partial<Asset>): Promise<Asset | null> => {
    try {
      const res = await fetch(`${API_BASE}/assets`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset)
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  updateAsset: async (id: string, asset: Partial<Asset>): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset)
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  deleteAsset: async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  // --- Strategies ---
  getStrategyVersions: async (): Promise<StrategyVersion[]> => {
    try {
      const res = await fetch(`${API_BASE}/strategies`);
      if (!res.ok) throw new Error('Failed to fetch strategies');
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  saveStrategyVersions: async (versions: StrategyVersion[]) => {
    console.warn("Bulk save strategies not fully implemented in API mode. Use specific create.");
  },

  createStrategy: async (strategy: StrategyVersion) => {
    await fetch(`${API_BASE}/strategies`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(strategy)
    });
  },

  getStrategyForDate: (versions: StrategyVersion[], dateStr: string): StrategyVersion | null => {
    if (!versions || versions.length === 0) return null;
    const sorted = [...versions].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const targetDate = dateStr.length === 7 ? `${dateStr}-31` : dateStr;
    return sorted.find(v => v.startDate <= targetDate) || sorted[sorted.length - 1]; 
  },

  // --- Snapshots ---
  getSnapshots: async (): Promise<SnapshotItem[]> => {
    try {
      const res = await fetch(`${API_BASE}/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  saveSnapshots: async (snapshots: SnapshotItem[]) => {
    console.warn("Use saveSnapshotSingle for API efficiency");
  },

  saveSnapshotSingle: async (snapshot: SnapshotItem) => {
    await fetch(`${API_BASE}/snapshots`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(snapshot)
    });
  },

  // --- Helpers ---
  createDefaultStrategy: (): StrategyVersion => {
    return {
      id: generateId(),
      name: '2024 备战版策略',
      description: '# 初始化策略...',
      startDate: new Date().toISOString().slice(0, 10),
      status: 'active',
      items: []
    };
  }
};