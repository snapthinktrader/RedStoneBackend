const { TronWeb } = require('tronweb');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const AdminSettings = require('../models/AdminSettings');

/**
 * Reusable Wallet Service
 * Manages user's deposit wallets to minimize network fees
 * - Reuses same wallet for up to 40 deposits
 * - Handles withdrawals from active wallet
 * - Rotates wallet after 40 deposits
 */
class ReusableWalletService {
    constructor() {
        this.tronWeb = new TronWeb({
            fullHost: process.env.TRON_NETWORK || 'https://api.trongrid.io',
            headers: { "TRON-PRO-API-KEY": process.env.TRON_API_KEY || '' },
        });
        this.DEPOSITS_PER_WALLET = 40; // Rotate after 40 deposits
    }

    /**
     * Get or create a reusable deposit wallet for user
     * @param {String} userId - User ID
     * @returns {Object} - Wallet details (address, depositCount)
     */
    async getOrCreateDepositWallet(userId) {
        try {
            // Get user with private key field
            const user = await User.findById(userId).select('+currentDepositWallet.privateKey');
            
            if (!user) {
                throw new Error('User not found');
            }

            // Check if user has an active wallet
            if (user.currentDepositWallet?.address && 
                user.currentDepositWallet?.isActive && 
                user.currentDepositWallet.depositCount < this.DEPOSITS_PER_WALLET) {
                
                console.log(`[Reusable Wallet] User ${userId} using existing wallet ${user.currentDepositWallet.address} (${user.currentDepositWallet.depositCount}/40 deposits)`);
                
                return {
                    address: user.currentDepositWallet.address,
                    privateKey: user.currentDepositWallet.privateKey,
                    depositCount: user.currentDepositWallet.depositCount,
                    isNew: false,
                    canAcceptDeposits: true
                };
            }

            // Check if rotation is needed
            if (user.currentDepositWallet?.address && 
                user.currentDepositWallet.depositCount >= this.DEPOSITS_PER_WALLET) {
                
                console.log(`[Reusable Wallet] Wallet rotation needed for user ${userId}. Creating new wallet...`);
                
                // Rotate wallet (transfer remaining balance to main wallet)
                await this.rotateWallet(userId);
            }

            // Create new wallet
            const newWallet = await this.createNewWallet(userId);
            
            return newWallet;

        } catch (error) {
            console.error('[Reusable Wallet] Error getting/creating wallet:', error);
            throw error;
        }
    }

    /**
     * Create a new deposit wallet for user
     * @param {String} userId - User ID
     * @returns {Object} - New wallet details
     */
    async createNewWallet(userId) {
        try {
            // Generate new Tron wallet
            const account = await this.tronWeb.createAccount();
            const address = account.address.base58;
            const privateKey = account.privateKey;

            console.log(`[Reusable Wallet] Generated new wallet for user ${userId}: ${address}`);

            // Update user with new wallet
            const user = await User.findById(userId);
            user.currentDepositWallet = {
                address,
                privateKey,
                depositCount: 0,
                totalReceived: 0,
                createdAt: new Date(),
                lastUsedAt: new Date(),
                isActive: true
            };

            await user.save();

            return {
                address,
                privateKey,
                depositCount: 0,
                isNew: true,
                canAcceptDeposits: true
            };

        } catch (error) {
            console.error('[Reusable Wallet] Error creating new wallet:', error);
            throw error;
        }
    }

    /**
     * Increment deposit count for user's wallet
     * @param {String} userId - User ID
     * @param {Number} amount - Deposit amount
     */
    async incrementDepositCount(userId, amount) {
        try {
            const user = await User.findById(userId);
            
            if (!user || !user.currentDepositWallet?.address) {
                console.error('[Reusable Wallet] No active wallet found for user');
                return;
            }

            user.currentDepositWallet.depositCount += 1;
            user.currentDepositWallet.totalReceived += amount;
            user.currentDepositWallet.lastUsedAt = new Date();

            await user.save();

            console.log(`[Reusable Wallet] User ${userId} wallet usage: ${user.currentDepositWallet.depositCount}/40 deposits, Total: $${user.currentDepositWallet.totalReceived.toFixed(2)}`);

            // Check if rotation is needed
            if (user.currentDepositWallet.depositCount >= this.DEPOSITS_PER_WALLET) {
                console.log(`[Reusable Wallet] Wallet ${user.currentDepositWallet.address} reached 40 deposits. Rotation scheduled.`);
                // Note: Rotation will happen on next deposit request
            }

        } catch (error) {
            console.error('[Reusable Wallet] Error incrementing deposit count:', error);
            throw error;
        }
    }

