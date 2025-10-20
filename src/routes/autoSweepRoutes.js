const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const FundSweepService = require('../services/FundSweepService');
const AutoSweepScheduler = require('../services/AutoSweepScheduler');
const Deposit = require('../models/Deposit');

// Initialize services
const fundSweepService = new FundSweepService();
const autoSweepScheduler = new AutoSweepScheduler();

/**
 * @route GET /api/admin/auto-sweep/status
 * @desc Get auto-sweep system status
 * @access Admin
 */
router.get('/status', adminAuth, async (req, res) => {
    try {
        const status = autoSweepScheduler.getStatus();
        
        // Get recent sweep statistics
        const recentDeposits = await Deposit.find({
            status: { $in: ['CONFIRMED', 'PENDING'] },
            network: 'tron',
            currency: 'USDT',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        }).select('status amount actualAmount sweepTransactionHash processedAt');
        
        const stats = {
            totalDeposits: recentDeposits.length,
            confirmedDeposits: recentDeposits.filter(d => d.status === 'CONFIRMED').length,
            pendingDeposits: recentDeposits.filter(d => d.status === 'PENDING').length,
            totalSwept: recentDeposits
                .filter(d => d.status === 'CONFIRMED')
                .reduce((sum, d) => sum + (d.actualAmount || 0), 0)
        };
        
        res.json({
            success: true,
            status,
            stats,
            recentDeposits: recentDeposits.slice(0, 10) // Last 10 deposits
        });
        
    } catch (error) {
        console.error('Error getting auto-sweep status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get auto-sweep status',
            error: error.message
        });
    }
});

/**
 * @route POST /api/admin/auto-sweep/manual-trigger
 * @desc Manually trigger auto-sweep process
 * @access Admin
 */
router.post('/manual-trigger', adminAuth, async (req, res) => {
    try {
        console.log(`🔄 Manual auto-sweep triggered by admin: ${req.user.email}`);
        
        // Initialize if not already done
        await fundSweepService.initialize();
        
        // Run the automated USDT sweep
        const result = await fundSweepService.performAutomatedUSDTSweep();
        
        res.json({
            success: true,
            message: 'Manual auto-sweep completed',
            result
        });
        
    } catch (error) {
        console.error('Error in manual auto-sweep:', error);
        res.status(500).json({
            success: false,
            message: 'Manual auto-sweep failed',
            error: error.message
        });
    }
});

/**
 * @route POST /api/admin/auto-sweep/emergency-recovery
 * @desc Emergency fund recovery for stuck deposits
 * @access Admin
 */
router.post('/emergency-recovery', adminAuth, async (req, res) => {
    try {
        const { depositId, walletAddress, forceAmount } = req.body;
        
        if (!depositId && !walletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Either depositId or walletAddress is required'
            });
        }
        
        console.log(`🚨 Emergency recovery triggered by admin: ${req.user.email}`);
        console.log(`   Target: ${depositId || walletAddress}`);
        console.log(`   Force amount: ${forceAmount || 'auto-detect'}`);
        
        await fundSweepService.initialize();
        
        const result = await fundSweepService.emergencyFundRecovery(
            depositId || walletAddress,
            forceAmount
        );
        
        res.json({
            success: result.success,
            message: result.message || (result.success ? 'Emergency recovery completed' : 'Emergency recovery failed'),
            result
        });
        
    } catch (error) {
        console.error('Error in emergency recovery:', error);
        res.status(500).json({
            success: false,
            message: 'Emergency recovery failed',
            error: error.message
        });
    }
});

/**
 * @route POST /api/admin/auto-sweep/schedule
 * @desc Update auto-sweep schedule
 * @access Admin
 */
router.post('/schedule', adminAuth, async (req, res) => {
    try {
        const { interval, enabled } = req.body;
        
        if (enabled !== undefined) {
            autoSweepScheduler.setEnabled(enabled);
        }
        
        if (interval) {
            autoSweepScheduler.updateSchedule(interval);
        }
        
        const status = autoSweepScheduler.getStatus();
        
        res.json({
            success: true,
            message: 'Auto-sweep schedule updated',
            status
        });
        
    } catch (error) {
        console.error('Error updating auto-sweep schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update auto-sweep schedule',
            error: error.message
        });
    }
});

/**
 * @route GET /api/admin/auto-sweep/deposits
 * @desc Get deposits requiring attention
 * @access Admin
 */
router.get('/deposits', adminAuth, async (req, res) => {
    try {
        const { status = 'PENDING', limit = 50, page = 1 } = req.query;
        
        const skip = (page - 1) * limit;
        
        const deposits = await Deposit.find({
            status: { $in: status.split(',') },
            network: 'tron',
            currency: 'USDT'
        })
        .populate('userId', 'email username')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip);
        
        const total = await Deposit.countDocuments({
            status: { $in: status.split(',') },
            network: 'tron',
            currency: 'USDT'
        });
        
        // Check current USDT balance for each deposit
        const depositsWithBalance = await Promise.all(
            deposits.map(async (deposit) => {
                try {
                    const usdtBalance = await fundSweepService.getUSDTBalance(deposit.walletAddress);
                    const trxBalance = await fundSweepService.getTRXBalance(deposit.walletAddress);
                    
                    return {
                        ...deposit.toObject(),
                        currentUSDTBalance: usdtBalance,
                        currentTRXBalance: trxBalance,
                        needsGasFees: trxBalance < 15,
                        readyForSweep: usdtBalance > 0 && trxBalance >= 15
                    };
                } catch (error) {
                    return {
                        ...deposit.toObject(),
                        currentUSDTBalance: 0,
                        currentTRXBalance: 0,
                        balanceError: error.message
                    };
                }
            })
        );
        
        res.json({
            success: true,
            deposits: depositsWithBalance,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('Error getting deposits:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get deposits',
            error: error.message
        });
    }
});

/**
 * @route GET /api/admin/auto-sweep/wallet-balance/:address
 * @desc Check wallet balance (USDT and TRX)
 * @access Admin
 */
router.get('/wallet-balance/:address', adminAuth, async (req, res) => {
    try {
        const { address } = req.params;
        
        await fundSweepService.initialize();
        
        const [usdtBalance, trxBalance] = await Promise.all([
            fundSweepService.getUSDTBalance(address),
            fundSweepService.getTRXBalance(address)
        ]);
        
        res.json({
            success: true,
            address,
            balances: {
                usdt: usdtBalance,
                trx: trxBalance,
                needsGasFees: trxBalance < 15,
                readyForSweep: usdtBalance > 0 && trxBalance >= 15
            }
        });
        
    } catch (error) {
        console.error('Error checking wallet balance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check wallet balance',
            error: error.message
        });
    }
});

module.exports = router;