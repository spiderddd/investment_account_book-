
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const sql = "SELECT id, type, name, ticker, note, created_at as createdAt FROM assets ORDER BY created_at DESC";
        const rows = await getQuery(sql);
        res.json(rows);
    } catch (e) { res.status(500).json({error: e.message}); }
});

router.post('/', async (req, res) => {
    const { name, type, ticker, note } = req.body;
    if (!name || !type) return res.status(400).json({error: "Name and Type required"});

    const id = uuidv4();
    const now = Date.now();
    try {
        await runQuery(
            "INSERT INTO assets (id, type, name, ticker, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", 
            [id, type, name, ticker, note, now]
        );
        res.json({ id, name, type, ticker, note, createdAt: now });
    } catch (e) { res.status(500).json({error: e.message}); }
});

router.put('/:id', async (req, res) => {
    const { name, type, ticker, note } = req.body;
    try {
        await runQuery(
            "UPDATE assets SET name = ?, type = ?, ticker = ?, note = ? WHERE id = ?", 
            [name, type, ticker, note, req.params.id]
        );
        res.json({ success: true, id: req.params.id });
    } catch (e) { res.status(500).json({error: e.message}); }
});

router.delete('/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM assets WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

router.get('/:id/history', async (req, res) => {
    const assetId = req.params.id;
    const sql = `
        SELECT 
            s.date,
            p.price as unitPrice,
            p.quantity,
            (p.quantity * p.price) as marketValue,
            p.total_cost as totalCost,
            p.added_quantity as addedQuantity,
            p.added_principal as addedPrincipal
        FROM positions p
        JOIN snapshots s ON p.snapshot_id = s.id
        WHERE p.asset_id = ?
        ORDER BY s.date ASC
    `;
    
    try {
        const rows = await getQuery(sql, [assetId]);
        res.json(rows);
    } catch (e) { res.status(500).json({error: e.message}); }
});

export default router;
