const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const AutoSweepService = require('../services/AutoSweepService');
const Deposit = require('../models/Deposit');

// Initialize auto-sweep service
const autoSweepService = new AutoSweepService();

/**
 * @route   GET /api/auto-sweep/status
 * @desc    Get auto-sweep service status
 * @access  Admin
 */
router.get('/status', [auth, adminAuth], async (req, res) => {
    try {
        const status = autoSweepService.getStatus();
        
        // Get recent sweep statistics
        const recentSweeps = await Deposit.find({
            autoSweepProcessed: true,
            autoSweepProcessedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).countDocuments();
        
        const pendingDeposits = await Deposit.find({
            status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
            autoSweepProcessed: { $ne: true }
        }).countDocuments();

        res.json({
            success: true,
            data: {
                ...status,
                statistics: {
                    recentSweeps24h: recentSweeps,
                    pendingDeposits
                }
            }
        });
    } catch (error) {
        console.error('Auto-sweep status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get auto-sweep status',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auto-sweep/start
 * @desc    Start auto-sweep service
 * @access  Admin
 */
router.post('/start', [auth, adminAuth], async (req, res) => {
    try {
        autoSweepService.start();
        
        res.json({
            success: true,
            message: 'Auto-sweep service started successfully'
        });
    } catch (error) {
        console.error('Auto-sweep start error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start auto-sweep service',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auto-sweep/stop
 * @desc    Stop auto-sweep service
 * @access  Admin
 */
router.post('/stop', [auth, adminAuth], async (req, res) => {
    try {
        autoSweepService.stop();
        
        res.json({
            success: true,
            message: 'Auto-sweep service stopped successfully'
        });
    } catch (error) {
        console.error('Auto-sweep stop error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop auto-sweep service',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auto-sweep/manual/:depositId
 * @desc    Manually trigger auto-sweep for specific deposit
 * @access  Admin
 */
router.post('/manual/:depositId', [auth, adminAuth], async (req, res) => {
    try {
        const { depositId } = req.params;
        
        const result = await autoSweepService.manualSweep(depositId);
        
        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('Manual sweep error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to trigger manual sweep',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/auto-sweep/deposits
 * @desc    Get deposits with auto-sweep information
 * @access  Admin
 */
router.get('/deposits', [auth, adminAuth], async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        
        const filter = {};
        if (status) {
            filter.status = status;
        }
        
        const deposits = await Deposit.find(filter)
            .populate('userId', 'email username')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('address amount status autoSweepProcessed autoSweepType sweptAmount gasTxid sweepTxid sweptAt createdAt');
        
        const total = await Deposit.countDocuments(filter);
        
        res.json({
            success: true,
            data: {
                deposits,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get deposits error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get deposits',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/auto-sweep/statistics
 * @desc    Get auto-sweep statistics
 * @access  Admin
 */
router.get('/statistics', [auth, adminAuth], async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        // Get sweep statistics
        const sweepStats = await Deposit.aggregate([
            {
                $match: {
                    autoSweepProcessed: true,
                    autoSweepProcessedAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$autoSweepType',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$sweptAmount' }
                }
            }
        ]);
        
        // Get daily sweep counts
        const dailyStats = await Deposit.aggregate([
            {
                $match: {
                    autoSweepProcessed: true,
                    autoSweepProcessedAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$autoSweepProcessedAt' },
                        month: { $month: '$autoSweepProcessedAt' },
                        day: { $dayOfMonth: '$autoSweepProcessedAt' }
                    },
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$sweptAmount' }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
            }
        ]);
        
        // Get pending deposits
        const pendingCount = await Deposit.countDocuments({
            status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
            autoSweepProcessed: { $ne: true }
        });
        
        // Get failed sweeps
        const failedCount = await Deposit.countDocuments({
            autoSweepAttempts: { $gte: 1 },
            autoSweepProcessed: false,
            lastAutoSweepError: { $exists: true }
        });
        
        res.json({
            success: true,
            data: {
                sweepsByType: sweepStats,
                dailyStats,
                summary: {
                    pendingDeposits: pendingCount,
                    failedSweeps: failedCount,
                    totalProcessed: sweepStats.reduce((sum, stat) => sum + stat.count, 0),
                    totalAmount: sweepStats.reduce((sum, stat) => sum + (stat.totalAmount || 0), 0)
                }
            }
        });
    } catch (error) {
        console.error('Statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get statistics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/auto-sweep/deposits/:depositId
 * @desc    Get detailed auto-sweep information for specific deposit
 * @access  Admin
 */
router.get('/deposits/:depositId', [auth, adminAuth], async (req, res) => {
    try {
        const { depositId } = req.params;
        
        const deposit = await Deposit.findById(depositId)
            .populate('userId', 'email username')
            .select('address amount status autoSweepProcessed autoSweepType autoSweepAttempts lastAutoSweepAttempt lastAutoSweepError gasTxid sweepTxid sweptAmount sweptAt createdAt privateKeySeed');
        
        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }
        
        // Remove sensitive data
        const depositData = deposit.toObject();
        if (depositData.privateKeySeed) {
            depositData.privateKeySeed = depositData.privateKeySeed.substring(0, 8) + '...';
        }
        
        res.json({
            success: true,
            data: depositData
        });
    } catch (error) {
        console.error('Get deposit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get deposit information',
            error: error.message
        });
    }
});

module.exports = { router, autoSweepService };