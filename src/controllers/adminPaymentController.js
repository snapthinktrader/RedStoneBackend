const WalletService = require('../services/walletService');
const BlockchainMonitorService = require('../services/blockchainMonitorService');
const FundSweepService = require('../services/FundSweepService');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const { TronWeb } = require('tronweb');
const logger = require('../utils/logger');

class AdminPaymentController {
    /**
     * Get all pending withdrawals for admin approval
     */
    static async getPendingWithdrawals(req, res) {
        try {
            const { page = 1, limit = 50 } = req.query;

            const withdrawals = await Withdrawal.find({ status: 'PENDING_APPROVAL' })
                .sort({ createdAt: 1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .populate('userId', 'username email walletBalance createdAt')
                .lean();

            const total = await Withdrawal.countDocuments({ status: 'PENDING_APPROVAL' });

            res.json({
                success: true,
                data: {
                    withdrawals,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / limit)
                    }
                }
            });
        } catch (error) {
            console.error('Get pending withdrawals error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get pending withdrawals',
                error: error.message
            });
        }
    };

    /**
     * Get all withdrawals with filtering
     */
    static async getAllWithdrawals(req, res) {
        try {
            const { 
                page = 1, 
                limit = 50, 
                status, 
                network, 
                userId,
                startDate,
                endDate 
            } = req.query;

            const query = {};
            
            if (status) query.status = status;
            if (network) query.network = network;
            if (userId) query.userId = userId;
            
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }

            const withdrawals = await Withdrawal.find(query)
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .populate('userId', 'username email walletBalance')
                .populate('approvedBy', 'username email')
                .lean();

            const total = await Withdrawal.countDocuments(query);

            // Calculate statistics
            const stats = await Withdrawal.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$amount' }
                    }
                }
            ]);

            res.json({
                success: true,
                data: {
                    withdrawals,
                    statistics: stats,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / limit)
                    }
                }
            });
        } catch (error) {
            console.error('Get all withdrawals error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get withdrawals',
                error: error.message
            });
        }
    };

    /**
     * Approve a withdrawal request
     */
    static async approveWithdrawal(req, res) {
        const walletService = new WalletService();
        try {
            const { withdrawalId } = req.params;
            const { adminNotes = '', fromAddress } = req.body;
            const adminId = req.user.id;

            const withdrawal = await Withdrawal.findById(withdrawalId)
                .populate('userId', 'username email walletBalance');

            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message: 'Withdrawal not found'
                });
            }

            if (!withdrawal.canBeApproved()) {
                return res.status(400).json({
                    success: false,
                    message: 'Withdrawal cannot be approved',
                    currentStatus: withdrawal.status
                });
            }

            // Verify user still has sufficient balance
            const user = await User.findById(withdrawal.userId);
            if (user.walletBalance < withdrawal.amount) {
                return res.status(400).json({
                    success: false,
                    message: 'User has insufficient balance',
                    userBalance: user.walletBalance,
                    withdrawalAmount: withdrawal.amount
                });
            }

            // Initialize TronWeb
            const tronWeb = new TronWeb({
                fullHost: process.env.TRON_NETWORK === 'mainnet' 
                    ? 'https://api.trongrid.io' 
                    : 'https://api.shasta.trongrid.io'
            });

            // USDT TRC-20 contract address
            const usdtContractAddress = process.env.TRON_NETWORK === 'mainnet'
                ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
                : 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs';

            let sourceWallet = null;
            let sourcePrivateKey = null;
            let sourceAddress = null;
            let sourceBalance = 0;

            // Check if reusable wallet exists and has sufficient USDT
            if (user.currentDepositWallet?.address && user.currentDepositWallet?.privateKey) {
                const reusableAddress = user.currentDepositWallet.address;
                const reusablePrivateKey = user.currentDepositWallet.privateKey;
                
                try {
                    // Check USDT balance in reusable wallet
                    const contract = await tronWeb.contract().at(usdtContractAddress);
                    const balance = await contract.balanceOf(reusableAddress).call();
                    const balanceInUsdt = parseFloat(tronWeb.fromSun(balance));
                    
                    logger.info(`[Withdrawal] Reusable wallet ${reusableAddress} has ${balanceInUsdt} USDT`);
                    
                    if (balanceInUsdt >= withdrawal.actualAmount) {
                        sourceAddress = reusableAddress;
                        sourcePrivateKey = reusablePrivateKey;
                        sourceBalance = balanceInUsdt;
                        sourceWallet = 'reusable';
                        logger.info(`[Withdrawal] Using reusable wallet (sufficient balance)`);
                    } else {
                        logger.warn(`[Withdrawal] Reusable wallet insufficient: ${balanceInUsdt} < ${withdrawal.actualAmount}`);
                    }
                } catch (error) {
                    logger.error(`[Withdrawal] Error checking reusable wallet balance:`, error.message);
                }
            }

            // Fallback to fuel wallet if reusable wallet doesn't have enough
            if (!sourceAddress) {
                sourceAddress = process.env.FUEL_WALLET_ADDRESS;
                sourcePrivateKey = process.env.FUEL_WALLET_PRIVATE_KEY;
                sourceWallet = 'fuel';
                logger.info(`[Withdrawal] Using fuel wallet: ${sourceAddress}`);
                
                if (!sourceAddress || !sourcePrivateKey) {
                    return res.status(500).json({
                        success: false,
                        message: 'Withdrawal wallet not configured'
                    });
                }
            }

            // Set private key and execute transaction
            tronWeb.setPrivateKey(sourcePrivateKey);
            
            try {
                const contract = await tronWeb.contract().at(usdtContractAddress);
                const amountInSun = tronWeb.toSun(withdrawal.actualAmount);
                
                // Send USDT
                const txResult = await contract.transfer(
                    withdrawal.toAddress,
                    amountInSun
                ).send({
                    feeLimit: 100_000_000, // 100 TRX fee limit
                    callValue: 0
                });

                logger.info(`[Withdrawal] Transaction sent:`, txResult);

                // Update withdrawal with transaction details
                withdrawal.status = 'COMPLETED';
                withdrawal.approvedBy = adminId;
                withdrawal.approvedAt = new Date();
                withdrawal.completedAt = new Date();
                withdrawal.adminNotes = adminNotes;
                withdrawal.fromAddress = sourceAddress;
                withdrawal.txHash = txResult;
                withdrawal.metadata = {
                    ...withdrawal.metadata,
                    sourceWallet,
                    sourceBalance,
                    executedAt: new Date(),
                    transactionId: txResult
                };

                await withdrawal.save();

                // Deduct from user balance
                user.walletBalance -= withdrawal.amount;
                await user.save();

                logger.info(`[Withdrawal] Completed successfully: ${txResult}`);
            } catch (txError) {
                logger.error(`[Withdrawal] Transaction failed:`, txError);
                
                // Mark as failed
                withdrawal.status = 'FAILED';
                withdrawal.adminNotes = `${adminNotes}\n\nTransaction failed: ${txError.message}`;
                await withdrawal.save();
                
                return res.status(500).json({
                    success: false,
                    message: 'Transaction failed',
                    error: txError.message
                });
            }

            res.json({
                success: true,
                message: 'Withdrawal approved and executed successfully',
                data: {
                    withdrawal: {
                        id: withdrawal._id,
                        status: withdrawal.status,
                        approvedAt: withdrawal.approvedAt,
                        completedAt: withdrawal.completedAt,
                        fromAddress: withdrawal.fromAddress,
                        txHash: withdrawal.txHash,
                        sourceWallet: sourceWallet
                    },
                    userNewBalance: user.walletBalance
                }
            });
        } catch (error) {
            console.error('Approve withdrawal error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to approve withdrawal',
                error: error.message
            });
        }
    };

    /**
     * Reject a withdrawal request
     */
    static async rejectWithdrawal(req, res) {
        try {
            const { withdrawalId } = req.params;
            const { rejectionReason, adminNotes = '' } = req.body;
            const adminId = req.user.id;

            if (!rejectionReason) {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason is required'
                });
            }

            const withdrawal = await Withdrawal.findById(withdrawalId);

            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message: 'Withdrawal not found'
                });
            }

            if (!withdrawal.canBeRejected()) {
                return res.status(400).json({
                    success: false,
                    message: 'Withdrawal cannot be rejected',
                    currentStatus: withdrawal.status
                });
            }

            // If withdrawal was already approved, restore user balance
            if (withdrawal.status === 'APPROVED') {
                const user = await User.findById(withdrawal.userId);
                user.walletBalance += withdrawal.amount;
                await user.save();
            }

            withdrawal.status = 'REJECTED';
            withdrawal.rejectionReason = rejectionReason;
            withdrawal.adminNotes = adminNotes;
            withdrawal.approvedBy = adminId;
            withdrawal.rejectedAt = new Date();

            await withdrawal.save();

            res.json({
                success: true,
                message: 'Withdrawal rejected successfully',
                data: {
                    withdrawal: {
                        id: withdrawal._id,
                        status: withdrawal.status,
                        rejectionReason: withdrawal.rejectionReason,
                        rejectedAt: withdrawal.rejectedAt
                    }
                }
            });
        } catch (error) {
            console.error('Reject withdrawal error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reject withdrawal',
                error: error.message
            });
        }
    };

    /**
     * Submit signed transaction for broadcasting
     */
    static async submitSignedTransaction(req, res) {
        try {
            const { withdrawalId } = req.params;
            const { signedTransaction } = req.body;

            if (!signedTransaction) {
                return res.status(400).json({
                    success: false,
                    message: 'Signed transaction is required'
                });
            }

            const withdrawal = await Withdrawal.findById(withdrawalId);

            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message: 'Withdrawal not found'
                });
            }

            if (withdrawal.status !== 'APPROVED') {
                return res.status(400).json({
                    success: false,
                    message: 'Withdrawal must be approved before signing',
                    currentStatus: withdrawal.status
                });
            }

            // Update withdrawal with signed transaction
            withdrawal.signedTransaction = signedTransaction;
            withdrawal.status = 'SIGNED';
            withdrawal.processedAt = new Date();

            await withdrawal.save();

            res.json({
                success: true,
                message: 'Signed transaction submitted successfully. Ready for broadcasting.',
                data: {
                    withdrawal: {
                        id: withdrawal._id,
                        status: withdrawal.status,
                        processedAt: withdrawal.processedAt
                    }
                }
            });
        } catch (error) {
            console.error('Submit signed transaction error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit signed transaction',
                error: error.message
            });
        }
    };

    /**
     * Broadcast signed transaction to blockchain
     */
    static async broadcastTransaction(req, res) {
        try {
            const { withdrawalId } = req.params;

            const withdrawal = await Withdrawal.findById(withdrawalId);

            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message: 'Withdrawal not found'
                });
            }

            if (withdrawal.status !== 'SIGNED') {
                return res.status(400).json({
                    success: false,
                    message: 'Withdrawal must be signed before broadcasting',
                    currentStatus: withdrawal.status
                });
            }

            if (!withdrawal.signedTransaction) {
                return res.status(400).json({
                    success: false,
                    message: 'No signed transaction found'
                });
            }

            // TODO: Implement actual transaction broadcasting
            // This would require a method to send the signed transaction to the network
            
            // For now, we'll simulate the broadcast
            const mockTransactionHash = `0x${Math.random().toString(16).substr(2, 64)}`;

            withdrawal.status = 'BROADCASTED';
            withdrawal.transactionHash = mockTransactionHash;
            withdrawal.broadcastedAt = new Date();

            await withdrawal.save();

            res.json({
                success: true,
                message: 'Transaction broadcasted successfully',
                data: {
                    withdrawal: {
                        id: withdrawal._id,
                        status: withdrawal.status,
                        transactionHash: withdrawal.transactionHash,
                        broadcastedAt: withdrawal.broadcastedAt
                    }
                }
            });
        } catch (error) {
            console.error('Broadcast transaction error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to broadcast transaction',
                error: error.message
            });
        }
    };

    /**
     * Get deposit monitoring summary
     */
    static async getDepositSummary(req, res) {
        try {
            const { timeframe = '24h' } = req.query;

            let dateFilter = {};
            const now = new Date();
            
            switch (timeframe) {
                case '1h':
                    dateFilter = { $gte: new Date(now - 60 * 60 * 1000) };
                    break;
                case '24h':
                    dateFilter = { $gte: new Date(now - 24 * 60 * 60 * 1000) };
                    break;
                case '7d':
                    dateFilter = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
                    break;
                case '30d':
                    dateFilter = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
                    break;
            }

            const deposits = await Deposit.aggregate([
                {
                    $match: dateFilter.createdAt ? { createdAt: dateFilter } : {}
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$actualAmount' }
                    }
                }
            ]);

            const pending = await Deposit.find({
                status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
                expiresAt: { $gt: new Date() }
            }).countDocuments();

            res.json({
                success: true,
                data: {
                    timeframe,
                    summary: deposits,
                    pendingCount: pending
                }
            });
        } catch (error) {
            console.error('Get deposit summary error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get deposit summary',
                error: error.message
            });
        }
    };

    /**
     * Run manual deposit monitoring for all pending deposits
     */
    static async runDepositMonitoring(req, res) {
        const monitorService = new BlockchainMonitorService();
        try {
            const pendingDeposits = await Deposit.findPendingDeposits();
            
            if (pendingDeposits.length === 0) {
                return res.json({
                    success: true,
                    message: 'No pending deposits to monitor',
                    data: { processed: 0, confirmed: 0 }
                });
            }

            const results = await monitorService.batchMonitorDeposits(pendingDeposits);
            
            let confirmedCount = 0;
            
            for (const result of results) {
                if (result.status === 'CONFIRMED') {
                    const deposit = await Deposit.findById(result.depositId);
                    if (deposit) {
                        deposit.status = 'CONFIRMED';
                        deposit.actualAmount = result.amount;
                        deposit.transactionHash = result.transactionHash;
                        deposit.fromAddress = result.fromAddress;
                        deposit.blockNumber = result.blockNumber;
                        deposit.confirmations = result.confirmations;
                        deposit.processedAt = new Date();
                        
                        await deposit.save();

                        // Update user balance
                        const user = await User.findById(deposit.userId);
                        if (user) {
                            user.walletBalance += result.amount;
                            await user.save();
                        }

                        confirmedCount++;
                    }
                } else if (result.status === 'PENDING_CONFIRMATIONS') {
                    const deposit = await Deposit.findById(result.depositId);
                    if (deposit) {
                        deposit.status = 'PENDING_CONFIRMATIONS';
                        deposit.transactionHash = result.transactionHash;
                        deposit.fromAddress = result.fromAddress;
                        deposit.blockNumber = result.blockNumber;
                        deposit.confirmations = result.confirmations;
                        deposit.actualAmount = result.amount;
                        deposit.lastCheckedAt = new Date();
                        
                        await deposit.save();
                    }
                }
            }

            res.json({
                success: true,
                message: `Monitoring completed. ${confirmedCount} deposits confirmed.`,
                data: {
                    processed: results.length,
                    confirmed: confirmedCount,
                    results: results
                }
            });
        } catch (error) {
            console.error('Run deposit monitoring error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to run deposit monitoring',
                error: error.message
            });
        }
    };

    /**
     * Run fund sweep from HD wallets to owner wallet
     */
    static async runFundSweep(req, res) {
        try {
            console.log('🧹 Admin initiated fund sweep');
            
            const sweepService = new FundSweepService();
            const result = await sweepService.runComprehensiveSweep();
            
            res.json({
                success: true,
                message: 'Fund sweep completed successfully',
                data: {
                    totalProcessed: result.totalProcessed,
                    successfulSweeps: result.successfulSweeps,
                    sweeps: result.sweeps,
                    successRate: result.totalProcessed > 0 ? 
                        ((result.successfulSweeps / result.totalProcessed) * 100).toFixed(1) + '%' : '0%'
                }
            });
            
        } catch (error) {
            console.error('Fund sweep error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to run fund sweep',
                error: error.message
            });
        }
    };

    /**
     * Find stuck funds in HD wallets
     */
    static async findStuckFunds(req, res) {
        try {
            console.log('🔍 Admin checking for stuck funds');
            
            const sweepService = new FundSweepService();
            const result = await sweepService.findStuckFunds();
            
            res.status(200).json({
                success: true,
                message: 'Stuck funds scan completed',
                data: {
                    totalStuckAddresses: result.totalStuck,
                    totalStuckValue: result.totalValue,
                    stuckFunds: result.stuckFunds.map(fund => ({
                        depositId: fund.depositId,
                        userId: fund.userId,
                        address: fund.address,
                        expectedAmount: fund.expectedAmount,
                        actualBalance: fund.actualBalance,
                        trxBalance: fund.trxBalance,
                        status: fund.status,
                        ageHours: Math.round(fund.age / (1000 * 60 * 60)),
                        canRecover: fund.canRecover
                    }))
                }
            });
            
        } catch (error) {
            console.error('Find stuck funds error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to find stuck funds',
                error: error.message
            });
        }
    }

    /**
     * Emergency recovery of specific address or deposit
     */
    static async emergencyRecovery(req, res) {
        try {
            const { addressOrDepositId, forceAmount } = req.body;
            
            if (!addressOrDepositId) {
                return res.status(400).json({
                    success: false,
                    message: 'Address or deposit ID is required'
                });
            }
            
            console.log(`🚨 Admin initiated emergency recovery for: ${addressOrDepositId}`);
            
            const sweepService = new FundSweepService();
            const result = await sweepService.emergencyFundRecovery(addressOrDepositId, forceAmount);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: 'Emergency recovery successful',
                    data: {
                        amount: result.amount,
                        transactionHash: result.txHash,
                        depositId: result.depositId
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error,
                    reason: result.reason
                });
            }
            
        } catch (error) {
            console.error('Emergency recovery error:', error);
            res.status(500).json({
                success: false,
                message: 'Emergency recovery failed',
                error: error.message
            });
        }
    }

    /**
     * Bulk recovery of all stuck funds
     */
    static async bulkRecoveryStuckFunds(req, res) {
        try {
            console.log('🧹 Admin initiated bulk recovery of stuck funds');
            
            const sweepService = new FundSweepService();
            const result = await sweepService.bulkRecoveryStuckFunds();
            
            res.status(200).json({
                success: true,
                message: result.message,
                data: {
                    totalFound: result.totalFound,
                    successfulRecoveries: result.successfulRecoveries,
                    totalRecovered: result.totalRecovered,
                    successRate: result.totalFound > 0 ? 
                        ((result.successfulRecoveries / result.totalFound) * 100).toFixed(1) + '%' : '0%',
                    recoveryResults: result.recoveryResults
                }
            });
            
        } catch (error) {
            console.error('Bulk recovery error:', error);
            res.status(500).json({
                success: false,
                message: 'Bulk recovery failed',
                error: error.message
            });
        }
    }

    /**
     * Get HD wallet deposit summary
     */
    static async getHDWalletSummary(req, res) {
        try {
            // Get HD wallet deposits stats
            const totalHDDeposits = await Deposit.countDocuments({ isHDWallet: true });
            const pendingHDDeposits = await Deposit.countDocuments({ 
                isHDWallet: true, 
                status: 'PENDING' 
            });
            const confirmedHDDeposits = await Deposit.countDocuments({ 
                isHDWallet: true, 
                status: 'CONFIRMED' 
            });
            
            // Get total amounts
            const totalPendingAmount = await Deposit.aggregate([
                { $match: { isHDWallet: true, status: 'PENDING' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            const totalConfirmedAmount = await Deposit.aggregate([
                { $match: { isHDWallet: true, status: 'CONFIRMED' } },
                { $group: { _id: null, total: { $sum: '$actualAmount' } } }
            ]);
            
            // Get recent HD wallet deposits
            const recentDeposits = await Deposit.find({ isHDWallet: true })
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'email username')
                .lean();
            
            res.json({
                success: true,
                data: {
                    statistics: {
                        totalHDDeposits,
                        pendingHDDeposits,
                        confirmedHDDeposits,
                        pendingAmount: totalPendingAmount[0]?.total || 0,
                        confirmedAmount: totalConfirmedAmount[0]?.total || 0
                    },
                    recentDeposits,
                    ownerWallet: 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu'
                }
            });
            
        } catch (error) {
            console.error('HD wallet summary error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get HD wallet summary',
                error: error.message
            });
        }
    };
}

module.exports = AdminPaymentController;