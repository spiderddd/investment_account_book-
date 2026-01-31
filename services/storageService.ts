
import { StrategyVersion, SnapshotItem, Asset } from '../types';

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
    } catch (e) { console.error(e); return []; }
  },

  createAsset: async (asset: Partial<Asset>): Promise<Asset | null> => {
    try {
      const res = await fetch(`${API_BASE}/assets`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset)
      });
      return await res.json();
    } catch (e) { console.error(e); return null; }
  },

  updateAsset: async (id: string, asset: Partial<Asset>): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset)
      });
      return res.ok;
    } catch (e) { console.error(e); return false; }
  },

  deleteAsset: async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (e) { console.error(e); return false; }
  },

  getAssetHistory: async (assetId: string): Promise<any[]> => {
    try {
        const res = await fetch(`${API_BASE}/assets/${assetId}/history`);
        if (!res.ok) throw new Error('Failed to fetch asset history');
        return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  // --- Strategies ---
  getStrategyVersions: async (): Promise<StrategyVersion[]> => {
    try {
      const res = await fetch(`${API_BASE}/strategies`);
      if (!res.ok) throw new Error('Failed to fetch strategies');
      return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  createStrategy: async (strategy: StrategyVersion) => {
    await fetch(`${API_BASE}/strategies`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(strategy)
    });
  },

  updateStrategy: async (strategy: StrategyVersion) => {
      await fetch(`${API_BASE}/strategies/${strategy.id}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(strategy)
      });
  },

  deleteStrategy: async (id: string) => {
      await fetch(`${API_BASE}/strategies/${id}`, { method: 'DELETE' });
  },

  // --- Snapshots ---
  
  // Gets Lightweight List (For List View)
  getSnapshots: async (): Promise<SnapshotItem[]> => {
    try {
      const res = await fetch(`${API_BASE}/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  // Gets Lightweight Assets History (For Charting)
  getSnapshotsHistory: async (): Promise<SnapshotItem[]> => {
    try {
      const res = await fetch(`${API_BASE}/snapshots/history`);
      if (!res.ok) throw new Error('Failed to fetch snapshots history');
      return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  // Gets Full Details (For Single View)
  getSnapshot: async (id: string): Promise<SnapshotItem | null> => {
    try {
        const res = await fetch(`${API_BASE}/snapshots/${id}`);
        if (!res.ok) throw new Error('Failed to fetch snapshot details');
        return await res.json();
    } catch (e) { console.error(e); return null; }
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
      layers: []
    };
  }
};
