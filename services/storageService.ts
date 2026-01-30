import { StrategyVersion, SnapshotItem, Asset, AppData } from '../types';

// --- 配置区域 ---
const USE_MOCK = false; 
const API_BASE = '/api'; 
const STORAGE_KEY = 'invest_track_mock_db_v2';

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// --- MOCK 数据初始化 (Updated for V2 Hierarchy) ---
const INITIAL_MOCK_DB: AppData = {
  assets: [
    { id: 'a1', type: 'security', name: '腾讯控股', ticker: '00700.HK' },
    { id: 'a2', type: 'security', name: '纳斯达克100 ETF', ticker: '513100' },
    { id: 'a3', type: 'gold', name: '招行实物金条', ticker: 'Au9999' },
    { id: 'a4', type: 'fixed', name: '定期存款-工行', ticker: '' },
    { id: 'a5', type: 'crypto', name: 'Bitcoin Cold Wallet', ticker: 'BTC' }
  ],
  strategies: [
    {
      id: 's1',
      name: '2024 稳健增长策略',
      description: '# 2024 核心指导思想\n\n1. **核心持仓**: 专注于能够产生现金流的优质红利资产。\n2. **卫星持仓**: 配置美股科技成长。',
      startDate: '2024-01-01',
      status: 'active',
      layers: [
        {
          id: 'l1',
          name: '第一层：秩序底线',
          weight: 40,
          description: '高股息红利资产，提供基础现金流',
          items: [
             { id: 't1', assetId: 'a1', targetName: '腾讯控股', weight: 50, color: '#3b82f6', note: '中国互联网基础设施' },
             { id: 't2', assetId: 'a4', targetName: '定期存款', weight: 50, color: '#64748b', note: '无风险利率基准' }
          ]
        },
        {
          id: 'l2',
          name: '第二层：战略进攻',
          weight: 60,
          description: '科技成长与避险',
          items: [
             { id: 't3', assetId: 'a2', targetName: '纳指ETF', weight: 70, color: '#ec4899', note: '全球科技龙头' },
             { id: 't4', assetId: 'a3', targetName: '实物黄金', weight: 30, color: '#eab308', note: '抗法币通胀' }
          ]
        }
      ]
    }
  ],
  snapshots: [
    {
      id: 'snap1',
      date: '2024-01',
      totalValue: 98500,
      totalInvested: 100000,
      note: '### 本月复盘\n市场情绪低迷，但**腾讯**回购力度加大，决定维持仓位不动。\n买入了一些*实物黄金*作为防御。',
      assets: [
        { id: 'r1', assetId: 'a1', name: '腾讯控股', category: 'security', unitPrice: 280, quantity: 100, marketValue: 28000, totalCost: 32000, addedQuantity: 100, addedPrincipal: 32000 },
        { id: 'r2', assetId: 'a2', name: '纳指ETF', category: 'security', unitPrice: 1.25, quantity: 20000, marketValue: 25000, totalCost: 20000, addedQuantity: 20000, addedPrincipal: 20000 },
        { id: 'r3', assetId: 'a3', name: '实物黄金', category: 'gold', unitPrice: 480, quantity: 50, marketValue: 24000, totalCost: 23000, addedQuantity: 50, addedPrincipal: 23000 },
        { id: 'r4', assetId: 'a4', name: '定期存款', category: 'fixed', unitPrice: 1, quantity: 21500, marketValue: 21500, totalCost: 25000, addedQuantity: 0, addedPrincipal: 25000 }
      ]
    }
  ]
};

// --- Mock Helpers ---
const getMockDB = (): AppData => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DB));
  return INITIAL_MOCK_DB;
};

const saveMockDB = (db: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

const mockDelay = <T>(data: T): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(data), 300)); 
};


