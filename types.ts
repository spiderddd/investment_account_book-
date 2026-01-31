
// Asset Definitions (Global Dictionary)
export type AssetCategory = 'security' | 'fund' | 'wealth' | 'gold' | 'fixed' | 'crypto' | 'other';

export interface Asset {
  id: string;
  type: AssetCategory;
  name: string;
  ticker?: string;
  note?: string;
}

// --- New Strategy Hierarchy ---

// Level 3: The Leaf Node (Asset Allocation)
export interface StrategyTarget {
  id: string;      
  assetId: string; // Link to Asset Table
  
  // Display props
  targetName: string;
  weight: number;  // Inner Weight (0-100) relative to the Layer
  color: string;
  note?: string;
}

// Level 2: The Structural Layer
export interface StrategyLayer {
  id: string;
  name: string;   // e.g., "Core Defense"
  weight: number; // Layer Weight (0-100) relative to the Portfolio
  description?: string;
  items: StrategyTarget[];
}

// Level 1: The Version
export interface StrategyVersion {
  id: string;
  name: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  status: 'active' | 'archived';
  layers: StrategyLayer[]; // Structured hierarchy
}

// Ledger / Snapshot Records
export interface AssetRecord {
  id: string; // Unique Position ID
  assetId: string; // Link to Asset
  
  // De-normalized info for UI convenience
  name: string;
  category: AssetCategory;
  // strategyId removed: Mapped dynamically in UI based on Asset ID
  
  // State
  unitPrice: number;
  quantity: number;
  marketValue: number;
  
  // History
  totalCost: number;
  
  // Flow
  addedPrincipal: number;
  addedQuantity: number;
  
  // Transaction Note
  note?: string; 
}

export interface SnapshotItem {
  id: string;
  date: string; // YYYY-MM
  assets?: AssetRecord[]; // Optional: List views only need summaries
  totalValue: number; 
  totalInvested: number;
  note?: string; 
}

// App Data Container
export interface AppData {
  assets: Asset[]; 
  strategies: StrategyVersion[];
  snapshots: SnapshotItem[];
}
