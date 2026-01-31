
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Asset, StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';

interface DataContextType {
  assets: Asset[];
  strategies: StrategyVersion[];
  snapshots: SnapshotItem[];
  snapshotTotal: number;
  snapshotPage: number;
  setSnapshotPage: (page: number) => void;
  isLoading: boolean;
  error: string | null;
  refreshAssets: () => Promise<void>;
  refreshStrategies: () => Promise<void>;
  refreshSnapshots: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [strategies, setStrategies] = useState<StrategyVersion[]>([]);
  
  // Snapshots State
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapshotTotal, setSnapshotTotal] = useState(0);
  const [snapshotPage, setSnapshotPage] = useState(1);
  const SNAPSHOT_LIMIT = 20;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const data = await StorageService.getAssets();
      setAssets(data);
    } catch (e) { console.error(e); }
  }, []);

  const refreshStrategies = useCallback(async () => {
    try {
      const data = await StorageService.getStrategyVersions();
      setStrategies(data);
    } catch (e) { console.error(e); }
  }, []);

  const refreshSnapshots = useCallback(async () => {
    try {
      const data = await StorageService.getSnapshots(snapshotPage, SNAPSHOT_LIMIT);
      setSnapshots(data.items);
      setSnapshotTotal(data.total);
    } catch (e) { console.error(e); }
  }, [snapshotPage]);

  // Handle page change -> triggers fetch
  useEffect(() => {
    if (!isLoading) { // Skip on initial load as refreshAll handles it
        refreshSnapshots();
    }
  }, [snapshotPage]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [a, st, snData] = await Promise.all([
        StorageService.getAssets(),
        StorageService.getStrategyVersions(),
        StorageService.getSnapshots(snapshotPage, SNAPSHOT_LIMIT)
      ]);
      setAssets(a);
      setStrategies(st);
      setSnapshots(snData.items);
      setSnapshotTotal(snData.total);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("无法连接到服务器。请确保后端服务已启动。");
    } finally {
      setIsLoading(false);
    }
  }, []); // Only on mount essentially, or manual full refresh. We don't depend on snapshotPage here to avoid loops if not careful.

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <DataContext.Provider value={{ 
      assets, 
      strategies, 
      snapshots,
      snapshotTotal,
      snapshotPage,
      setSnapshotPage, 
      isLoading, 
      error,
      refreshAssets,
      refreshStrategies,
      refreshSnapshots,
      refreshAll
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
