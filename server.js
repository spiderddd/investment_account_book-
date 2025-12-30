/**
 * InvestTrack NAS Server
 * 
 * 部署说明:
 * 1. 在 NAS 上安装 Node.js
 * 2. 创建目录并将此文件放入
 * 3. 运行 `npm init -y`
 * 4. 运行 `npm install express sqlite3 cors body-parser uuid`
 * 5. 启动 `node server.js`
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'invest_track.db');

app.use(cors());
app.use(express.json());

// --- Database Initialization ---
const db = new sqlite3.Database(DB_PATH);

const initSql = `
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    ticker TEXT,
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

CREATE TABLE IF NOT EXISTS strategy_targets (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    target_ratio REAL NOT NULL,
    color TEXT,
    FOREIGN KEY(version_id) REFERENCES strategy_versions(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    total_value REAL,
    total_invested REAL,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    market_value REAL NOT NULL,
    total_cost REAL,
    added_quantity REAL DEFAULT 0,
    added_principal REAL DEFAULT 0,
    FOREIGN KEY(snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);
`;

db.serialize(() => {
    db.exec(initSql, (err) => {
        if (err) console.error("DB Init Error:", err);
        else console.log("Database initialized successfully at", DB_PATH);
    });
});

// --- API Endpoints ---

// 1. Assets
app.get('/api/assets', (req, res) => {
    db.all("SELECT * FROM assets ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.post('/api/assets', (req, res) => {
    const { name, type, ticker } = req.body;
    const id = uuidv4();
    const now = Date.now();
    db.run("INSERT INTO assets (id, type, name, ticker, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, type, name, ticker, now], function(err) {
            if (err) return res.status(500).json({error: err.message});
            res.json({ id, name, type, ticker, created_at: now });
        }
    );
});

app.put('/api/assets/:id', (req, res) => {
    const { name, type, ticker } = req.body;
    const { id } = req.params;
    db.run("UPDATE assets SET name = ?, type = ?, ticker = ? WHERE id = ?",
        [name, type, ticker, id], function(err) {
            if (err) return res.status(500).json({error: err.message});
            res.json({ success: true, id });
        }
    );
});

app.delete('/api/assets/:id', (req, res) => {
    const { id } = req.params;
    // Note: If foreign keys are enforced, this might fail if used in strategies/positions.
    // Ideally we should check usage first, but for MVP we allow delete (or it will error if constraints active).
    db.run("DELETE FROM assets WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true, id });
    });
});

// 2. Strategies
app.get('/api/strategies', (req, res) => {
    const sql = `
        SELECT 
            v.*, 
            json_group_array(
                json_object(
                    'id', t.id,
                    'assetId', t.asset_id,
                    'targetRatio', t.target_ratio,
                    'color', t.color,
                    'targetName', a.name,
                    'module', a.type -- Using type as module for simplicity or join another way
                )
            ) as items 
        FROM strategy_versions v
        LEFT JOIN strategy_targets t ON v.id = t.version_id
        LEFT JOIN assets a ON t.asset_id = a.id
        GROUP BY v.id
        ORDER BY v.start_date DESC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        // Parse the JSON string from sqlite group_concat hack or handle strictly
        // SQLite json_group_array returns a string
        const result = rows.map(row => ({
            ...row,
            items: JSON.parse(row.items).filter(i => i.id !== null).map(i => ({
                id: i.id, // target id
                // frontend expects specific structure
                targetName: i.targetName,
                targetWeight: i.targetRatio,
                color: i.color,
                module: i.module,
                // We keep reference to real assetId
                assetId: i.assetId 
            }))
        }));
        res.json(result);
    });
});

app.post('/api/strategies', (req, res) => {
    // This is a complex transaction, simplified here.
    // Expects full strategy object.
    const { name, description, startDate, items } = req.body;
    const id = uuidv4();
    const now = Date.now();
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // Archive others if this is active? (Optional logic)
        
        db.run("INSERT INTO strategy_versions (id, name, description, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
            [id, name, description, startDate, now]);
            
        if (items && items.length > 0) {
            const stmt = db.prepare("INSERT INTO strategy_targets (id, version_id, asset_id, target_ratio, color) VALUES (?, ?, ?, ?, ?)");
            items.forEach(item => {
                // Frontend might send 'assetId' or we need to look it up/create it.
                // For this MVP, we assume frontend ensures Assets exist or sends an assetId.
                // If item is new, we might need to create asset first. 
                // Let's assume assetId is provided.
                stmt.run(uuidv4(), id, item.assetId, item.targetWeight, item.color);
            });
            stmt.finalize();
        }
        
        db.run("COMMIT", (err) => {
            if (err) res.status(500).json({error: err.message});
            else res.json({ success: true, id });
        });
    });
});

// 3. Snapshots
app.get('/api/snapshots', (req, res) => {
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
                    'marketValue', p.market_value,
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

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        const result = rows.map(row => ({
            ...row,
            assets: JSON.parse(row.assets).filter(x => x.id !== null)
        }));
        res.json(result);
    });
});

app.post('/api/snapshots', (req, res) => {
    const { date, assets } = req.body; // assets is array of position objects
    
    // Check if exists
    db.get("SELECT id FROM snapshots WHERE date = ?", [date], (err, row) => {
        if (err) return res.status(500).json({error: err.message});
        
        const snapshotId = row ? row.id : uuidv4();
        const now = Date.now();
        
        // Calculate totals
        const totalValue = assets.reduce((sum, a) => sum + a.marketValue, 0);
        const totalInvested = assets.reduce((sum, a) => sum + a.totalCost, 0);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            if (row) {
                // Update existing
                db.run("UPDATE snapshots SET total_value=?, total_invested=?, updated_at=? WHERE id=?", 
                    [totalValue, totalInvested, now, snapshotId]);
                // Clear old positions to re-insert (simplest strategy for edit)
                db.run("DELETE FROM positions WHERE snapshot_id=?", [snapshotId]);
            } else {
                // Insert new
                db.run("INSERT INTO snapshots (id, date, total_value, total_invested, updated_at) VALUES (?, ?, ?, ?, ?)",
                    [snapshotId, date, totalValue, totalInvested, now]);
            }

            const stmt = db.prepare(`
                INSERT INTO positions 
                (id, snapshot_id, asset_id, quantity, price, market_value, total_cost, added_quantity, added_principal) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            assets.forEach(a => {
                // Ensure assetId exists
                stmt.run(
                    uuidv4(), 
                    snapshotId, 
                    a.assetId || a.id, // In unified frontend model, id might be assetId if selecting from existing
                    a.quantity, 
                    a.unitPrice, 
                    a.marketValue, 
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
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});