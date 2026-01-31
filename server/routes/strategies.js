
import express from 'express';
import { StrategyService } from '../services/strategyService.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const data = await StrategyService.getAll();
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Strategies"); }
});

router.post('/', async (req, res) => {
    try {
        const result = await StrategyService.create(req.body);
        sendSuccess(res, result);
    } catch (e) { sendError(res, e, "Create Strategy"); }
});

router.put('/:id', async (req, res) => {
    try {
        const result = await StrategyService.update(req.params.id, req.body);
        sendSuccess(res, result);
    } catch (e) { sendError(res, e, "Update Strategy"); }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await StrategyService.delete(req.params.id);
        sendSuccess(res, result);
    } catch (e) { sendError(res, e, "Delete Strategy"); }
});

export default router;
