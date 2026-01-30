/**
 * InvestTrack NAS Server
 * 
 * 部署说明:
 * 1. 在 NAS 上安装 Node.js
 * 2. 创建目录并将此文件放入
 * 3. 运行 `npm init -y` (确保 package.json 中有 "type": "module")
 * 4. 运行 `npm install express sqlite3 cors body-parser uuid`
 * 5. 启动 `node server.js`
 */

import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR);
}
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'invest_track_v2.db');

app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

const sqlite3Verbose = sqlite3.verbose();
const db = new sqlite3Verbose.Database(DB_PATH);

// --- Database Schema (Redesigned) ---
const initSql = `
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    ticker TEXT,
    note TEXT,
    created_at INTEGER
);

CREATE TABLE IF NOT EXISTS strategy_versions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at INTEGER
);

-- New Table: Layers (Level 2)
CREATE TABLE IF NOT EXISTS strategy_layers (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    name TEXT NOT NULL,
    weight REAL NOT NULL, -- The weight of this layer in the whole portfolio (0-100)
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(version_id) REFERENCES strategy_versions(id) ON DELETE CASCADE
);

-- Updated Table: Targets (Level 3) - Linked to Layer, not Version directly
CREATE TABLE IF NOT EXISTS strategy_targets (
    id TEXT PRIMARY KEY,
    layer_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    target_name TEXT, -- Can override asset name
    weight REAL NOT NULL, -- The weight of this target in the LAYER (0-100)
    color TEXT,
    note TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(layer_id) REFERENCES strategy_layers(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    total_value REAL,
    total_invested REAL,
    note TEXT,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    strategy_id TEXT,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    -- market_value REMOVED: Calculated on fly (quantity * price)
    total_cost REAL,
    added_quantity REAL DEFAULT 0,
    added_principal REAL DEFAULT 0,
    FOREIGN KEY(snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);
`;

db.serialize(() => {
    // CRITICAL: Enable Foreign Keys for Cascade Delete to work
    db.run("PRAGMA foreign_keys = ON");
    
    db.exec(initSql, (err) => {
        if (err) console.error("DB Init Error:", err);
        else {
            // Migration: Attempt to add note column if it doesn't exist
            // SQLite does not support IF NOT EXISTS in ADD COLUMN, so we ignore error if column exists
            db.run("ALTER TABLE assets ADD COLUMN note TEXT", () => {});

            // Migration: Ensure positions table has the new flow columns (for existing V1 DBs)
            db.run("ALTER TABLE positions ADD COLUMN added_quantity REAL DEFAULT 0", () => {});
            db.run("ALTER TABLE positions ADD COLUMN added_principal REAL DEFAULT 0", () => {});
            
            console.log("Database initialized successfully (Schema V2) at", DB_PATH);
        }
    });
});

// --- Helper Functions ---
const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// --- API Endpoints ---

