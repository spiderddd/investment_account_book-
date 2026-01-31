
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery } from '../db.js';

export const AssetService = {
    getAll: async () => {
        const sql = "SELECT id, type, name, ticker, note, created_at as createdAt FROM assets ORDER BY created_at DESC";
        return await getQuery(sql);
    },

    create: async (data) => {
        const { name, type, ticker, note } = data;
        if (!name || !type) throw { statusCode: 400, message: "Name and Type required" };

        const id = uuidv4();
        const now = Date.now();
        await runQuery(
            "INSERT INTO assets (id, type, name, ticker, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", 
            [id, type, name, ticker, note, now]
        );
        return { id, name, type, ticker, note, createdAt: now };
    },

    update: async (id, data) => {
        const { name, type, ticker, note } = data;
        await runQuery(
            "UPDATE assets SET name = ?, type = ?, ticker = ?, note = ? WHERE id = ?", 
            [name, type, ticker, note, id]
        );
        return { success: true, id };
    },

    delete: async (id) => {
        // Optional: Check for dependency constraints (foreign keys usually handle this via CASCADE or error)
        await runQuery("DELETE FROM assets WHERE id = ?", [id]);
        return { success: true };
    },

    // New: Update Latest Price (for Crawler/API)
    updatePrice: async (assetId, price, date) => {
        const id = uuidv4();
        const now = Date.now();
        // Upsert logic
        await runQuery(`
            INSERT INTO market_prices (id, asset_id, date, price, source, updated_at)
            VALUES (?, ?, ?, ?, 'manual', ?)
            ON CONFLICT(asset_id, date) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at
        `, [id, assetId, date, price, now]);
        return { success: true };
    },

    getHistory: async (assetId) => {
        // OPTIMIZED: Fetch all raw data first
        
        // 1. Get all transactions for this asset
        const txs = await getQuery("SELECT date, quantity_change, cost_change FROM transactions WHERE asset_id = ? ORDER BY date ASC", [assetId]);
        
        // 2. Get all prices for this asset
        const prices = await getQuery("SELECT date, price FROM market_prices WHERE asset_id = ? ORDER BY date ASC", [assetId]);
        
        // 3. Get snapshot dates (to align the timeline)
        const snapshots = await getQuery("SELECT date FROM snapshots ORDER BY date ASC");
        
        const history = [];
        
        // Optimization pointers
        let txIndex = 0;
        
        let cumQ = 0;
        let cumC = 0;
        
        for (const s of snapshots) {
            const snapDate = s.date;
            
            let periodAddedQ = 0;
            let periodAddedC = 0;
            
            // Advance transaction pointer until we pass the snapshot date
            while (txIndex < txs.length && txs[txIndex].date <= snapDate) {
                const t = txs[txIndex];
                cumQ += t.quantity_change;
                cumC += t.cost_change;
                
                // Track changes that specifically belong to this "period" (between previous snap and this one)
                // Note: This logic assumes snapshots are chronologically processed.
                periodAddedQ += t.quantity_change;
                periodAddedC += t.cost_change;
                
                txIndex++;
            }
            
            // If asset never existed or was fully sold long ago and no activity, we might skip
            // But if it has a non-zero quantity, we must record it.
            // If it has 0 quantity but had activity this month, record it.
            if (Math.abs(cumQ) < 0.000001 && periodAddedQ === 0 && periodAddedC === 0) {
                continue; 
            }

            // Find price at this date
            // Simple reverse search for latest price <= snapDate
            let unitPrice = 0;
            for (let i = prices.length - 1; i >= 0; i--) {
                if (prices[i].date <= snapDate) {
                    unitPrice = prices[i].price;
                    break;
                }
            }
            
            history.push({
                date: snapDate,
                unitPrice: unitPrice,
                quantity: cumQ,
                marketValue: cumQ * unitPrice,
                totalCost: cumC,
                addedQuantity: periodAddedQ,
                addedPrincipal: periodAddedC
            });
        }
        return history;
    }
};
