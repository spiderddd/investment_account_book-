
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery, withTransaction } from '../db.js';

export const SnapshotService = {
    getList: async (page = 1, limit = 20) => {
        const offset = (page - 1) * limit;
        const countResult = await getQuery("SELECT COUNT(*) as count FROM snapshots");
        const total = countResult[0].count;
        
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

    // Optimized: Get nearest previous snapshot without fetching full history list
    getPrevious: async (date) => {
        const sql = `
            SELECT id, date, total_value, total_invested, note
            FROM snapshots
            WHERE date < ?
            ORDER BY date DESC
            LIMIT 1
        `;
        const rows = await getQuery(sql, [date]);
        if (rows.length === 0) return null;
        
        // Hydrate with details for the 'copy from previous' feature
        return await SnapshotService.getDetails(rows[0].id);
    },

    getHistoryGraph: async () => {
        // Optimized O(Transactions) traversal logic for graph generation
        const snapshots = await getQuery("SELECT id, date, total_value, total_invested FROM snapshots ORDER BY date ASC");
        const allTxs = await getQuery("SELECT asset_id, date, quantity_change, cost_change FROM transactions ORDER BY date ASC");
        const allPrices = await getQuery("SELECT asset_id, date, price FROM market_prices ORDER BY date ASC");
        
        const pricesByAsset = new Map();
        allPrices.forEach(p => {
             if (!pricesByAsset.has(p.asset_id)) pricesByAsset.set(p.asset_id, []);
             pricesByAsset.get(p.asset_id).push(p);
        });

        const runningState = new Map(); 
        let txCursor = 0;
        const totalTxs = allTxs.length;

        const result = snapshots.map(s => {
            const snapshotDate = s.date;
            
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

            const assetsWithPrice = [];
            for (const [assetId, state] of runningState.entries()) {
                if (Math.abs(state.quantity) < 0.000001) continue;
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
        const headerRows = await getQuery("SELECT id, date, total_value as totalValue, total_invested as totalInvested, note FROM snapshots WHERE id = ?", [id]);
        if (headerRows.length === 0) throw { statusCode: 404, message: "Snapshot not found" };
        const snapshot = headerRows[0];
        const snapshotDate = snapshot.date;

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

        const flowSql = `SELECT asset_id, quantity_change, cost_change FROM transactions WHERE snapshot_id = ?`;
        const flows = await getQuery(flowSql, [id]);
        const flowMap = new Map();
        flows.forEach(f => flowMap.set(f.asset_id, { q: f.quantity_change, c: f.cost_change }));

        const fullAssets = await Promise.all(holdings.map(async (h) => {
            const assetInfo = await getQuery("SELECT name, type FROM assets WHERE id = ?", [h.assetId]);
            const meta = assetInfo[0] || { name: 'Unknown', type: 'other' };

            const priceRow = await getQuery(`
                SELECT price FROM market_prices 
                WHERE asset_id = ? AND date <= ? 
                ORDER BY date DESC LIMIT 1
            `, [h.assetId, snapshotDate]);

            let unitPrice = priceRow.length > 0 ? priceRow[0].price : 0;
            if (unitPrice === 0 && (meta.type === 'fixed' || meta.type === 'wealth')) {
                unitPrice = 1;
            }

            const currentFlow = flowMap.get(h.assetId) || { q: 0, c: 0 };

            return {
                id: uuidv4(),
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

    // Treat 'snapshots' table as a Write-Through Cache
    createOrUpdate: async (data) => {
        const { date, assets, note } = data;
        
        if (!date || !Array.isArray(assets)) {
            throw { statusCode: 400, message: "Invalid snapshot data format" };
        }

        return await withTransaction(async () => {
            const now = Date.now();
            const snapRows = await getQuery("SELECT id FROM snapshots WHERE date = ?", [date]);
            const snapshotId = snapRows.length > 0 ? snapRows[0].id : uuidv4();

            await runQuery("DELETE FROM transactions WHERE snapshot_id = ?", [snapshotId]);
            
            for (const asset of assets) {
                if (asset.unitPrice !== undefined && asset.unitPrice !== null) {
                    await runQuery(`
                        INSERT INTO market_prices (id, asset_id, date, price, source, updated_at)
                        VALUES (?, ?, ?, ?, 'manual', ?)
                        ON CONFLICT(asset_id, date) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at
                    `, [uuidv4(), asset.assetId, date, asset.unitPrice, now]);
                }

                const qChange = parseFloat(asset.addedQuantity) || 0;
                const cChange = parseFloat(asset.addedPrincipal) || 0;
                
                if (Math.abs(qChange) > 0 || Math.abs(cChange) > 0) {
                     await runQuery(`
                        INSERT INTO transactions (id, asset_id, snapshot_id, date, type, quantity_change, cost_change, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     `, [uuidv4(), asset.assetId, snapshotId, date, 'adjustment', qChange, cChange, now]);
                }
            }

            // Recalculate Totals (The "Cache" part)
            const holdingsSql = `
                SELECT t.asset_id, SUM(t.quantity_change) as quantity, SUM(t.cost_change) as totalCost
                FROM transactions t WHERE t.date <= ? GROUP BY t.asset_id
            `;
            const allHoldings = await getQuery(holdingsSql, [date]);
            
            let calcTotalValue = 0;
            let calcTotalInvested = 0;

            for (const h of allHoldings) {
                const priceRow = await getQuery(`SELECT price FROM market_prices WHERE asset_id=? AND date<=? ORDER BY date DESC LIMIT 1`, [h.asset_id, date]);
                const price = priceRow.length > 0 ? priceRow[0].price : (assets.find(a => a.assetId === h.asset_id)?.unitPrice || 0);
                calcTotalValue += (h.quantity * price);
                calcTotalInvested += h.totalCost;
            }

            if (snapRows.length > 0) {
                await runQuery("UPDATE snapshots SET total_value=?, total_invested=?, note=?, updated_at=? WHERE id=?", 
                    [calcTotalValue, calcTotalInvested, note, now, snapshotId]);
            } else {
                await runQuery("INSERT INTO snapshots (id, date, total_value, total_invested, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [snapshotId, date, calcTotalValue, calcTotalInvested, note, now, now]);
            }

            return { success: true, id: snapshotId };
        });
    },

    // New: Admin function to completely rebuild the 'snapshots' cache fields from raw transaction logs
    // Call this if data feels inconsistent.
    recalculateCache: async () => {
        const snapshots = await getQuery("SELECT id, date FROM snapshots");
        let updatedCount = 0;

        await withTransaction(async () => {
            for (const s of snapshots) {
                const date = s.date;
                // 1. Sum holdings
                const holdingsSql = `
                    SELECT t.asset_id, SUM(t.quantity_change) as quantity, SUM(t.cost_change) as totalCost
                    FROM transactions t WHERE t.date <= ? GROUP BY t.asset_id
                `;
                const holdings = await getQuery(holdingsSql, [date]);
                
                let val = 0; 
                let inv = 0;
                
                // 2. Calculate Value
                for (const h of holdings) {
                    if (Math.abs(h.quantity) < 0.000001) continue;
                    const priceRow = await getQuery(`SELECT price FROM market_prices WHERE asset_id=? AND date<=? ORDER BY date DESC LIMIT 1`, [h.asset_id, date]);
                    const price = priceRow.length > 0 ? priceRow[0].price : 0;
                    val += (h.quantity * price);
                    inv += h.totalCost;
                }
                
                // 3. Update Cache
                await runQuery("UPDATE snapshots SET total_value=?, total_invested=? WHERE id=?", [val, inv, s.id]);
                updatedCount++;
            }
        });
        return { success: true, count: updatedCount };
    }
};
