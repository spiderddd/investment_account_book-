
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

-- LEGACY TABLE (Kept for migration safety, but logic will move to transactions)
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

-- NEW: Independent Price History (Crawler Friendly)
CREATE TABLE IF NOT EXISTS market_prices (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    source TEXT DEFAULT 'manual', -- 'manual', 'crawler', 'system'
    updated_at INTEGER,
    UNIQUE(asset_id, date)
);

-- NEW: Ledger / Transaction Table (Source of Truth for Quantity/Cost)
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    snapshot_id TEXT, -- Optional: Links transaction to a monthly closure for easier editing
    date TEXT NOT NULL,
    type TEXT, -- 'buy', 'sell', 'interest', 'adjustment'
    quantity_change REAL DEFAULT 0,
    cost_change REAL DEFAULT 0,
    note TEXT,
    created_at INTEGER,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
);
`;

export const initDB = () => {
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON");
        db.exec(initSql, (err) => {
            if (err) console.error("DB Init Error:", err);
            else {
                // Simple Migration Checks
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

/**
 * Executes a callback within a database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 * Returns the result of the callback.
 */
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
