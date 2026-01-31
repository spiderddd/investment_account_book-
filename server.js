
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

// --- 1. Database Schema & Migration ---
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

CREATE TABLE IF NOT EXISTS strategy_layers (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    name TEXT NOT NULL,
    weight REAL NOT NULL, 
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(version_id) REFERENCES strategy_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategy_targets (
    id TEXT PRIMARY KEY,
    layer_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    target_name TEXT, 
    weight REAL NOT NULL, 
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
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total_cost REAL,
    added_quantity REAL DEFAULT 0,
    added_principal REAL DEFAULT 0,
    created_at INTEGER,
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
            // Migration: Attempt to add columns if they don't exist
            const migrations = [
                "ALTER TABLE assets ADD COLUMN note TEXT",
                "ALTER TABLE positions ADD COLUMN added_quantity REAL DEFAULT 0",
                "ALTER TABLE positions ADD COLUMN added_principal REAL DEFAULT 0",
                "ALTER TABLE snapshots ADD COLUMN created_at INTEGER",
                "ALTER TABLE positions ADD COLUMN created_at INTEGER"
            ];
            
            migrations.forEach(sql => {
                db.run(sql, (err) => { /* Ignore errors if col exists */ });
            });
            
            console.log("Database initialized successfully (Schema V2) at", DB_PATH);
        }
    });
});

// --- 2. Helper Functions ---

// Convert snake_case to camelCase
const toCamel = (s) => s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
const keysToCamel = (o) => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(keysToCamel);
    return Object.keys(o).reduce((acc, key) => {
        acc[toCamel(key)] = keysToCamel(o[key]);
        return acc;
    }, {});
};

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

// --- 3. API Endpoints ---

// --- Assets ---
app.get('/api/assets', async (req, res) => {
    try {
        const rows = await getQuery("SELECT * FROM assets ORDER BY created_at DESC");
        res.json(keysToCamel(rows));
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/assets', async (req, res) => {
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

app.put('/api/assets/:id', async (req, res) => {
    const { name, type, ticker, note } = req.body;
    try {
        await runQuery(
            "UPDATE assets SET name = ?, type = ?, ticker = ?, note = ? WHERE id = ?", 
            [name, type, ticker, note, req.params.id]
        );
        res.json({ success: true, id: req.params.id });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/assets/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM assets WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/api/assets/:id/history', async (req, res) => {
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
        res.json(keysToCamel(rows));
    } catch (e) { res.status(500).json({error: e.message}); }
});

// --- Strategies ---
app.get('/api/strategies', async (req, res) => {
    try {
        // Fetch raw rows
        const versions = await getQuery("SELECT * FROM strategy_versions ORDER BY start_date DESC");
        const layers = await getQuery("SELECT * FROM strategy_layers ORDER BY sort_order ASC, weight DESC");
        const targets = await getQuery(`
            SELECT t.*, a.name as original_asset_name 
            FROM strategy_targets t
            LEFT JOIN assets a ON t.asset_id = a.id
            ORDER BY t.sort_order ASC, t.weight DESC
        `);

        // Assemble hierarchy (Manual mapping to ensure structure)
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
                startDate: v.start_date, 
                status: v.status,
                layers: vLayers
            };
        });
        
        res.json(result);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/strategies', async (req, res) => {
    const { name, description, startDate, layers } = req.body;
    const versionId = uuidv4();
    const now = Date.now();
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("INSERT INTO strategy_versions (id, name, description, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
            [versionId, name, description, startDate, now], (err) => {
                if (err) console.error("Insert Version Error", err);
            });
            
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

app.put('/api/strategies/:id', (req, res) => {
    const { id } = req.params;
    const { name, description, startDate, status, layers } = req.body;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("UPDATE strategy_versions SET name=?, description=?, start_date=?, status=? WHERE id=?",
            [name, description, startDate, status, id]);

        // Clean slate for hierarchy
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

app.delete('/api/strategies/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM strategy_versions WHERE id=?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// --- Snapshots ---
app.get('/api/snapshots', async (req, res) => {
    // Note: json_group_array naturally returns camelCase keys as defined in the json_object
    const sql = `
        SELECT 
            s.*,
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
    
    // Validation
    if (!date || !Array.isArray(assets)) {
        return res.status(400).json({ error: "Invalid snapshot data format" });
    }
    
    try {
        const row = await getQuery("SELECT id FROM snapshots WHERE date = ?", [date]);
        const snapshotId = row.length > 0 ? row[0].id : uuidv4();
        const now = Date.now();
        
        // Calculate totals logic (Validation: Ensure numbers)
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

// --- Start Server ---
if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database stored at: ${DB_PATH}`);
});
