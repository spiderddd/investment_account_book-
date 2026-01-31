
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, runQuery, getQuery } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        // SQL Aliasing avoids the need for keysToCamel
        const versions = await getQuery("SELECT id, name, description, start_date as startDate, status FROM strategy_versions ORDER BY start_date DESC");
        const layers = await getQuery("SELECT id, version_id as versionId, name, weight, description FROM strategy_layers ORDER BY sort_order ASC, weight DESC");
        const targets = await getQuery(`
            SELECT t.id, t.layer_id as layerId, t.asset_id as assetId, 
                   t.target_name as targetName, t.weight, t.color, t.note,
                   a.name as originalAssetName 
            FROM strategy_targets t
            LEFT JOIN assets a ON t.asset_id = a.id
            ORDER BY t.sort_order ASC, t.weight DESC
        `);

        // Assemble hierarchy
        const result = versions.map(v => {
            const vLayers = layers.filter(l => l.versionId === v.id).map(l => {
                const lTargets = targets.filter(t => t.layerId === l.id).map(t => ({
                    id: t.id,
                    assetId: t.assetId,
                    targetName: t.targetName || t.originalAssetName,
                    weight: t.weight,
                    color: t.color,
                    note: t.note
                }));

                return {
                    id: l.id,
                    name: l.name,
                    weight: l.weight,
                    description: l.description,
                    items: lTargets
                };
            });

            return { ...v, layers: vLayers };
        });
        
        res.json(result);
    } catch (e) { res.status(500).json({error: e.message}); }
});

router.post('/', async (req, res) => {
    const { name, description, startDate, layers } = req.body;
    const versionId = uuidv4();
    const now = Date.now();
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("INSERT INTO strategy_versions (id, name, description, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
            [versionId, name, description, startDate, now]);
            
        if (layers && layers.length > 0) {
            const layerStmt = db.prepare("INSERT INTO strategy_layers (id, version_id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
            const targetStmt = db.prepare("INSERT INTO strategy_targets (id, layer_id, asset_id, target_name, weight, color, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            
            layers.forEach((layer, lIdx) => {
                const layerId = uuidv4();
                layerStmt.run(layerId, versionId, layer.name, layer.weight, layer.description || '', lIdx);
                
                if (layer.items) {
                    layer.items.forEach((item, tIdx) => {
                        targetStmt.run(
                            uuidv4(), layerId, item.assetId, item.targetName, item.weight, item.color, item.note || '', tIdx
                        );
                    });
                }
            });
            layerStmt.finalize();
            targetStmt.finalize();
        }
        
        db.run("COMMIT", (err) => {
            if (err) res.status(500).json({error: err.message});
            else res.json({ success: true, id: versionId });
        });
    });
});

router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { name, description, startDate, status, layers } = req.body;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("UPDATE strategy_versions SET name=?, description=?, start_date=?, status=? WHERE id=?",
            [name, description, startDate, status, id]);

        db.run("DELETE FROM strategy_targets WHERE layer_id IN (SELECT id FROM strategy_layers WHERE version_id=?)", [id]);
        db.run("DELETE FROM strategy_layers WHERE version_id=?", [id]);
        
        if (layers && layers.length > 0) {
            const layerStmt = db.prepare("INSERT INTO strategy_layers (id, version_id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
            const targetStmt = db.prepare("INSERT INTO strategy_targets (id, layer_id, asset_id, target_name, weight, color, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            
            layers.forEach((layer, lIdx) => {
                const layerId = layer.id || uuidv4(); 
                layerStmt.run(layerId, id, layer.name, layer.weight, layer.description || '', lIdx);
                
                if (layer.items) {
                    layer.items.forEach((item, tIdx) => {
                        targetStmt.run(
                            item.id || uuidv4(), layerId, item.assetId, item.targetName, item.weight, item.color, item.note || '', tIdx
                        );
                    });
                }
            });
            layerStmt.finalize();
            targetStmt.finalize();
        }

        db.run("COMMIT", (err) => {
            if (err) res.status(500).json({error: err.message});
            else res.json({ success: true, id });
        });
    });
});

router.delete('/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM strategy_versions WHERE id=?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

export default router;
