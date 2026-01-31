
import { v4 as uuidv4 } from 'uuid';
import { db, runQuery, getQuery, withTransaction } from '../db.js';

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
        // REFACTOR: Calculate history dynamically from Transactions + Prices
        // For performance in this specific "Graph" endpoint, we can still use the 
        // snapshots header table which caches the totals. 
        // But for asset breakdowns, we should aggregate transactions.
        
        // 1. Get all Snapshot Headers (Dates we care about)
        const snapshots = await getQuery("SELECT id, date, total_value, total_invested FROM snapshots ORDER BY date ASC");
        
        const result = [];
        
        for (const s of snapshots) {
            // Calculate Asset positions at this date
            const assetsSql = `
                SELECT 
                    t.asset_id as assetId,
                    SUM(t.quantity_change) as quantity,
                    SUM(t.cost_change) as totalCost
                FROM transactions t
                WHERE t.date <= ?
                GROUP BY t.asset_id
                HAVING quantity != 0
            `;
            const assetsState = await getQuery(assetsSql, [s.date]);

            const assetsWithPrice = await Promise.all(assetsState.map(async (a) => {
                // Find price: Exact match OR Closest previous price
                const priceRow = await getQuery(`
                    SELECT price FROM market_prices 
                    WHERE asset_id = ? AND date <= ? 
                    ORDER BY date DESC LIMIT 1
                `, [a.assetId, s.date]);
                
                const price = priceRow.length > 0 ? priceRow[0].price : 0; // Or fallback to 1 for cash? 
                
                return {
                    assetId: a.assetId,
                    marketValue: a.quantity * price,
                    totalCost: a.totalCost
                };
            }));

            result.push({
                id: s.id,
                date: s.date,
                totalValue: s.total_value,
                totalInvested: s.total_invested,
                assets: assetsWithPrice
            });
        }
        
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
            
            // We also insert/update prices for this date
            const priceInsertStmt = db.prepare(`
                INSERT INTO market_prices (id, asset_id, date, price, source, updated_at)
                VALUES (?, ?, ?, ?, 'manual', ?)
                ON CONFLICT(asset_id, date) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at
            `);

            const transactionStmt = db.prepare(`
                INSERT INTO transactions (id, asset_id, snapshot_id, date, type, quantity_change, cost_change, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const asset of assets) {
                // A. Save Price
                if (asset.unitPrice !== undefined && asset.unitPrice !== null) {
                    priceInsertStmt.run(uuidv4(), asset.assetId, date, asset.unitPrice, now);
                }

                // B. Save Transaction (Flow)
                // Only save if there is actual change
                const qChange = parseFloat(asset.addedQuantity) || 0;
                const cChange = parseFloat(asset.addedPrincipal) || 0;
                
                if (Math.abs(qChange) > 0 || Math.abs(cChange) > 0) {
                     transactionStmt.run(
                        uuidv4(),
                        asset.assetId,
                        snapshotId,
                        date,
                        'adjustment', // generic type for snapshot adjustments
                        qChange,
                        cChange,
                        now
                     );
                }
            }
            priceInsertStmt.finalize();
            transactionStmt.finalize();

            // 3. Recalculate Portfolio Totals (Derived from Ledger + Prices)
            // We need to re-query the state because "Quantity" depends on ALL history, not just this input
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

            // 4. Update Header with calculated totals (Cache)
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
