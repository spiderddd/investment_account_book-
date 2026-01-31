
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery } from '../db.js';

export const AssetService = {
    getAll: async () => {
        const sql = "SELECT id, type, name, ticker, note, created_at as createdAt FROM assets ORDER BY created_at DESC";
        return await getQuery(sql);
    },

    create: async (data) => {
        const { name, type, ticker, note } = data;
        if (!name || !type) throw { statusCode: 400, message: "Name and Type required" };

        const id = uuidv4();
        const now = Date.now();
        await runQuery(
            "INSERT INTO assets (id, type, name, ticker, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", 
            [id, type, name, ticker, note, now]
        );
        return { id, name, type, ticker, note, createdAt: now };
    },

    update: async (id, data) => {
        const { name, type, ticker, note } = data;
        await runQuery(
            "UPDATE assets SET name = ?, type = ?, ticker = ?, note = ? WHERE id = ?", 
            [name, type, ticker, note, id]
        );
        return { success: true, id };
    },

    delete: async (id) => {
        // Optional: Check for dependency constraints (foreign keys usually handle this via CASCADE or error)
        await runQuery("DELETE FROM assets WHERE id = ?", [id]);
        return { success: true };
    },

    getHistory: async (assetId) => {
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
        return await getQuery(sql, [assetId]);
    }
};