export const StorageService = {
  // --- Assets ---
  getAssets: async (): Promise<Asset[]> => {
    if (USE_MOCK) return mockDelay(getMockDB().assets);
    try {
      const res = await fetch(`${API_BASE}/assets`);
      if (!res.ok) throw new Error('Failed to fetch assets');
      return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  createAsset: async (asset: Partial<Asset>): Promise<Asset | null> => {
    if (USE_MOCK) {
      const db = getMockDB();
      const newAsset = { ...asset, id: generateId() } as Asset;
      db.assets.unshift(newAsset);
      saveMockDB(db);
      return mockDelay(newAsset);
    }
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
    if (USE_MOCK) {
      const db = getMockDB();
      const idx = db.assets.findIndex(a => a.id === id);
      if (idx !== -1) {
        db.assets[idx] = { ...db.assets[idx], ...asset };
        saveMockDB(db);
        return mockDelay(true);
      }
      return mockDelay(false);
    }
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
    if (USE_MOCK) {
      const db = getMockDB();
      db.assets = db.assets.filter(a => a.id !== id);
      saveMockDB(db);
      return mockDelay(true);
    }
    try {
      const res = await fetch(`${API_BASE}/assets/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (e) { console.error(e); return false; }
  },

  // NEW: Get Specific Asset History
  getAssetHistory: async (assetId: string): Promise<any[]> => {
    if (USE_MOCK) return mockDelay([]);
    try {
        const res = await fetch(`${API_BASE}/assets/${assetId}/history`);
        if (!res.ok) throw new Error('Failed to fetch asset history');
        return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  // --- Strategies ---
  getStrategyVersions: async (): Promise<StrategyVersion[]> => {
    if (USE_MOCK) return mockDelay(getMockDB().strategies);
    try {
      const res = await fetch(`${API_BASE}/strategies`);
      if (!res.ok) throw new Error('Failed to fetch strategies');
      return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  createStrategy: async (strategy: StrategyVersion) => {
    if (USE_MOCK) {
      const db = getMockDB();
      const idx = db.strategies.findIndex(s => s.id === strategy.id);
      if (idx !== -1) {
        db.strategies[idx] = strategy;
      } else {
        db.strategies.push(strategy);
      }
      saveMockDB(db);
      return mockDelay(void 0);
    }
    await fetch(`${API_BASE}/strategies`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(strategy)
    });
  },

  updateStrategy: async (strategy: StrategyVersion) => {
      if (USE_MOCK) {
          const db = getMockDB();
          const idx = db.strategies.findIndex(s => s.id === strategy.id);
          if (idx !== -1) {
              db.strategies[idx] = strategy;
              saveMockDB(db);
          }
          return mockDelay(void 0);
      }
      await fetch(`${API_BASE}/strategies/${strategy.id}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(strategy)
      });
  },

  deleteStrategy: async (id: string) => {
      if (USE_MOCK) {
          const db = getMockDB();
          db.strategies = db.strategies.filter(s => s.id !== id);
          saveMockDB(db);
          return mockDelay(void 0);
      }
      await fetch(`${API_BASE}/strategies/${id}`, { method: 'DELETE' });
  },

  getStrategyForDate: (versions: StrategyVersion[], dateStr: string): StrategyVersion | null => {
    if (!versions || versions.length === 0) return null;
    const sorted = [...versions].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const targetDate = dateStr.length === 7 ? `${dateStr}-31` : dateStr;
    return sorted.find(v => v.startDate <= targetDate) || sorted[sorted.length - 1]; 
  },

  // --- Snapshots ---
  getSnapshots: async (): Promise<SnapshotItem[]> => {
    if (USE_MOCK) return mockDelay(getMockDB().snapshots);
    try {
      const res = await fetch(`${API_BASE}/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return await res.json();
    } catch (e) { console.error(e); return []; }
  },

  saveSnapshotSingle: async (snapshot: SnapshotItem) => {
    if (USE_MOCK) {
      const db = getMockDB();
      const idx = db.snapshots.findIndex(s => s.id === snapshot.id);
      if (idx !== -1) {
        db.snapshots[idx] = snapshot;
      } else {
        db.snapshots.push(snapshot);
      }
      saveMockDB(db);
      return mockDelay(void 0);
    }
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