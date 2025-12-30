// Asset Definitions (Global Dictionary)
export type AssetCategory = 'security' | 'fund' | 'gold' | 'fixed' | 'crypto' | 'other';

export interface Asset {
  id: string;
  type: AssetCategory;
  name: string;
  ticker?: string;
}

// Strategy Definitions
export interface StrategyTarget {
  id: string;      // The unique ID of this target rule
  assetId: string; // Link to Asset Table
  
  // Display/Plan props
  targetName: string; // Can inherit from Asset or be custom
  module: string;     // Can inherit from Asset Type or be custom
  targetWeight: number; 
  color: string;
}

export interface StrategyVersion {
  id: string;
  name: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  status: 'active' | 'archived';
  items: StrategyTarget[];
}

// Ledger / Snapshot Records
export interface AssetRecord {
  id: string; // Unique Position ID
  assetId: string; // Link to Asset
  
  // De-normalized info for UI convenience (populated from joins)
  name: string;
  category: AssetCategory;
  strategyId?: string; // Optional: If this position matches a current strategy target
  
  // State
  unitPrice: number;
  quantity: number;
  marketValue: number;
  
  // History
  totalCost: number;
  
  // Flow
  addedPrincipal: number;
  addedQuantity: number;
}

export interface SnapshotItem {
  id: string;
  date: string; // YYYY-MM
  assets: AssetRecord[]; 
  totalValue: number; 
  totalInvested: number; 
}

// App Data Container (for UI state)
export interface AppData {
  assets: Asset[]; // Global dictionary
  strategies: StrategyVersion[];
  snapshots: SnapshotItem[];
}
