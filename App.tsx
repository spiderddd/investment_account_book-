import React, { useState, useEffect } from 'react';
import { LayoutDashboard, PieChart, History, Wallet, Database, Wifi, Briefcase } from 'lucide-react';
import Dashboard from './components/Dashboard';
import StrategyManager from './components/StrategyManager';
import SnapshotManager from './components/SnapshotManager';
import { AssetManager } from './components/AssetManager'; // Import new component
import { StorageService } from './services/storageService';
import { StrategyVersion, SnapshotItem, Asset } from './types';

type View = 'dashboard' | 'strategy' | 'snapshots' | 'assets'; // Add 'assets' view

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('dashboard');
  
  // Data State
  const [assets, setAssets] = useState<Asset[]>([]);
  const [strategyVersions, setStrategyVersions] = useState<StrategyVersion[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data from API
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedAssets, fetchedStrategies, fetchedSnapshots] = await Promise.all([
        StorageService.getAssets(),
        StorageService.getStrategyVersions(),
        StorageService.getSnapshots()
      ]);
      setAssets(fetchedAssets);
      setStrategyVersions(fetchedStrategies);
      setSnapshots(fetchedSnapshots);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("无法连接到服务器。请确保后端服务已启动。");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Wrappers to refresh data after updates
  const handleUpdateStrategies = async (newVersions: StrategyVersion[]) => {
      // Logic to handle Create / Update / Delete based on list diff
      const oldIds = new Set(strategyVersions.map(v => v.id));
      const newIds = new Set(newVersions.map(v => v.id));

      // 1. Handle Creates & Updates
      for (const v of newVersions) {
          const old = strategyVersions.find(o => o.id === v.id);
          if (!old) {
              // Create
              await StorageService.createStrategy(v);
          } else if (JSON.stringify(old) !== JSON.stringify(v)) {
              // Update (Deep compare simplistic approach)
              await StorageService.updateStrategy(v);
          }
      }

      // 2. Handle Deletes
      for (const old of strategyVersions) {
          if (!newIds.has(old.id)) {
              await StorageService.deleteStrategy(old.id);
          }
      }

      loadData(); 
  };

  const handleUpdateSnapshots = async (newSnapshots: SnapshotItem[]) => {
     loadData(); 
  };
  
  const handleSaveSnapshot = async (s: SnapshotItem) => {
    await StorageService.saveSnapshotSingle(s);
    loadData();
  };

  const handleCreateAsset = async (a: Partial<Asset>) => {
    await StorageService.createAsset(a);
    loadData();
  };

  const handleEditAsset = async (id: string, a: Partial<Asset>) => {
    const success = await StorageService.updateAsset(id, a);
    if (success) loadData();
    return success;
  };

  const handleDeleteAsset = async (id: string) => {
    const success = await StorageService.deleteAsset(id);
    if (success) loadData();
    return success;
  };

  const getNavLabel = (view: View) => {
    switch (view) {
      case 'dashboard': return '仪表盘';
      case 'assets': return '资产库';
      case 'strategy': return '策略';
      case 'snapshots': return '记账';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <div className="text-sm">正在同步 后端 数据...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-4 p-6 text-center">
        <Wifi size={48} className="text-red-300" />
        <h2 className="text-lg font-bold text-slate-700">连接失败</h2>
        <p>{error}</p>
        <button onClick={loadData} className="px-4 py-2 bg-blue-600 text-white rounded-lg">重试</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header (Desktop) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 hidden md:block">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Wallet className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500">
              InvestTrack <span className="text-xs text-slate-300 font-normal ml-1">Personnel Edition</span>
            </h1>
          </div>
          
          <nav className="flex gap-1">
            {(['dashboard', 'assets', 'strategy', 'snapshots'] as View[]).map((view) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeView === view
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {getNavLabel(view)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Header (Mobile) */}
      <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-10 px-4 h-14 flex items-center justify-between">
         <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Wallet className="text-white" size={18} />
            </div>
            <span className="font-bold text-slate-800">InvestTrack</span>
          </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {activeView === 'dashboard' && (
          <Dashboard strategies={strategyVersions} snapshots={snapshots} />
        )}
        {activeView === 'assets' && (
          <AssetManager 
            assets={assets}
            snapshots={snapshots}
            strategies={strategyVersions}
            onUpdate={loadData}
            onCreate={handleCreateAsset}
            onEdit={handleEditAsset}
            onDelete={handleDeleteAsset}
          />
        )}
        {activeView === 'strategy' && (
          <StrategyManager 
            strategies={strategyVersions} 
            assets={assets}
            onUpdate={handleUpdateStrategies} 
          />
        )}
        {activeView === 'snapshots' && (
          <SnapshotManager 
            snapshots={snapshots} 
            strategies={strategyVersions} 
            assets={assets}
            onUpdate={handleUpdateSnapshots} 
            onSave={handleSaveSnapshot}
            onCreateAsset={handleCreateAsset}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around pb-safe z-20">
        <button onClick={() => setActiveView('dashboard')} className={`p-4 ${activeView === 'dashboard' ? 'text-blue-600' : 'text-slate-400'}`}><LayoutDashboard/></button>
        <button onClick={() => setActiveView('assets')} className={`p-4 ${activeView === 'assets' ? 'text-blue-600' : 'text-slate-400'}`}><Briefcase/></button>
        <button onClick={() => setActiveView('strategy')} className={`p-4 ${activeView === 'strategy' ? 'text-blue-600' : 'text-slate-400'}`}><PieChart/></button>
        <button onClick={() => setActiveView('snapshots')} className={`p-4 ${activeView === 'snapshots' ? 'text-blue-600' : 'text-slate-400'}`}><History/></button>
      </nav>
      
      <div className="h-20 md:hidden"></div>
    </div>
  );
};

export default App;