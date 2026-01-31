
/**
 * InvestTrack NAS Server
 * Refactored v2.0
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDB } from './server/db.js';

import assetsRouter from './server/routes/assets.js';
import strategiesRouter from './server/routes/strategies.js';
import snapshotsRouter from './server/routes/snapshots.js';
import dashboardRouter from './server/routes/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Initialize DB ---
initDB();

// --- Mount Routes ---
app.use('/api/assets', assetsRouter);
app.use('/api/strategies', strategiesRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/dashboard', dashboardRouter);

// --- Static Files ---
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
