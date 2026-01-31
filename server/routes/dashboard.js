
import express from 'express';
import { DashboardService } from '../services/dashboardService.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';

const router = express.Router();

// GET /api/dashboard/metrics
router.get('/metrics', async (req, res) => {
    try {
        const { viewMode, timeRange } = req.query;
        const data = await DashboardService.getMetrics({ 
            viewMode: viewMode || 'strategy', 
            timeRange: timeRange || 'all' 
        });
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Metrics"); }
});

// GET /api/dashboard/allocation
router.get('/allocation', async (req, res) => {
    try {
        const { viewMode, layerId } = req.query;
        const data = await DashboardService.getAllocation({ 
            viewMode: viewMode || 'strategy',
            layerId: layerId || null
        });
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Allocation"); }
});

// GET /api/dashboard/trend
router.get('/trend', async (req, res) => {
    try {
        const { viewMode, layerId, startDate } = req.query;
        const data = await DashboardService.getTrend({ 
            viewMode: viewMode || 'strategy',
            layerId: layerId || null,
            startDate: startDate || null
        });
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Trend"); }
});

// GET /api/dashboard/breakdown
router.get('/breakdown', async (req, res) => {
    try {
        const { viewMode, timeRange, layerId } = req.query;
        const data = await DashboardService.getAttribution({ 
            viewMode: viewMode || 'strategy',
            timeRange: timeRange || 'all',
            layerId: layerId || null
        });
        sendSuccess(res, data);
    } catch (e) { sendError(res, e, "Get Breakdown"); }
});

export default router;