    /**
     * Rotate wallet - transfer balance to main wallet and archive
     * @param {String} userId - User ID
     */
    async rotateWallet(userId) {
        try {
            const user = await User.findById(userId).select('+currentDepositWallet.privateKey');
            
            if (!user || !user.currentDepositWallet?.address) {
                console.log('[Reusable Wallet] No wallet to rotate');
                return;
            }

            const oldWallet = user.currentDepositWallet;
            console.log(`[Reusable Wallet] Rotating wallet ${oldWallet.address} after ${oldWallet.depositCount} deposits`);

            // Check balance in the old wallet
            const balance = await this.getWalletBalance(oldWallet.address);
            
            console.log(`[Reusable Wallet] Old wallet balance: ${balance} USDT`);

            // If there's a balance, transfer to main wallet
            if (balance > 1) { // Only transfer if more than 1 USDT (to cover fees)
                console.log(`[Reusable Wallet] Transferring ${balance} USDT to main wallet...`);
                
                // Get main wallet address from settings
                const settings = await AdminSettings.getCurrentSettings();
                const mainWalletAddress = settings.mainWalletAddress;

                try {
                    await this.transferToMainWallet(
                        oldWallet.address, 
                        oldWallet.privateKey, 
                        mainWalletAddress, 
                        balance
                    );
                } catch (transferError) {
                    console.error('[Reusable Wallet] Transfer failed, but continuing rotation:', transferError);
                }
            }

            // Archive old wallet
            user.walletRotationHistory.push({
                address: oldWallet.address,
                depositCount: oldWallet.depositCount,
                totalReceived: oldWallet.totalReceived,
                createdAt: oldWallet.createdAt,
                rotatedAt: new Date(),
                finalBalance: balance
            });

            // Mark old wallet as inactive
            user.currentDepositWallet.isActive = false;

            await user.save();

            console.log(`[Reusable Wallet] Wallet rotation completed for user ${userId}`);

        } catch (error) {
            console.error('[Reusable Wallet] Error rotating wallet:', error);
            // Don't throw - allow wallet creation to continue
        }
    }

    /**
     * Get USDT balance of a wallet
     * @param {String} address - Wallet address
     * @returns {Number} - USDT balance
     */
    async getWalletBalance(address) {
        try {
            const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
            const contract = await this.tronWeb.contract().at(usdtContract);
            const balance = await contract.balanceOf(address).call();
            
            // USDT has 6 decimals
            return balance / 1000000;
        } catch (error) {
            console.error('[Reusable Wallet] Error getting balance:', error);
            return 0;
        }
    }

    /**
     * Transfer USDT from old wallet to main wallet
     * @param {String} fromAddress - Source address
     * @param {String} privateKey - Private key of source
     * @param {String} toAddress - Destination address
     * @param {Number} amount - Amount in USDT
     */
    async transferToMainWallet(fromAddress, privateKey, toAddress, amount) {
        try {
            const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
            
            // Set private key for signing
            this.tronWeb.setPrivateKey(privateKey);
            
            // Get contract instance
            const contract = await this.tronWeb.contract().at(usdtContract);
            
            // Convert amount to smallest unit (6 decimals)
            const amountInSmallestUnit = Math.floor(amount * 1000000);
            
            // Send transaction
            const transaction = await contract.transfer(
                toAddress,
                amountInSmallestUnit
            ).send({
                feeLimit: 100000000, // 100 TRX fee limit
                shouldPollResponse: true
            });

            console.log(`[Reusable Wallet] Transfer successful: ${transaction}`);
            
            return transaction;

        } catch (error) {
            console.error('[Reusable Wallet] Transfer error:', error);
            throw error;
        }
    }

    /**
     * Get user's active wallet info
     * @param {String} userId - User ID
     * @returns {Object} - Wallet information
     */
    async getActiveWalletInfo(userId) {
        try {
            const user = await User.findById(userId);
            
            if (!user || !user.currentDepositWallet?.address) {
                return null;
            }

            const balance = await this.getWalletBalance(user.currentDepositWallet.address);

            return {
                address: user.currentDepositWallet.address,
                depositCount: user.currentDepositWallet.depositCount,
                totalReceived: user.currentDepositWallet.totalReceived,
                currentBalance: balance,
                isActive: user.currentDepositWallet.isActive,
                createdAt: user.currentDepositWallet.createdAt,
                canAcceptMore: user.currentDepositWallet.depositCount < this.DEPOSITS_PER_WALLET,
                depositsRemaining: this.DEPOSITS_PER_WALLET - user.currentDepositWallet.depositCount
            };

        } catch (error) {
            console.error('[Reusable Wallet] Error getting wallet info:', error);
            return null;
        }
    }

    /**
     * Check if wallet needs rotation
     * @param {String} userId - User ID
     * @returns {Boolean} - True if rotation needed
     */
    async needsRotation(userId) {
        try {
            const user = await User.findById(userId);
            
            if (!user || !user.currentDepositWallet?.address) {
                return false;
            }

            return user.currentDepositWallet.depositCount >= this.DEPOSITS_PER_WALLET;

        } catch (error) {
            console.error('[Reusable Wallet] Error checking rotation:', error);
            return false;
        }
    }
}

module.exports = ReusableWalletService;
