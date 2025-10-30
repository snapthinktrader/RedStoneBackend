const WalletService = require('../services/walletService');
const BlockchainMonitorService = require('../services/blockchainMonitorService');
const FundSweepService = require('../services/FundSweepService');
const CompleteAutoSweepService = require('../services/CompleteAutoSweepService');
const WithdrawalValidationService = require('../services/withdrawalValidationService');
const ReusableWalletService = require('../services/reusableWalletService');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');

class PaymentController {
    /**
     * Create a new deposit request with reusable wallet (saves network fees)
     */
    static async createDeposit(req, res) {
        const reusableWalletService = new ReusableWalletService();
        
        try {
            const { amount, network = 'tron' } = req.body;
            const userId = req.user.id;

            // Validate input
            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid amount greater than 0'
                });
            }

            if (!['ethereum', 'bsc', 'polygon', 'tron'].includes(network)) {
                return res.status(400).json({
                    success: false,
                    message: 'Unsupported network'
                });
            }

            // Check for existing pending deposits
            const existingDeposit = await Deposit.findOne({
                userId,
                status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
                expiresAt: { $gt: new Date() }
            });

            if (existingDeposit) {
                return res.status(409).json({
                    success: false,
                    message: 'You have a pending deposit. Please complete it first.',
                    existingDeposit: {
                        id: existingDeposit._id,
                        address: existingDeposit.address,
                        amount: existingDeposit.expectedAmount,
                        network: existingDeposit.network,
                        expiresAt: existingDeposit.expiresAt
                    }
                });
            }

            // Get or create system-wide reusable wallet (shared by all users)
            const walletInfo = await reusableWalletService.getOrCreateDepositWallet();

            // Create deposit record
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

            const deposit = new Deposit({
                userId,
                address: walletInfo.address,
                network,
                amount: amount, // Required field
                expectedAmount: amount,
                status: 'PENDING',
                expiresAt,
                isHDWallet: true,
                isReusableWallet: true, // System-wide reusable wallet
                isSystemWallet: true, // New flag indicating system-wide wallet
                walletDepositNumber: walletInfo.depositCount + 1, // Track which deposit number this is for the wallet
                metadata: {
                    walletIsNew: walletInfo.isNew,
                    systemWalletDepositCount: walletInfo.depositCount,
                    depositCycleMax: 40,
                    isSystemWallet: true
                }
            });

            await deposit.save();

            res.status(201).json({
                success: true,
                message: walletInfo.isNew 
                    ? 'New system deposit wallet created'
                    : `Using system wallet (Deposit ${walletInfo.depositCount + 1}/40)`,
                data: {
                    depositId: deposit._id,
                    address: deposit.address,
                    network: deposit.network,
                    amount: deposit.expectedAmount,
                    qrCodeData: `${deposit.address}?amount=${amount}`,
                    expiresAt: deposit.expiresAt,
                    requiredConfirmations: deposit.requiredConfirmations,
                    isReusableWallet: true,
                    walletInfo: {
                        isNew: walletInfo.isNew,
                        depositCount: walletInfo.depositCount,
                        depositsRemaining: 40 - walletInfo.depositCount,
                        isSystemWallet: true,
                        message: walletInfo.isNew 
                            ? 'New system wallet created - will handle up to 40 deposits'
                            : `System wallet in use (${walletInfo.depositCount}/40 deposits, ${40 - walletInfo.depositCount} remaining)`
                    },
                    instructions: {
                        message: 'Send USDT (TRC-20) to this address. System wallet optimizes gas fees across all users.',
                        usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                        network: 'TRON TRC-20',
                        feeOptimization: 'System-wide wallet reuse - optimized gas fees',
                        autoRotation: 'Wallet auto-rotates after 40 deposits with auto-sweep to main wallet'
                    }
                }
            });
        } catch (error) {
            console.error('Create deposit error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create deposit request',
                error: error.message
            });
        }
    };

    /**
     * Get deposit status
     */
    static async getDepositStatus(req, res) {
        try {
            const { depositId } = req.params;
            const userId = req.user.id;

            const deposit = await Deposit.findOne({ _id: depositId, userId });
            
            if (!deposit) {
                return res.status(404).json({
                    success: false,
                    message: 'Deposit not found'
                });
            }

            // Check if expired
            if (deposit.isExpired() && deposit.status === 'PENDING') {
                deposit.status = 'EXPIRED';
                await deposit.save();
            }

            res.json({
                success: true,
                data: {
                    id: deposit._id,
                    address: deposit.address,
                    network: deposit.network,
                    expectedAmount: deposit.expectedAmount,
                    actualAmount: deposit.actualAmount,
                    status: deposit.status,
                    transactionHash: deposit.transactionHash,
                    confirmations: deposit.confirmations,
                    requiredConfirmations: deposit.requiredConfirmations,
                    expiresAt: deposit.expiresAt,
                    createdAt: deposit.createdAt,
                    processedAt: deposit.processedAt
                }
            });
        } catch (error) {
            console.error('Get deposit status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get deposit status',
                error: error.message
            });
        }
    };

    /**
     * Get user's deposit history
     */
    static async getDepositHistory(req, res) {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 20, status } = req.query;

            const query = { userId };
            if (status) {
                query.status = status;
            }

            const deposits = await Deposit.find(query)
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit);

            const total = await Deposit.countDocuments(query);

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
            console.error('Get deposit history error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get deposit history',
                error: error.message
            });
        }
    };

    /**
     * Create withdrawal request
     */
    static async createWithdrawal(req, res) {
        try {
            const { amount, toAddress, network = 'bsc', userNotes = '' } = req.body;
            const userId = req.user.id;

            // Validate input
            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid amount'
                });
            }

            if (!toAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Withdrawal address is required'
                });
            }

            const walletService = new WalletService();
        
            if (!walletService.validateAddress(toAddress, network)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid withdrawal address'
                });
            }

            // Validate withdrawal based on tier rules
            const validation = await WithdrawalValidationService.validateWithdrawal(userId, amount);
            
            if (!validation.success) {
                return res.status(400).json(validation);
            }

            // Get user
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get settings for network fee
            const settings = await AdminSettings.getCurrentSettings();
            const networkFee = settings.withdrawalTierRules.networkFee;

            // Create withdrawal request
            const withdrawalRequest = await walletService.createWithdrawalRequest(
                userId, 
                toAddress, 
                amount, 
                network
            );

            // Calculate net amount after network fee
            const netAmount = amount - networkFee;

            // Save to database
            const withdrawal = new Withdrawal({
                userId,
                toAddress,
                network,
                amount,
                actualAmount: netAmount,
                fees: {
                    ...withdrawalRequest.fees,
                    usd: networkFee,
                    network: networkFee
                },
                userNotes,
                metadata: {
                    ...withdrawalRequest.metadata,
                    userBalance: user.walletBalance,
                    tierInfo: validation.details,
                    requestIP: req.ip,
                    userAgent: req.get('User-Agent')
                }
            });

            await withdrawal.save();

            res.status(201).json({
                success: true,
                message: 'Withdrawal request created successfully. Pending admin approval.',
                data: {
                    withdrawalId: withdrawal._id,
                    amount: withdrawal.amount,
                    networkFee: networkFee,
                    netAmount: netAmount,
                    toAddress: withdrawal.toAddress,
                    network: withdrawal.network,
                    status: withdrawal.status,
                    tierInfo: validation.details,
                    createdAt: withdrawal.createdAt,
                    estimatedProcessingTime: validation.details.processingTime
                }
            });
        } catch (error) {
            console.error('Create withdrawal error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create withdrawal request',
                error: error.message
            });
        }
    };

    /**
     * Get withdrawal status
     */
    static async getWithdrawalStatus(req, res) {
        try {
            const { withdrawalId } = req.params;
            const userId = req.user.id;

            const withdrawal = await Withdrawal.findOne({ _id: withdrawalId, userId })
                .populate('approvedBy', 'username email');
            
            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message: 'Withdrawal not found'
                });
            }

            res.json({
                success: true,
                data: {
                    id: withdrawal._id,
                    amount: withdrawal.amount,
                    actualAmount: withdrawal.actualAmount,
                    toAddress: withdrawal.toAddress,
                    network: withdrawal.network,
                    status: withdrawal.status,
                    transactionHash: withdrawal.transactionHash,
                    confirmations: withdrawal.confirmations,
                    requiredConfirmations: withdrawal.requiredConfirmations,
                    fees: withdrawal.fees,
                    netAmount: withdrawal.calculateNetAmount(),
                    approvedBy: withdrawal.approvedBy,
                    approvedAt: withdrawal.approvedAt,
                    createdAt: withdrawal.createdAt,
                    processedAt: withdrawal.processedAt,
                    confirmedAt: withdrawal.confirmedAt,
                    rejectionReason: withdrawal.rejectionReason
                }
            });
        } catch (error) {
            console.error('Get withdrawal status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get withdrawal status',
                error: error.message
            });
        }
    };

    /**
     * Get user's withdrawal history
     */
    static async getWithdrawalHistory(req, res) {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 20, status } = req.query;

            const query = { userId };
            if (status) {
                query.status = status;
            }

            const withdrawals = await Withdrawal.find(query)
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .populate('approvedBy', 'username email');

            const total = await Withdrawal.countDocuments(query);

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
            console.error('Get withdrawal history error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get withdrawal history',
                error: error.message
            });
        }
    };

    /**
     * Get withdrawal limits for current user
     */
    static async getWithdrawalLimits(req, res) {
        try {
            const userId = req.user.id;
            
            const limitsData = await WithdrawalValidationService.getWithdrawalLimits(userId);
            
            if (!limitsData.success) {
                return res.status(400).json(limitsData);
            }

            res.json(limitsData);
        } catch (error) {
            console.error('Get withdrawal limits error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get withdrawal limits',
                error: error.message
            });
        }
    };

    /**
     * Get system-wide reusable wallet information
     */
    static async getReusableWalletInfo(req, res) {
        try {
            const reusableWalletService = new ReusableWalletService();
            
            const walletInfo = await reusableWalletService.getActiveWalletInfo();
            
            if (!walletInfo) {
                return res.json({
                    success: true,
                    data: {
                        hasWallet: false,
                        message: 'No active system wallet. One will be created on the first deposit.',
                        isSystemWallet: true
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    hasWallet: true,
                    isSystemWallet: true,
                    ...walletInfo,
                    message: `System wallet active with ${walletInfo.depositCount}/40 deposits (${walletInfo.depositsRemaining} remaining before rotation)`
                }
            });
        } catch (error) {
            console.error('Get reusable wallet info error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get wallet information',
                error: error.message
            });
        }
    };

    /**
     * Manual deposit monitoring (for testing)
     */
    static async checkDepositManually(req, res) {
        try {
            const { depositId } = req.params;
            const userId = req.user.id;

            const deposit = await Deposit.findOne({ _id: depositId, userId });
            
            if (!deposit) {
                return res.status(404).json({
                    success: false,
                    message: 'Deposit not found'
                });
            }

            if (deposit.status === 'CONFIRMED') {
                return res.json({
                    success: true,
                    message: 'Deposit already confirmed',
                    data: deposit
                });
            }

            // Monitor the deposit address
            const monitorService = new BlockchainMonitorService();
            const monitorResult = await monitorService.monitorDepositAddress(deposit);

            if (monitorResult.status === 'CONFIRMED') {
                // Update deposit
                deposit.status = 'CONFIRMED';
                deposit.actualAmount = monitorResult.amount;
                deposit.transactionHash = monitorResult.transactionHash;
                deposit.fromAddress = monitorResult.fromAddress;
                deposit.blockNumber = monitorResult.blockNumber;
                deposit.confirmations = monitorResult.confirmations;
                deposit.processedAt = new Date();
                
                if (monitorResult.gasUsed) {
                    deposit.metadata.gasUsed = monitorResult.gasUsed;
                    deposit.metadata.gasPrice = monitorResult.gasPrice;
                }

                await deposit.save();

                // Update user balance
                const user = await User.findById(userId);
                user.walletBalance += monitorResult.amount;
                await user.save();

                res.json({
                    success: true,
                    message: 'Deposit confirmed and balance updated',
                    data: {
                        deposit,
                        newBalance: user.walletBalance,
                        monitorResult
                    }
                });
            } else {
                deposit.lastCheckedAt = new Date();
                if (monitorResult.confirmations) {
                    deposit.confirmations = monitorResult.confirmations;
                    if (monitorResult.status === 'PENDING_CONFIRMATIONS') {
                        deposit.status = 'PENDING_CONFIRMATIONS';
                        deposit.transactionHash = monitorResult.transactionHash;
                        deposit.fromAddress = monitorResult.fromAddress;
                        deposit.blockNumber = monitorResult.blockNumber;
                        deposit.actualAmount = monitorResult.amount;
                    }
                }
                await deposit.save();

                res.json({
                    success: true,
                    message: 'Deposit status updated',
                    data: {
                        deposit,
                        monitorResult
                    }
                });
            }
        } catch (error) {
            console.error('Check deposit manually error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check deposit',
                error: error.message
            });
        }
    };

    /**
     * Cancel a pending deposit
     */
    static async cancelDeposit(req, res) {
        try {
            const { depositId } = req.params;
            const userId = req.user.id;

            const deposit = await Deposit.findOne({ 
                _id: depositId, 
                userId,
                status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] }
            });
            
            if (!deposit) {
                return res.status(404).json({
                    success: false,
                    message: 'Pending deposit not found or already processed'
                });
            }

            // Update deposit status to cancelled
            deposit.status = 'CANCELLED';
            deposit.processedAt = new Date();
            deposit.notes = 'Cancelled by user';
            
            await deposit.save();

            res.json({
                success: true,
                message: 'Deposit cancelled successfully',
                data: deposit
            });
        } catch (error) {
            console.error('Cancel deposit error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel deposit',
                error: error.message
            });
        }
    };

    /**
     * Check deposit status and trigger fund sweep if needed
     */
    static async checkAndSweepDeposit(req, res) {
        try {
            const { depositId } = req.params;
            const userId = req.user.id;

            const deposit = await Deposit.findOne({ _id: depositId, userId });
            
            if (!deposit) {
                return res.status(404).json({
                    success: false,
                    message: 'Deposit not found'
                });
            }

            if (deposit.status === 'CONFIRMED') {
                return res.json({
                    success: true,
                    message: 'Deposit already confirmed',
                    data: deposit
                });
            }

            // For HD wallet deposits, use the sweep service
            if (deposit.isHDWallet) {
                const sweepService = new FundSweepService();
                const sweepResult = await sweepService.processSingleDeposit(deposit);
                
                if (sweepResult.success) {
                    // Reload deposit from database to get updated data
                    const updatedDeposit = await Deposit.findById(depositId);
                    
                    return res.json({
                        success: true,
                        message: 'Deposit confirmed and funds swept successfully',
                        data: {
                            deposit: updatedDeposit,
                            sweepResult
                        }
                    });
                } else {
                    return res.json({
                        success: false,
                        message: 'Deposit not yet received or sweep failed',
                        data: {
                            deposit,
                            sweepResult
                        }
                    });
                }
            } else {
                // For non-HD wallets, use old monitoring
                const monitorService = new BlockchainMonitorService();
                const monitorResult = await monitorService.monitorDepositAddress(deposit);

                if (monitorResult.status === 'CONFIRMED') {
                    // Update deposit
                    deposit.status = 'CONFIRMED';
                    deposit.actualAmount = monitorResult.amount;
                    deposit.transactionHash = monitorResult.transactionHash;
                    deposit.fromAddress = monitorResult.fromAddress;
                    deposit.blockNumber = monitorResult.blockNumber;
                    deposit.confirmations = monitorResult.confirmations;
                    deposit.processedAt = new Date();
                    
                    await deposit.save();

                    // Update user balance
                    const user = await User.findById(userId);
                    if (user) {
                        user.walletBalance += monitorResult.amount;
                        await user.save();
                    }
                }

                return res.json({
                    success: true,
                    message: 'Deposit status checked',
                    data: {
                        deposit,
                        monitorResult
                    }
                });
            }
        } catch (error) {
            console.error('Check and sweep deposit error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check deposit',
                error: error.message
            });
        }
    };

    /**
     * Get auto-sweep service status
     */
    static async getAutoSweepStatus(req, res) {
        try {
            const autoSweepService = new CompleteAutoSweepService();
            const status = await autoSweepService.getServiceStatus();
            
            res.json({
                success: true,
                message: 'Auto-sweep status retrieved',
                data: status
            });
        } catch (error) {
            console.error('Get auto-sweep status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get auto-sweep status',
                error: error.message
            });
        }
    }

    /**
     * Start auto-sweep service
     */
    static async startAutoSweep(req, res) {
        try {
            const autoSweepService = new CompleteAutoSweepService();
            autoSweepService.start();
            
            res.json({
                success: true,
                message: 'Auto-sweep service started',
                data: { running: true }
            });
        } catch (error) {
            console.error('Start auto-sweep error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to start auto-sweep service',
                error: error.message
            });
        }
    }

    /**
     * Stop auto-sweep service
     */
    static async stopAutoSweep(req, res) {
        try {
            const autoSweepService = new CompleteAutoSweepService();
            autoSweepService.stop();
            
            res.json({
                success: true,
                message: 'Auto-sweep service stopped',
                data: { running: false }
            });
        } catch (error) {
            console.error('Stop auto-sweep error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to stop auto-sweep service',
                error: error.message
            });
        }
    }

    /**
     * Get deposit details with auto-sweep information
     */
    static async getDepositWithSweepInfo(req, res) {
        try {
            const { depositId } = req.params;
            const userId = req.user.id;

            const deposit = await Deposit.findOne({
                _id: depositId,
                userId: userId
            });

            if (!deposit) {
                return res.status(404).json({
                    success: false,
                    message: 'Deposit not found'
                });
            }

            // Get wallet balances if deposit is confirmed
            let walletBalances = null;
            if (deposit.status === 'CONFIRMED' && deposit.address) {
                try {
                    const autoSweepService = new CompleteAutoSweepService();
                    walletBalances = await autoSweepService.usdtSweepService.getWalletBalances(deposit.address);
                } catch (error) {
                    console.log('Could not fetch wallet balances:', error.message);
                }
            }

            res.json({
                success: true,
                message: 'Deposit details retrieved',
                data: {
                    deposit,
                    walletBalances,
                    sweepInfo: {
                        status: deposit.sweepStatus,
                        attempts: deposit.sweepAttempts,
                        lastAttempt: deposit.lastSweepAttempt,
                        error: deposit.sweepError,
                        gasFeesCalculated: deposit.gasFeesCalculated,
                        gasFeesSent: deposit.gasFeesSent,
                        gasTxHash: deposit.gasTxHash,
                        sweepTxHash: deposit.sweepTransactionHash
                    }
                }
            });
        } catch (error) {
            console.error('Get deposit with sweep info error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get deposit information',
                error: error.message
            });
        }
    }
}

module.exports = PaymentController;