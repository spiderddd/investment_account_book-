
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Asset, StrategyVersion, SnapshotItem } from '../types';
import { StorageService } from '../services/storageService';

interface DataContextType {
  assets: Asset[];
  strategies: StrategyVersion[];
  snapshots: SnapshotItem[];
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
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const data = await StorageService.getAssets(true);
      setAssets(data);
    } catch (e) { console.error(e); }
  }, []);

  const refreshStrategies = useCallback(async () => {
    try {
      const data = await StorageService.getStrategyVersions(true);
      setStrategies(data);
    } catch (e) { console.error(e); }
  }, []);

  const refreshSnapshots = useCallback(async () => {
    try {
      const data = await StorageService.getSnapshots(true);
      setSnapshots(data);
    } catch (e) { console.error(e); }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      // Parallel fetch, StorageService will handle caching logic (initially null)
      const [a, st, sn] = await Promise.all([
        StorageService.getAssets(),
        StorageService.getStrategyVersions(),
        StorageService.getSnapshots()
      ]);
      setAssets(a);
      setStrategies(st);
      setSnapshots(sn);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("无法连接到服务器。请确保后端服务已启动。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <DataContext.Provider value={{ 
      assets, 
      strategies, 
      snapshots, 
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