// 1. Assets
app.get('/api/assets', async (req, res) => {
    try {
        const rows = await getQuery("SELECT * FROM assets ORDER BY created_at DESC");
        res.json(rows);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/assets', async (req, res) => {
    const { name, type, ticker, note } = req.body;
    const id = uuidv4();
    const now = Date.now();
    try {
        await runQuery("INSERT INTO assets (id, type, name, ticker, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, type, name, ticker, note, now]);
        res.json({ id, name, type, ticker, note, created_at: now });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.put('/api/assets/:id', async (req, res) => {
    const { name, type, ticker, note } = req.body;
    try {
        await runQuery("UPDATE assets SET name = ?, type = ?, ticker = ?, note = ? WHERE id = ?", [name, type, ticker, note, req.params.id]);
        res.json({ success: true, id: req.params.id });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/assets/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM assets WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// 2. Strategies (Hierarchical)
app.get('/api/strategies', async (req, res) => {
    try {
        // 1. Get Versions
        const versions = await getQuery("SELECT * FROM strategy_versions ORDER BY start_date DESC");
        
        // 2. Get Layers
        const layers = await getQuery("SELECT * FROM strategy_layers ORDER BY sort_order ASC, weight DESC");
        
        // 3. Get Targets (Joined with Asset Name for convenience)
        const targets = await getQuery(`
            SELECT t.*, a.name as original_asset_name 
            FROM strategy_targets t
            LEFT JOIN assets a ON t.asset_id = a.id
            ORDER BY t.sort_order ASC, t.weight DESC
        `);

        // 4. Assemble Hierarchy
        const result = versions.map(v => {
            const vLayers = layers.filter(l => l.version_id === v.id).map(l => {
                const lTargets = targets.filter(t => t.layer_id === l.id).map(t => ({
                    id: t.id,
                    assetId: t.asset_id,
                    targetName: t.target_name || t.original_asset_name,
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

            return {
                id: v.id,
                name: v.name,
                description: v.description,
                startDate: v.start_date, // snake_case -> camelCase manual mapping if needed, but DB is start_date. Frontend expects startDate
                status: v.status,
                layers: vLayers
            };
        });
        
        // Map DB snake_case to CamelCase where simple mapping didn't handle it
        const finalResult = result.map(r => ({
            ...r,
            startDate: r.startDate
        }));

        res.json(finalResult);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/strategies', async (req, res) => {
    const { name, description, startDate, layers } = req.body; // Expects hierarchy
    const versionId = uuidv4();
    const now = Date.now();
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // 1. Insert Version
        db.run("INSERT INTO strategy_versions (id, name, description, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
            [versionId, name, description, startDate, now], (err) => {
                if (err) console.error("Insert Version Error", err);
            });
            
        // 2. Insert Layers & Targets
        if (layers && layers.length > 0) {
            const layerStmt = db.prepare("INSERT INTO strategy_layers (id, version_id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
            const targetStmt = db.prepare("INSERT INTO strategy_targets (id, layer_id, asset_id, target_name, weight, color, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            
            layers.forEach((layer, lIdx) => {
                const layerId = uuidv4();
                layerStmt.run(layerId, versionId, layer.name, layer.weight, layer.description || '', lIdx, (err) => {
                    if (err) console.error("Insert Layer Error", err);
                });
                
                if (layer.items && layer.items.length > 0) {
                    layer.items.forEach((item, tIdx) => {
                        targetStmt.run(
                            uuidv4(), 
                            layerId, 
                            item.assetId, 
                            item.targetName, 
                            item.weight, 
                            item.color, 
                            item.note || '',
                            tIdx,
                            (err) => {
                                if (err) console.error("Insert Target Error", err);
                            }
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

app.put('/api/strategies/:id', (req, res) => {
    const { id } = req.params;
    const { name, description, startDate, status, layers } = req.body;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // 1. Update Version
        db.run("UPDATE strategy_versions SET name=?, description=?, start_date=?, status=? WHERE id=?",
            [name, description, startDate, status, id]);

        // 2. Clear old hierarchy
        // SAFETY: Explicitly delete targets first to ensure no constraint violations if FKs aren't active (though we enabled them)
        db.run("DELETE FROM strategy_targets WHERE layer_id IN (SELECT id FROM strategy_layers WHERE version_id=?)", [id]);
        db.run("DELETE FROM strategy_layers WHERE version_id=?", [id]);
        
        // 3. Re-insert Layers & Targets
        if (layers && layers.length > 0) {
            const layerStmt = db.prepare("INSERT INTO strategy_layers (id, version_id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
            const targetStmt = db.prepare("INSERT INTO strategy_targets (id, layer_id, asset_id, target_name, weight, color, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            
            layers.forEach((layer, lIdx) => {
                // Use existing ID if provided (to try and keep stability) or new one
                const layerId = layer.id || uuidv4(); 
                layerStmt.run(layerId, id, layer.name, layer.weight, layer.description || '', lIdx, (err) => {
                    if (err) console.error("Insert Layer Error", err);
                });
                
                if (layer.items && layer.items.length > 0) {
                    layer.items.forEach((item, tIdx) => {
                        targetStmt.run(
                            item.id || uuidv4(), 
                            layerId, 
                            item.assetId, 
                            item.targetName, 
                            item.weight, 
                            item.color, 
                            item.note || '',
                            tIdx,
                            (err) => {
                                if (err) console.error("Insert Target Error", err);
                            }
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

app.delete('/api/strategies/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM strategy_versions WHERE id=?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// 3. Snapshots (Positions table needs minimal change, strategy_id might need to be linked to targets)
// Note: strategy_id in positions usually refers to a specific target rule.
app.get('/api/snapshots', async (req, res) => {
    // UPDATED SQL: Calculate market_value on the fly (quantity * price)
    const sql = `
        SELECT 
            s.*,
            json_group_array(
                json_object(
                    'id', p.id,
                    'assetId', p.asset_id,
                    'strategyId', p.strategy_id,
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
            totalValue: row.total_value,
            totalInvested: row.total_invested,
            note: row.note,
            assets: JSON.parse(row.assets).filter(x => x.id !== null)
        }));
        res.json(result);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/snapshots', async (req, res) => {
    const { date, assets, note } = req.body; 
    
    try {
        const row = await getQuery("SELECT id FROM snapshots WHERE date = ?", [date]);
        const snapshotId = row.length > 0 ? row[0].id : uuidv4();
        const now = Date.now();
        
        // Calculate totals dynamically from inputs
        const totalValue = assets.reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        const totalInvested = assets.reduce((sum, a) => sum + a.totalCost, 0);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            if (row.length > 0) {
                db.run("UPDATE snapshots SET total_value=?, total_invested=?, note=?, updated_at=? WHERE id=?", 
                    [totalValue, totalInvested, note, now, snapshotId]);
                db.run("DELETE FROM positions WHERE snapshot_id=?", [snapshotId]);
            } else {
                db.run("INSERT INTO snapshots (id, date, total_value, total_invested, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    [snapshotId, date, totalValue, totalInvested, note, now]);
            }

            // UPDATED: Removed market_value from INSERT
            const stmt = db.prepare(`
                INSERT INTO positions 
                (id, snapshot_id, asset_id, strategy_id, quantity, price, total_cost, added_quantity, added_principal) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            assets.forEach(a => {
                stmt.run(
                    uuidv4(), 
                    snapshotId, 
                    a.assetId || a.id, 
                    a.strategyId || null, 
                    a.quantity, 
                    a.unitPrice, 
                    // a.marketValue is implicitly ignored here
                    a.totalCost, 
                    a.addedQuantity, 
                    a.addedPrincipal
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

if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database stored at: ${DB_PATH}`);
});