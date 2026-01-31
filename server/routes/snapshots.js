
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, runQuery, getQuery } from '../db.js';

const router = express.Router();

// 1. GET / - Lightweight Summary List (No Assets)
router.get('/', async (req, res) => {
    const sql = `
        SELECT id, date, total_value as totalValue, total_invested as totalInvested, note
        FROM snapshots
        ORDER BY date DESC
    `;
    try {
        const rows = await getQuery(sql);
        res.json(rows);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// 2. GET /:id - Full Details for a Single Snapshot
router.get('/:id', async (req, res) => {
    try {
        // Get Header
        const headerRows = await getQuery("SELECT id, date, total_value as totalValue, total_invested as totalInvested, note FROM snapshots WHERE id = ?", [req.params.id]);
        if (headerRows.length === 0) return res.status(404).json({error: "Snapshot not found"});
        
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
        const positions = await getQuery(posSql, [req.params.id]);
        
        snapshot.assets = positions;
        res.json(snapshot);

    } catch (e) { res.status(500).json({error: e.message}); }
});

// 3. POST / - Save Snapshot (Transactional)
router.post('/', async (req, res) => {
    const { date, assets, note } = req.body; 
    
    if (!date || !Array.isArray(assets)) {
        return res.status(400).json({ error: "Invalid snapshot data format" });
    }
    
    try {
        const row = await getQuery("SELECT id FROM snapshots WHERE date = ?", [date]);
        const snapshotId = row.length > 0 ? row[0].id : uuidv4();
        const now = Date.now();
        
        const totalValue = assets.reduce((sum, a) => sum + (parseFloat(a.quantity) * parseFloat(a.unitPrice)), 0);
        const totalInvested = assets.reduce((sum, a) => sum + parseFloat(a.totalCost), 0);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            if (row.length > 0) {
                db.run("UPDATE snapshots SET total_value=?, total_invested=?, note=?, updated_at=? WHERE id=?", 
                    [totalValue, totalInvested, note, now, snapshotId]);
                // Optimization: In a real prod app, we should diff/update, but for this scale, 
                // replace-all within a transaction is acceptable if atomic.
                db.run("DELETE FROM positions WHERE snapshot_id=?", [snapshotId]);
            } else {
                db.run("INSERT INTO snapshots (id, date, total_value, total_invested, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [snapshotId, date, totalValue, totalInvested, note, now, now]);
            }

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

            db.run("COMMIT", (err) => {
                if (err) res.status(500).json({error: err.message});
                else res.json({ success: true, id: snapshotId });
            });
        });
    } catch(e) { res.status(500).json({error: e.message}); }
});

export default router;
