
import { v4 as uuidv4 } from 'uuid';
import { db, runQuery, getQuery, withTransaction } from '../db.js';

export const StrategyService = {
    getAll: async () => {
        // 1. Fetch flat data
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

        // 2. Hydrate hierarchy in memory (More robust than SQL aggregations for complex trees)
        return versions.map(v => {
            const vLayers = layers.filter(l => l.versionId === v.id).map(l => {
                const lTargets = targets.filter(t => t.layerId === l.id).map(t => ({
                    id: t.id,
                    assetId: t.assetId,
                    // Use alias if exists, else fallback to asset name
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
    },

    create: async (data) => {
        const { name, description, startDate, layers } = data;
        const versionId = uuidv4();
        const now = Date.now();

        return await withTransaction(async () => {
            await runQuery(
                "INSERT INTO strategy_versions (id, name, description, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
                [versionId, name, description, startDate, now]
            );

            if (layers && layers.length > 0) {
                const layerStmt = db.prepare("INSERT INTO strategy_layers (id, version_id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
                const targetStmt = db.prepare("INSERT INTO strategy_targets (id, layer_id, asset_id, target_name, weight, color, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                
                for (let lIdx = 0; lIdx < layers.length; lIdx++) {
                    const layer = layers[lIdx];
                    const layerId = uuidv4();
                    layerStmt.run(layerId, versionId, layer.name, layer.weight, layer.description || '', lIdx);
                    
                    if (layer.items) {
                        for (let tIdx = 0; tIdx < layer.items.length; tIdx++) {
                            const item = layer.items[tIdx];
                            targetStmt.run(
                                uuidv4(), layerId, item.assetId, item.targetName, item.weight, item.color, item.note || '', tIdx
                            );
                        }
                    }
                }
                layerStmt.finalize();
                targetStmt.finalize();
            }
            return { success: true, id: versionId };
        });
    },

    update: async (id, data) => {
        const { name, description, startDate, status, layers } = data;

        return await withTransaction(async () => {
            // 1. Update Version Metadata
            await runQuery(
                "UPDATE strategy_versions SET name=?, description=?, start_date=?, status=? WHERE id=?",
                [name, description, startDate, status, id]
            );

            // 2. Diff Update Logic for Layers
            // Get existing layers to compare
            const existingLayers = await getQuery("SELECT id FROM strategy_layers WHERE version_id = ?", [id]);
            const existingLayerIds = new Set(existingLayers.map(l => l.id));
            const incomingLayerIds = new Set();
            
            // Prepare statements
            const insertLayerStmt = db.prepare("INSERT INTO strategy_layers (id, version_id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
            const updateLayerStmt = db.prepare("UPDATE strategy_layers SET name=?, weight=?, description=?, sort_order=? WHERE id=?");
            
            // We also need to handle targets. For simplicity in this "Diff" implementation:
            // We will sync layers carefully (keeping IDs stable), but strictly rewrite targets for each layer.
            // Why? Because targets often change sort order or are swapped entirely. 
            // Keeping Layer IDs stable is the most important part for potential future history tracking.
            const deleteTargetsInLayerStmt = db.prepare("DELETE FROM strategy_targets WHERE layer_id = ?");
            const insertTargetStmt = db.prepare("INSERT INTO strategy_targets (id, layer_id, asset_id, target_name, weight, color, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

            if (layers && layers.length > 0) {
                for (let lIdx = 0; lIdx < layers.length; lIdx++) {
                    const layer = layers[lIdx];
                    
                    let layerId = layer.id;
                    if (layerId && existingLayerIds.has(layerId)) {
                        // Update existing layer
                        updateLayerStmt.run(layer.name, layer.weight, layer.description || '', lIdx, layerId);
                        incomingLayerIds.add(layerId);
                        
                        // Clear targets for this layer to re-insert (Simpler than full diff for leaf nodes)
                        deleteTargetsInLayerStmt.run(layerId);
                    } else {
                        // Insert new layer
                        layerId = (layer.id && layer.id.length > 10) ? layer.id : uuidv4();
                        insertLayerStmt.run(layerId, id, layer.name, layer.weight, layer.description || '', lIdx);
                        incomingLayerIds.add(layerId);
                    }

                    // Insert Targets
                    if (layer.items) {
                        for (let tIdx = 0; tIdx < layer.items.length; tIdx++) {
                            const item = layer.items[tIdx];
                            // Keep target ID if provided, else new
                            const itemId = (item.id && item.id.length > 10) ? item.id : uuidv4();
                            insertTargetStmt.run(
                                itemId, layerId, item.assetId, item.targetName, item.weight, item.color, item.note || '', tIdx
                            );
                        }
                    }
                }
            }

            // 3. Delete removed layers
            // Convert Set to Array for iteration
            const layersToDelete = [...existingLayerIds].filter(x => !incomingLayerIds.has(x));
            if (layersToDelete.length > 0) {
                // Targets cascade delete via DB constraints, but let's be safe/explicit if needed. 
                // schema has ON DELETE CASCADE so removing layer is enough.
                const placeholders = layersToDelete.map(() => '?').join(',');
                await runQuery(`DELETE FROM strategy_layers WHERE id IN (${placeholders})`, layersToDelete);
            }

            insertLayerStmt.finalize();
            updateLayerStmt.finalize();
            deleteTargetsInLayerStmt.finalize();
            insertTargetStmt.finalize();

            return { success: true, id };
        });
    },

    delete: async (id) => {
        await runQuery("DELETE FROM strategy_versions WHERE id=?", [id]);
        return { success: true };
    }
};
