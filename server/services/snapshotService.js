
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery, withTransaction } from '../db.js';

export const SnapshotService = {
    getList: async (page = 1, limit = 20) => {
        const offset = (page - 1) * limit;

        const countResult = await getQuery("SELECT COUNT(*) as count FROM snapshots");
        const total = countResult[0].count;

        // The snapshots header table now acts as a high-performance cache 
        // storing the calculated totals at that point in time.
        const sql = `
            SELECT id, date, total_value, total_invested, note
            FROM snapshots
            ORDER BY date DESC
            LIMIT ? OFFSET ?
        `;
        
        const rows = await getQuery(sql, [limit, offset]);
        
        const items = rows.map(r => ({
            id: r.id,
            date: r.date,
            totalValue: r.total_value,
            totalInvested: r.total_invested,
            note: r.note,
        }));
        
        return { items, total, page: parseInt(page), limit: parseInt(limit) };
    },

    getHistoryGraph: async () => {
        // PERFORMANCE OPTIMIZATION: 
        // Instead of calculating each snapshot from scratch (O(Snapshots * Transactions)),
        // we sort all data chronologically and maintain a running state (O(Transactions + Snapshots)).
        
        // 1. Fetch all Raw Data
        const snapshots = await getQuery("SELECT id, date, total_value, total_invested FROM snapshots ORDER BY date ASC");
        const allTxs = await getQuery("SELECT asset_id, date, quantity_change, cost_change FROM transactions ORDER BY date ASC");
        const allPrices = await getQuery("SELECT asset_id, date, price FROM market_prices ORDER BY date ASC");
        
        // 2. Prepare fast lookups
        // Group prices by asset for easier lookup
        const pricesByAsset = new Map();
        allPrices.forEach(p => {
             if (!pricesByAsset.has(p.asset_id)) pricesByAsset.set(p.asset_id, []);
             pricesByAsset.get(p.asset_id).push(p);
        });

        // 3. Initialize Running State
        const runningState = new Map(); // assetId -> { quantity, totalCost }
        let txCursor = 0;
        const totalTxs = allTxs.length;

        const result = snapshots.map(s => {
            const snapshotDate = s.date;
            
            // Advance the transaction cursor up to the current snapshot date
            // This ensures we only process each transaction once as we move through time.
            while (txCursor < totalTxs && allTxs[txCursor].date <= snapshotDate) {
                const tx = allTxs[txCursor];
                if (!runningState.has(tx.asset_id)) {
                    runningState.set(tx.asset_id, { quantity: 0, cost: 0 });
                }
                const state = runningState.get(tx.asset_id);
                state.quantity += tx.quantity_change;
                state.cost += tx.cost_change;
                txCursor++;
            }

            // Calculate metrics for this snapshot based on current running state
            const assetsWithPrice = [];
            
            for (const [assetId, state] of runningState.entries()) {
                // Skip assets with effectively zero quantity
                if (Math.abs(state.quantity) < 0.000001) continue;

                // Find Price at snapshotDate
                // Optimization: We could also maintain price cursors, but binary/reverse search is fast enough for price history
                const assetPrices = pricesByAsset.get(assetId) || [];
                let price = 0;
                for (let i = assetPrices.length - 1; i >= 0; i--) {
                    if (assetPrices[i].date <= snapshotDate) {
                        price = assetPrices[i].price;
                        break;
                    }
                }

                assetsWithPrice.push({
                    assetId: assetId,
                    quantity: state.quantity,
                    unitPrice: price,
                    marketValue: state.quantity * price,
                    totalCost: state.cost
                });
            }

            return {
                id: s.id,
                date: s.date,
                totalValue: s.total_value,
                totalInvested: s.total_invested,
                assets: assetsWithPrice
            };
        });
        
        return result;
    },

    getDetails: async (id) => {
        // 1. Get Snapshot Metadata
        const headerRows = await getQuery("SELECT id, date, total_value as totalValue, total_invested as totalInvested, note FROM snapshots WHERE id = ?", [id]);
        if (headerRows.length === 0) throw { statusCode: 404, message: "Snapshot not found" };
        const snapshot = headerRows[0];
        const snapshotDate = snapshot.date;

        // 2. Aggregate Transactions up to this date to determine Holdings (Quantity & Cost)
        const holdingsSql = `
            SELECT 
                t.asset_id as assetId,
                SUM(t.quantity_change) as quantity,
                SUM(t.cost_change) as totalCost
            FROM transactions t
            WHERE t.date <= ?
            GROUP BY t.asset_id
            HAVING quantity != 0
        `;
        const holdings = await getQuery(holdingsSql, [snapshotDate]);

        // 3. Get Changes specific to THIS snapshot month (Transaction Flow)
        // We use the snapshot_id link on transactions for precise editing/viewing of "This Month's Actions"
        const flowSql = `
            SELECT asset_id, quantity_change, cost_change 
            FROM transactions 
            WHERE snapshot_id = ?
        `;
        const flows = await getQuery(flowSql, [id]);
        const flowMap = new Map();
        flows.forEach(f => flowMap.set(f.asset_id, { q: f.quantity_change, c: f.cost_change }));

        // 4. Fetch Asset Metadata & Prices
        const fullAssets = await Promise.all(holdings.map(async (h) => {
            const assetInfo = await getQuery("SELECT name, type FROM assets WHERE id = ?", [h.assetId]);
            const meta = assetInfo[0] || { name: 'Unknown', type: 'other' };

            // Fetch Price: Independent Market Price Table
            const priceRow = await getQuery(`
                SELECT price FROM market_prices 
                WHERE asset_id = ? AND date <= ? 
                ORDER BY date DESC LIMIT 1
            `, [h.assetId, snapshotDate]);

            // Default price logic: 
            // If it's cash-like (fixed/wealth) and no price found, default to 1. 
            // Otherwise default to 0 (or calculate from cost? No, price should be explicit).
            let unitPrice = priceRow.length > 0 ? priceRow[0].price : 0;
            if (unitPrice === 0 && (meta.type === 'fixed' || meta.type === 'wealth')) {
                unitPrice = 1;
            }

            const currentFlow = flowMap.get(h.assetId) || { q: 0, c: 0 };

            return {
                id: uuidv4(), // Virtual ID for UI key
                assetId: h.assetId,
                name: meta.name,
                category: meta.type,
                unitPrice: unitPrice,
                quantity: h.quantity,
                marketValue: h.quantity * unitPrice,
                totalCost: h.totalCost,
                addedQuantity: currentFlow.q,
                addedPrincipal: currentFlow.c
            };
        }));

        snapshot.assets = fullAssets;
        return snapshot;
    },

    createOrUpdate: async (data) => {
        const { date, assets, note } = data; // assets here contains the UI payload (including addedQuantity, etc)
        
        if (!date || !Array.isArray(assets)) {
            throw { statusCode: 400, message: "Invalid snapshot data format" };
        }

        return await withTransaction(async () => {
            const now = Date.now();

            // 1. Handle Snapshot Header
            const snapRows = await getQuery("SELECT id FROM snapshots WHERE date = ?", [date]);
            const snapshotId = snapRows.length > 0 ? snapRows[0].id : uuidv4();

            // 2. Process Transactions & Prices
            // Since this is a "Snapshot Save", we are defining the state for this month.
            // We need to clear previous transactions linked to this snapshot_id to avoid duplication if editing.
            await runQuery("DELETE FROM transactions WHERE snapshot_id = ?", [snapshotId]);
            
            // 3. Process each asset insert strictly sequentially
            for (const asset of assets) {
                // A. Save Price
                if (asset.unitPrice !== undefined && asset.unitPrice !== null) {
                    await runQuery(`
                        INSERT INTO market_prices (id, asset_id, date, price, source, updated_at)
                        VALUES (?, ?, ?, ?, 'manual', ?)
                        ON CONFLICT(asset_id, date) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at
                    `, [uuidv4(), asset.assetId, date, asset.unitPrice, now]);
                }

                // B. Save Transaction (Flow)
                const qChange = parseFloat(asset.addedQuantity) || 0;
                const cChange = parseFloat(asset.addedPrincipal) || 0;
                
                if (Math.abs(qChange) > 0 || Math.abs(cChange) > 0) {
                     await runQuery(`
                        INSERT INTO transactions (id, asset_id, snapshot_id, date, type, quantity_change, cost_change, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     `, [uuidv4(), asset.assetId, snapshotId, date, 'adjustment', qChange, cChange, now]);
                }
            }

            // 4. Recalculate Portfolio Totals (Derived from Ledger + Prices)
            const holdingsSql = `
                SELECT 
                    t.asset_id,
                    SUM(t.quantity_change) as quantity,
                    SUM(t.cost_change) as totalCost
                FROM transactions t
                WHERE t.date <= ?
                GROUP BY t.asset_id
            `;
            const allHoldings = await getQuery(holdingsSql, [date]);
            
            let calcTotalValue = 0;
            let calcTotalInvested = 0;

            for (const h of allHoldings) {
                // Get latest price
                const priceRow = await getQuery(`SELECT price FROM market_prices WHERE asset_id=? AND date<=? ORDER BY date DESC LIMIT 1`, [h.asset_id, date]);
                const price = priceRow.length > 0 ? priceRow[0].price : (assets.find(a => a.assetId === h.asset_id)?.unitPrice || 0);
                
                calcTotalValue += (h.quantity * price);
                calcTotalInvested += h.totalCost;
            }

            // 5. Update Header with calculated totals (Cache)
            if (snapRows.length > 0) {
                await runQuery("UPDATE snapshots SET total_value=?, total_invested=?, note=?, updated_at=? WHERE id=?", 
                    [calcTotalValue, calcTotalInvested, note, now, snapshotId]);
            } else {
                await runQuery("INSERT INTO snapshots (id, date, total_value, total_invested, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [snapshotId, date, calcTotalValue, calcTotalInvested, note, now, now]);
            }

            return { success: true, id: snapshotId };
        });
    }
};
