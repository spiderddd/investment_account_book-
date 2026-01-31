
import express from 'express';
import { SnapshotService } from '../services/snapshotService.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await SnapshotService.getList(page, limit);
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Snapshots"); }
});

router.get('/history', async (req, res) => {
    try {
        const data = await SnapshotService.getHistoryGraph();
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Snapshot History"); }
});

router.get('/:id', async (req, res) => {
    try {
        const data = await SnapshotService.getDetails(req.params.id);
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Snapshot Details"); }
});

router.post('/', async (req, res) => {
    try {
        const result = await SnapshotService.createOrUpdate(req.body);
        sendSuccess(res, result);
    } catch(e) { sendError(res, e, "Save Snapshot"); }
});

export default router;
