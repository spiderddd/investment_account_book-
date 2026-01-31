
import { useState } from 'react';
import { Asset, SnapshotItem, AssetCategory, AssetRecord, StrategyVersion } from '../types';
import { generateId, StorageService } from '../services/storageService';

export interface AssetRowInput {
  recordId: string;
  assetId?: string; 
  name: string;
  category: AssetCategory;
  price: string;
  transactionType: 'buy' | 'sell';
  quantityChange: string; 
  costChange: string; 
  prevQuantity: number;
  prevCost: number;
}

export const useSnapshotForm = (
    snapshots: SnapshotItem[],
    assets: Asset[],
    activeStrategy: StrategyVersion | undefined
) => {
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 7));
    const [note, setNote] = useState('');
    const [rows, setRows] = useState<AssetRowInput[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

    const initEntryForm = async (snapshotId?: string) => {
        setLoadingDetails(true);
        let baseDate = new Date().toISOString().slice(0, 7);
        let baseNote = '';
        let initialRows: AssetRowInput[] = [];

        try {
            let existing: SnapshotItem | null = null;
            let prevDetails: SnapshotItem | null = null;

            if (snapshotId) {
                existing = await StorageService.getSnapshot(snapshotId);
            }

            const refDate = existing ? existing.date : baseDate;
            
            // Find previous snapshot logic
            let prevSummary = snapshots.find(s => s.date < refDate);
            if (!prevSummary) {
                // Try history if not in current page
                const historyList = await StorageService.getSnapshotsHistory();
                prevSummary = historyList.filter(s => s.date < refDate).sort((a, b) => b.date.localeCompare(a.date))[0];
            } else {
                 prevSummary = snapshots.filter(s => s.date < refDate).sort((a, b) => b.date.localeCompare(a.date))[0];
            }
            
            if (prevSummary) {
                prevDetails = await StorageService.getSnapshot(prevSummary.id);
            }

            if (existing) {
                baseDate = existing.date;
                baseNote = existing.note || '';
                if (existing.assets) {
                    initialRows = existing.assets.map(a => {
                        const realAsset = assets.find(def => def.id === a.assetId);
                        const prevAsset = prevDetails?.assets?.find(pa => pa.assetId === a.assetId);
                        
                        // Detect transaction type based on negative signs
                        // Default to 'buy' (positive) if 0 or positive
                        // If either quantity or cost change is negative, we assume it's a 'sell' operation
                        const isSell = a.addedQuantity < 0 || a.addedPrincipal < 0;

                        return {
                            recordId: a.id,
                            assetId: a.assetId,
                            name: realAsset ? realAsset.name : a.name, 
                            category: realAsset ? realAsset.type : a.category, 
                            price: a.unitPrice.toString(),
                            transactionType: isSell ? 'sell' : 'buy',
                            // Convert to absolute string for input fields
                            quantityChange: Math.abs(a.addedQuantity).toString(),
                            costChange: Math.abs(a.addedPrincipal).toString(),
                            // In edit mode, prev is current minus change, unless we have real prev data
                            prevQuantity: prevAsset ? prevAsset.quantity : (a.quantity - a.addedQuantity),
                            prevCost: prevAsset ? prevAsset.totalCost : (a.totalCost - a.addedPrincipal)
                        };
                    });
                }
            } else {
                // New Snapshot: Pre-fill from Strategy or Previous Holdings
                if (activeStrategy && activeStrategy.layers) {
                    const allTargets = activeStrategy.layers.flatMap(l => l.items);
                    allTargets.forEach(item => {
                        const realAsset = assets.find(a => a.id === item.assetId);
                        const prevAsset = prevDetails?.assets?.find(a => a.assetId === item.assetId);
                        
                        initialRows.push({
                            recordId: generateId(),
                            assetId: item.assetId,
                            name: realAsset ? realAsset.name : item.targetName, 
                            category: realAsset ? realAsset.type : 'security', 
                            price: prevAsset ? prevAsset.unitPrice.toString() : '',
                            transactionType: 'buy',
                            quantityChange: '',
                            costChange: '',
                            prevQuantity: prevAsset ? prevAsset.quantity : 0,
                            prevCost: prevAsset ? prevAsset.totalCost : 0
                        });
                    });
                }

                if (prevDetails && prevDetails.assets) {
                    prevDetails.assets.forEach(a => {
                        const alreadyAdded = initialRows.find(r => r.assetId === a.assetId);
                        if (!alreadyAdded) { 
                            const realAsset = assets.find(def => def.id === a.assetId);
                            initialRows.push({
                                recordId: generateId(),
                                assetId: a.assetId,
                                name: realAsset ? realAsset.name : a.name,
                                category: realAsset ? realAsset.type : a.category,
                                price: a.unitPrice.toString(),
                                transactionType: 'buy',
                                quantityChange: '',
                                costChange: '',
                                prevQuantity: a.quantity,
                                prevCost: a.totalCost
                            });
                        }
                    });
                }
            }

            setDate(baseDate);
            setNote(baseNote);
            setRows(initialRows);
            setSelectedSnapshotId(snapshotId || null);
        } catch (e) {
            console.error("Error loading snapshot details", e);
            alert("无法加载快照详情，请检查网络连接");
        } finally {
            setLoadingDetails(false);
        }
    };

    const updateRow = (index: number, field: 'price' | 'quantityChange' | 'costChange' | 'transactionType', value: string) => {
        const newRows = [...rows];
        const row = newRows[index];
        
        if (field === 'transactionType') {
            row.transactionType = value as 'buy' | 'sell';
        } else {
            row[field] = value;
            // Auto-link quantity to cost for cash-like assets (Deposit/Withdraw)
            // Note: value here is absolute, so we just copy it.
            if ((row.category === 'fixed' || row.category === 'wealth') && field === 'costChange') {
                row.quantityChange = value;
            }
        }
        setRows(newRows);
    };

    const addAssetRow = (asset: Asset) => {
        if (rows.find(r => r.assetId === asset.id)) {
            alert("该资产已在列表中");
            return;
        }
        const isCashLike = asset.type === 'fixed' || asset.type === 'wealth';
        setRows([
            ...rows,
            {
                recordId: generateId(),
                assetId: asset.id,
                name: asset.name,
                category: asset.type,
                price: isCashLike ? '1' : '',
                transactionType: 'buy',
                quantityChange: '',
                costChange: '',
                prevQuantity: 0, 
                prevCost: 0
            }
        ]);
    };

    const removeRow = (index: number) => {
        if(confirm('移除此资产记录？(若该资产有持仓，移除意味着该月持仓归零)')) {
            const newRows = [...rows];
            newRows.splice(index, 1);
            setRows(newRows);
        }
    };

    const prepareSubmission = (): SnapshotItem => {
        const finalAssets: AssetRecord[] = rows.map(r => {
            const price = (r.category === 'fixed' || r.category === 'wealth') ? 1 : (parseFloat(r.price) || 0);
            
            // Apply sign based on transaction type
            const sign = r.transactionType === 'sell' ? -1 : 1;
            
            const qChangeAbs = parseFloat(r.quantityChange) || 0;
            const cChangeAbs = parseFloat(r.costChange) || 0;
            
            const qChange = qChangeAbs * sign;
            const cChange = cChangeAbs * sign;

            const newQuantity = r.prevQuantity + qChange;
            const newCost = r.prevCost + cChange;

            return {
                id: r.recordId,
                assetId: r.assetId || generateId(),
                name: r.name,
                category: r.category,
                unitPrice: price,
                quantity: newQuantity,
                marketValue: newQuantity * price,
                totalCost: newCost,
                addedPrincipal: cChange,
                addedQuantity: qChange
            };
        });

        const totalVal = finalAssets.reduce((sum, a) => sum + a.marketValue, 0);
        const totalInv = finalAssets.reduce((sum, a) => sum + a.totalCost, 0);

        return {
            id: selectedSnapshotId || generateId(),
            date,
            assets: finalAssets,
            totalValue: totalVal,
            totalInvested: totalInv,
            note: note
        };
    };

    return {
        date, setDate,
        note, setNote,
        rows,
        loadingDetails,
        selectedSnapshotId,
        initEntryForm,
        updateRow,
        addAssetRow,
        removeRow,
        prepareSubmission
    };
};
