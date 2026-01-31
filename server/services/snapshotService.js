
import { v4 as uuidv4 } from 'uuid';
import { db, runQuery, getQuery, withTransaction } from '../db.js';

export const SnapshotService = {
    getList: async () => {
        // Updated to join positions and assets to return full tree structure
        // This ensures AssetManager has data to calculate current holdings
        const sql = `
            SELECT 
                s.id, s.date, s.total_value as totalValue, s.total_invested as totalInvested, s.note,
                p.id as posId, p.asset_id as assetId, 
                p.quantity, p.price, p.total_cost as totalCost,
                p.added_quantity as addedQuantity, p.added_principal as addedPrincipal,
                (p.quantity * p.price) as marketValue,
                a.name as assetName, a.type as assetCategory
            FROM snapshots s
            LEFT JOIN positions p ON p.snapshot_id = s.id
            LEFT JOIN assets a ON p.asset_id = a.id
            ORDER BY s.date DESC
        `;
        
        const rows = await getQuery(sql);
        
        const map = new Map();
        rows.forEach(r => {
             if (!map.has(r.id)) {
                 map.set(r.id, {
                     id: r.id,
                     date: r.date,
                     totalValue: r.totalValue,
                     totalInvested: r.totalInvested,
                     note: r.note,
                     assets: []
                 });
             }
             
             if (r.posId) {
                 map.get(r.id).assets.push({
                     id: r.posId,
                     assetId: r.assetId,
                     name: r.assetName,
                     category: r.assetCategory,
                     unitPrice: r.price,
                     quantity: r.quantity,
                     marketValue: r.marketValue,
                     totalCost: r.totalCost,
                     addedQuantity: r.addedQuantity,
                     addedPrincipal: r.addedPrincipal
                 });
             }
        });
        
        return Array.from(map.values());
    },

    getHistoryGraph: async () => {
        // REFACTOR: Replaced SQLite json_group_array with standard JOIN + In-Memory Aggregation
        // This is more portable and easier to debug.
        const sql = `
            SELECT 
                s.id as snapshotId, s.date, 
                s.total_value as totalValue, 
                s.total_invested as totalInvested,
                p.asset_id as assetId,
                (p.quantity * p.price) as marketValue,
                p.total_cost as totalCost
            FROM snapshots s
            LEFT JOIN positions p ON p.snapshot_id = s.id
            ORDER BY s.date ASC
        `;
        
        const rows = await getQuery(sql);
        
        // Group by Snapshot
        const map = new Map();
        rows.forEach(row => {
            if (!map.has(row.snapshotId)) {
                map.set(row.snapshotId, {
                    id: row.snapshotId,
                    date: row.date,
                    totalValue: row.totalValue,
                    totalInvested: row.totalInvested,
                    assets: []
                });
            }
            if (row.assetId) {
                map.get(row.snapshotId).assets.push({
                    assetId: row.assetId,
                    marketValue: row.marketValue,
                    totalCost: row.totalCost
                });
            }
        });
        
        return Array.from(map.values());
    },

    getDetails: async (id) => {
        // Get Header
        const headerRows = await getQuery("SELECT id, date, total_value as totalValue, total_invested as totalInvested, note FROM snapshots WHERE id = ?", [id]);
        if (headerRows.length === 0) throw { statusCode: 404, message: "Snapshot not found" };
        
        const snapshot = headerRows[0];

        // Get Positions
        const posSql = `
            SELECT 
                p.id, p.asset_id as assetId, 
                a.name, a.type as category,
                p.price as unitPrice, p.quantity, 
                (p.quantity * p.price) as marketValue,
                p.total_cost as totalCost,
                p.added_quantity as addedQuantity,
                p.added_principal as addedPrincipal
            FROM positions p
            LEFT JOIN assets a ON p.asset_id = a.id
            WHERE p.snapshot_id = ?
        `;
        const positions = await getQuery(posSql, [id]);
        
        snapshot.assets = positions;
        return snapshot;
    },

    createOrUpdate: async (data) => {
        const { date, assets, note } = data;
        
        if (!date || !Array.isArray(assets)) {
            throw { statusCode: 400, message: "Invalid snapshot data format" };
        }

        return await withTransaction(async () => {
            // Check for existing snapshot on this date
            const row = await getQuery("SELECT id FROM snapshots WHERE date = ?", [date]);
            const snapshotId = row.length > 0 ? row[0].id : uuidv4();
            const now = Date.now();
            
            // SECURITY/CONSISTENCY FIX: 
            // Recalculate totals on server side instead of trusting frontend sum.
            const calculatedTotalValue = assets.reduce((sum, a) => sum + (parseFloat(a.quantity) * parseFloat(a.unitPrice)), 0);
            const calculatedTotalInvested = assets.reduce((sum, a) => sum + parseFloat(a.totalCost), 0);

            if (row.length > 0) {
                // Update Header
                await runQuery("UPDATE snapshots SET total_value=?, total_invested=?, note=?, updated_at=? WHERE id=?", 
                    [calculatedTotalValue, calculatedTotalInvested, note, now, snapshotId]);
                
                // For positions, full replace is still the safest "Snapshot" strategy 
                // because mapping partial edits to positions is complex without stable Position IDs from UI.
                await runQuery("DELETE FROM positions WHERE snapshot_id=?", [snapshotId]);
            } else {
                // Insert Header
                await runQuery("INSERT INTO snapshots (id, date, total_value, total_invested, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [snapshotId, date, calculatedTotalValue, calculatedTotalInvested, note, now, now]);
            }

            // Bulk Insert Positions
            const stmt = db.prepare(`
                INSERT INTO positions 
                (id, snapshot_id, asset_id, quantity, price, total_cost, added_quantity, added_principal, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            assets.forEach(a => {
                stmt.run(
                    uuidv4(), 
                    snapshotId, 
                    a.assetId || a.id, 
                    a.quantity, 
                    a.unitPrice, 
                    a.totalCost, 
                    a.addedQuantity || 0, 
                    a.addedPrincipal || 0,
                    now
                );
            });
            stmt.finalize();

            return { success: true, id: snapshotId };
        });
    }
};
