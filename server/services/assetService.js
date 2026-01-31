
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
        // Reconstruction logic for a single asset's history
        // 1. Get all transactions
        const txs = await getQuery("SELECT date, quantity_change, cost_change FROM transactions WHERE asset_id = ? ORDER BY date ASC", [assetId]);
        // 2. Get all prices
        const prices = await getQuery("SELECT date, price FROM market_prices WHERE asset_id = ? ORDER BY date ASC", [assetId]);
        
        // Merge them into a timeline is complex in SQL, usually done in application code or sophisticated recursive CTEs.
        // For simplicity, we will mimic the previous output format by aggregating per Month (Snapshot Dates).
        // OR better: Return all data points where an event occurred.
        
        // Let's stick to returning snapshot-aligned history for chart consistency
        const snapshots = await getQuery("SELECT date FROM snapshots ORDER BY date ASC");
        
        const history = [];
        let cumQ = 0;
        let cumC = 0;
        
        for (const s of snapshots) {
            // Sum changes up to this date
            // Optimization: We could do this in one SQL, but looping logic is clearer for "Running Total" reconstruction
            const relevantTxs = txs.filter(t => t.date <= s.date && t.date > (history.length > 0 ? history[history.length-1].date : ''));
            
            // Accumulate
            relevantTxs.forEach(t => {
                cumQ += t.quantity_change;
                cumC += t.cost_change;
            });

            // Find price at this date
            const pObj = prices.filter(p => p.date <= s.date).pop(); // Last known price
            const unitPrice = pObj ? pObj.price : 0;
            
            if (cumQ !== 0 || cumC !== 0) {
                 history.push({
                    date: s.date,
                    unitPrice: unitPrice,
                    quantity: cumQ,
                    marketValue: cumQ * unitPrice,
                    totalCost: cumC,
                    addedQuantity: relevantTxs.reduce((sum, t) => sum + t.quantity_change, 0), // Approximation for "Added in this period"
                    addedPrincipal: relevantTxs.reduce((sum, t) => sum + t.cost_change, 0)
                });
            }
        }
        return history;
    }
};
