
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, runQuery, getQuery } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    // Optimization: Build the JSON object with correct camelCase keys directly in SQL
    const sql = `
        SELECT 
            s.id, s.date, s.total_value as totalValue, s.total_invested as totalInvested, s.note,
            json_group_array(
                json_object(
                    'id', p.id,
                    'assetId', p.asset_id,
                    'name', a.name,
                    'category', a.type,
                    'unitPrice', p.price,
                    'quantity', p.quantity,
                    'marketValue', (p.quantity * p.price),
                    'totalCost', p.total_cost,
                    'addedQuantity', p.added_quantity,
                    'addedPrincipal', p.added_principal
                )
            ) as assets
        FROM snapshots s
        LEFT JOIN positions p ON s.id = p.snapshot_id
        LEFT JOIN assets a ON p.asset_id = a.id
        GROUP BY s.id
        ORDER BY s.date DESC
    `;

    try {
        const rows = await getQuery(sql);
        const result = rows.map(row => ({
            id: row.id,
            date: row.date,
            totalValue: row.totalValue,
            totalInvested: row.totalInvested,
            note: row.note,
            assets: JSON.parse(row.assets).filter(x => x.id !== null)
        }));
        res.json(result);
    } catch (e) { res.status(500).json({error: e.message}); }
});

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
