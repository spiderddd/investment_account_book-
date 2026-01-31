
import express from 'express';
import { AssetService } from '../services/assetService.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const data = await AssetService.getAll();
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Assets"); }
});

router.post('/', async (req, res) => {
    try {
        const data = await AssetService.create(req.body);
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Create Asset"); }
});

router.put('/:id', async (req, res) => {
    try {
        const data = await AssetService.update(req.params.id, req.body);
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Update Asset"); }
});

router.delete('/:id', async (req, res) => {
    try {
        const data = await AssetService.delete(req.params.id);
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Delete Asset"); }
});

router.get('/:id/history', async (req, res) => {
    try {
        const data = await AssetService.getHistory(req.params.id);
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Asset History"); }
});

export default router;
