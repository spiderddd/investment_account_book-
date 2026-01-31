
import { StrategyVersion, SnapshotItem, Asset } from '../types';

const API_BASE = '/api'; 

// Simple in-memory cache
interface CacheStore {
  assets: Asset[] | null;
  strategies: StrategyVersion[] | null;
  snapshots: SnapshotItem[] | null;
}

const cache: CacheStore = {
  assets: null,
  strategies: null,
  snapshots: null
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const StorageService = {
  // --- Assets ---
  getAssets: async (forceRefresh = false): Promise<Asset[]> => {
    if (!forceRefresh && cache.assets) return cache.assets;
    try {
      const res = await fetch(`${API_BASE}/assets`);
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      cache.assets = data;
      return data;
    } catch (e) { console.error(e); return []; }
  },

  createAsset: async (asset: Partial<Asset>): Promise<Asset | null> => {
    try {
      const res = await fetch(`${API_BASE}/assets`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset)
      });
      const data = await res.json();
      cache.assets = null; // Invalidate cache
      return data;
    } catch (e) { console.error(e); return null; }
  },

  updateAsset: async (id: string, asset: Partial<Asset>): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset)
      });
      if (res.ok) cache.assets = null; // Invalidate cache
      return res.ok;
    } catch (e) { console.error(e); return false; }
  },

  deleteAsset: async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, { method: 'DELETE' });
      if (res.ok) cache.assets = null; // Invalidate cache
      return res.ok;
    } catch (e) { console.error(e); return false; }
  },

  // NEW: Get Specific Asset History (No Caching for now as it's on-demand)
  getAssetHistory: async (assetId: string): Promise<any[]> => {
    try {
        const res = await fetch(`${API_BASE}/assets/${assetId}/history`);
        if (!res.ok) throw new Error('Failed to fetch asset history');
        return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  // --- Strategies ---
  getStrategyVersions: async (forceRefresh = false): Promise<StrategyVersion[]> => {
    if (!forceRefresh && cache.strategies) return cache.strategies;
    try {
      const res = await fetch(`${API_BASE}/strategies`);
      if (!res.ok) throw new Error('Failed to fetch strategies');
      const data = await res.json();
      cache.strategies = data;
      return data;
    } catch (e) { console.error(e); return []; }
  },

  createStrategy: async (strategy: StrategyVersion) => {
    await fetch(`${API_BASE}/strategies`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(strategy)
    });
    cache.strategies = null;
  },

  updateStrategy: async (strategy: StrategyVersion) => {
      await fetch(`${API_BASE}/strategies/${strategy.id}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(strategy)
      });
      cache.strategies = null;
  },

  deleteStrategy: async (id: string) => {
      await fetch(`${API_BASE}/strategies/${id}`, { method: 'DELETE' });
      cache.strategies = null;
  },

  // --- Snapshots ---
  getSnapshots: async (forceRefresh = false): Promise<SnapshotItem[]> => {
    if (!forceRefresh && cache.snapshots) return cache.snapshots;
    try {
      const res = await fetch(`${API_BASE}/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      const data = await res.json();
      cache.snapshots = data;
      return data;
    } catch (e) { console.error(e); return []; }
  },

  saveSnapshotSingle: async (snapshot: SnapshotItem) => {
    await fetch(`${API_BASE}/snapshots`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(snapshot)
    });
    cache.snapshots = null;
  },

  // --- Helpers ---
  createDefaultStrategy: (): StrategyVersion => {
    return {
      id: generateId(),
      name: '2024 备战版策略',
      description: '# 初始化策略...',
      startDate: new Date().toISOString().slice(0, 10),
      status: 'active',
      layers: []
    };
  }
};
