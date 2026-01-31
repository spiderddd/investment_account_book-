
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists (relative to project root)
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR);
}
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'invest_track_v2.db');

const sqlite3Verbose = sqlite3.verbose();
export const db = new sqlite3Verbose.Database(DB_PATH);

// --- Schema Initialization ---
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
    weight REAL NOT NULL, 
    color TEXT,
    note TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(layer_id) REFERENCES strategy_layers(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);

-- Snapshots acts as a "Materialized View" (Cache) + "Monthly Log"
CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    total_value REAL,    -- Derived/Cached Field
    total_invested REAL, -- Derived/Cached Field
    note TEXT,           -- User Content (Persistent)
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS market_prices (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    source TEXT DEFAULT 'manual', 
    updated_at INTEGER,
    UNIQUE(asset_id, date)
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    snapshot_id TEXT, 
    date TEXT NOT NULL,
    type TEXT, 
    quantity_change REAL DEFAULT 0,
    cost_change REAL DEFAULT 0,
    note TEXT,
    created_at INTEGER,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);
`;

export const initDB = () => {
    db.serialize(() => {
        // Performance Optimization: Enable Write-Ahead Logging
        // This makes SQLite perform much better for concurrent reads/writes (acting better as a cache)
        db.run("PRAGMA journal_mode = WAL;");
        db.run("PRAGMA foreign_keys = ON;");
        
        db.exec(initSql, (err) => {
            if (err) console.error("DB Init Error:", err);
            else {
                const migrations = [
                    "ALTER TABLE assets ADD COLUMN note TEXT",
                    "CREATE INDEX IF NOT EXISTS idx_prices_asset_date ON market_prices(asset_id, date)",
                    "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)",
                    "CREATE INDEX IF NOT EXISTS idx_transactions_snapshot ON transactions(snapshot_id)"
                ];
                migrations.forEach(sql => {
                    db.run(sql, () => {});
                });
                console.log("Database initialized successfully at", DB_PATH);
            }
        });
    });
};

// --- Helper Functions (Promisified) ---

export const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

export const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

export const withTransaction = async (callback) => {
    try {
        await runQuery("BEGIN TRANSACTION");
        const result = await callback();
        await runQuery("COMMIT");
        return result;
    } catch (err) {
        await runQuery("ROLLBACK");
        console.error("Transaction failed, rolled back.", err);
        throw err;
    }
};
