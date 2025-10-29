const AdminSettings = require('../models/AdminSettings');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');

/**
 * Withdrawal Validation Service
 * Validates withdrawal requests based on tier rules, withdrawal count, and time restrictions
 */
class WithdrawalValidationService {
    /**
     * Get tier category based on user level
     * @param {Number} level - User's current level (1-8)
     * @returns {String} - Tier category: 'basic', 'premium', or 'elite'
     */
    static getTierCategory(level) {
        if (level >= 1 && level <= 3) return 'basic';    // Basic, Bronze, Silver
        if (level >= 4 && level <= 6) return 'premium';  // Gold, Platinum, Diamond
        if (level >= 7 && level <= 8) return 'elite';    // Ascendant, Radiant
        return 'basic'; // Default to basic
    }

    /**
     * Get tier name based on user level
     * @param {Number} level - User's current level (1-8)
     * @returns {String} - Tier name
     */
    static getTierName(level) {
        const tiers = {
            1: 'Basic',
            2: 'Bronze',
            3: 'Silver',
            4: 'Gold',
            5: 'Platinum',
            6: 'Diamond',
            7: 'Ascendant',
            8: 'Radiant'
        };
        return tiers[level] || 'Basic';
    }

    /**
     * Validate withdrawal request based on tier rules
     * @param {String} userId - User ID
     * @param {Number} amount - Withdrawal amount
     * @returns {Object} - Validation result with success status and message
     */
    static async validateWithdrawal(userId, amount) {
        try {
            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Get admin settings with withdrawal rules
            const settings = await AdminSettings.getCurrentSettings();
            const tierRules = settings.withdrawalTierRules;
            
            // Get tier category and rules
            const tierCategory = this.getTierCategory(user.currentLevel);
            const tierName = this.getTierName(user.currentLevel);
            const categoryRules = tierRules.tiers[tierCategory];

            // Check minimum withdrawal
            if (amount < tierRules.minimumWithdrawal) {
                return {
                    success: false,
                    message: `Minimum withdrawal amount is $${tierRules.minimumWithdrawal}`,
                    minimumAmount: tierRules.minimumWithdrawal
                };
            }

            // Check wallet balance (including network fee)
            const totalRequired = amount + tierRules.networkFee;
            if (user.walletBalance < totalRequired) {
                return {
                    success: false,
                    message: `Insufficient balance. You need $${totalRequired.toFixed(2)} (including $${tierRules.networkFee} network fee)`,
                    required: totalRequired,
                    available: user.walletBalance,
                    networkFee: tierRules.networkFee
                };
            }

            // Get count of successful withdrawals
            const successfulWithdrawals = await Withdrawal.countDocuments({
                userId,
                status: 'CONFIRMED'
            });

            const withdrawalNumber = successfulWithdrawals + 1; // Next withdrawal number

            // Validate based on withdrawal number
            let maxAmount;
            let needsWaitingPeriod = false;
            let waitingDays = 0;

            if (withdrawalNumber === 1) {
                // First withdrawal
                maxAmount = categoryRules.firstWithdrawal;
            } else if (withdrawalNumber === 2) {
                // Second withdrawal
                maxAmount = categoryRules.secondWithdrawal;
            } else {
                // Third and subsequent withdrawals
                maxAmount = categoryRules.thirdWithdrawal;
                
                // Check waiting period for 3rd+ withdrawals
                if (withdrawalNumber >= 3) {
                    needsWaitingPeriod = true;
                    waitingDays = categoryRules.waitingPeriodDays;
                    
                    // Get last successful withdrawal
                    const lastWithdrawal = await Withdrawal.findOne({
                        userId,
                        status: 'CONFIRMED'
                    }).sort({ confirmedAt: -1 });

                    if (lastWithdrawal && lastWithdrawal.confirmedAt) {
                        const daysSinceLastWithdrawal = (Date.now() - lastWithdrawal.confirmedAt.getTime()) / (1000 * 60 * 60 * 24);
                        
                        if (daysSinceLastWithdrawal < waitingDays) {
                            const remainingDays = Math.ceil(waitingDays - daysSinceLastWithdrawal);
                            return {
                                success: false,
                                message: `You must wait ${waitingDays} days between withdrawals. ${remainingDays} day(s) remaining.`,
                                waitingPeriod: waitingDays,
                                remainingDays,
                                lastWithdrawalDate: lastWithdrawal.confirmedAt
                            };
                        }
                    }
                }
            }

            // Check if amount exceeds tier limit
            if (amount > maxAmount) {
                return {
                    success: false,
                    message: `Your ${tierName} tier allows a maximum of $${maxAmount} for withdrawal #${withdrawalNumber}`,
                    maxAmount,
                    requestedAmount: amount,
                    withdrawalNumber,
                    tierName
                };
            }

            // Check for pending withdrawals
            const pendingWithdrawal = await Withdrawal.findOne({
                userId,
                status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'SIGNED', 'BROADCASTED'] }
            });

            if (pendingWithdrawal) {
                return {
                    success: false,
                    message: 'You have a pending withdrawal. Please wait for it to complete.',
                    pendingWithdrawal: {
                        id: pendingWithdrawal._id,
                        amount: pendingWithdrawal.amount,
                        status: pendingWithdrawal.status,
                        createdAt: pendingWithdrawal.createdAt
                    }
                };
            }

            // All validations passed
            return {
                success: true,
                message: 'Withdrawal request is valid',
                details: {
                    tierName,
                    tierCategory,
                    withdrawalNumber,
                    maxAmount,
                    requestedAmount: amount,
                    networkFee: tierRules.networkFee,
                    netAmount: amount - tierRules.networkFee,
                    processingTime: `${tierRules.processingTimeMin}-${tierRules.processingTimeMax} hours`,
                    waitingPeriod: needsWaitingPeriod ? `${waitingDays} days` : 'None'
                }
            };

        } catch (error) {
            console.error('Withdrawal validation error:', error);
            return {
                success: false,
                message: 'Error validating withdrawal request',
                error: error.message
            };
        }
    }

    /**
     * Get withdrawal limits for a user
     * @param {String} userId - User ID
     * @returns {Object} - Withdrawal limits and tier information
     */
    static async getWithdrawalLimits(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const settings = await AdminSettings.getCurrentSettings();
            const tierRules = settings.withdrawalTierRules;
            
            const tierCategory = this.getTierCategory(user.currentLevel);
            const tierName = this.getTierName(user.currentLevel);
            const categoryRules = tierRules.tiers[tierCategory];

            // Get successful withdrawals count
            const successfulWithdrawals = await Withdrawal.countDocuments({
                userId,
                status: 'CONFIRMED'
            });

            const nextWithdrawalNumber = successfulWithdrawals + 1;
            
            // Determine max amount for next withdrawal
            let maxAmount;
            if (nextWithdrawalNumber === 1) {
                maxAmount = categoryRules.firstWithdrawal;
            } else if (nextWithdrawalNumber === 2) {
                maxAmount = categoryRules.secondWithdrawal;
            } else {
                maxAmount = categoryRules.thirdWithdrawal;
            }

            // Check waiting period
            let canWithdraw = true;
            let waitingMessage = null;
            
            if (nextWithdrawalNumber >= 3) {
                const lastWithdrawal = await Withdrawal.findOne({
                    userId,
                    status: 'CONFIRMED'
                }).sort({ confirmedAt: -1 });

                if (lastWithdrawal && lastWithdrawal.confirmedAt) {
                    const daysSinceLastWithdrawal = (Date.now() - lastWithdrawal.confirmedAt.getTime()) / (1000 * 60 * 60 * 24);
                    
                    if (daysSinceLastWithdrawal < categoryRules.waitingPeriodDays) {
                        canWithdraw = false;
                        const remainingDays = Math.ceil(categoryRules.waitingPeriodDays - daysSinceLastWithdrawal);
                        waitingMessage = `You must wait ${remainingDays} more day(s) before your next withdrawal`;
                    }
                }
            }

            return {
                success: true,
                data: {
                    tierName,
                    tierCategory,
                    currentLevel: user.currentLevel,
                    minimumWithdrawal: tierRules.minimumWithdrawal,
                    networkFee: tierRules.networkFee,
                    processingTime: {
                        min: tierRules.processingTimeMin,
                        max: tierRules.processingTimeMax,
                        text: `${tierRules.processingTimeMin}-${tierRules.processingTimeMax} hours`
                    },
                    nextWithdrawal: {
                        number: nextWithdrawalNumber,
                        maxAmount,
                        canWithdraw,
                        waitingMessage
                    },
                    tierLimits: {
                        firstWithdrawal: categoryRules.firstWithdrawal,
                        secondWithdrawal: categoryRules.secondWithdrawal,
                        thirdAndBeyond: categoryRules.thirdWithdrawal,
                        waitingPeriodDays: categoryRules.waitingPeriodDays
                    },
                    withdrawalHistory: {
                        totalSuccessful: successfulWithdrawals,
                        totalAmount: user.totalWithdrawn || 0
                    }
                }
            };

        } catch (error) {
            console.error('Get withdrawal limits error:', error);
            return {
                success: false,
                message: 'Error fetching withdrawal limits',
                error: error.message
            };
        }
    }
}

module.exports = WithdrawalValidationService;
