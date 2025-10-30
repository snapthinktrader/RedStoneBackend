const { TronWeb } = require('tronweb');
const SystemWallet = require('../models/SystemWallet');
const AdminSettings = require('../models/AdminSettings');

/**
 * Reusable Wallet Service
 * Manages SYSTEM-WIDE reusable deposit wallet (shared by all users)
 * - Single wallet used for ALL user deposits
 * - Rotates after 40 total deposits
 * - Sweeps to main wallet at rotation
 * - Recovers TRX to fuel wallet
 */
class ReusableWalletService {
    constructor() {
        const network = process.env.TRON_NETWORK === 'mainnet' 
            ? 'https://api.trongrid.io' 
            : 'https://api.shasta.trongrid.io';
            
        this.tronWeb = new TronWeb({
            fullHost: network,
            headers: { "TRON-PRO-API-KEY": process.env.TRON_API_KEY || '' },
        });
        this.DEPOSITS_PER_WALLET = 40; // Rotate after 40 deposits
        this.FUEL_WALLET_ADDRESS = process.env.FUEL_WALLET_ADDRESS;
        this.FUEL_WALLET_PRIVATE_KEY = process.env.FUEL_WALLET_PRIVATE_KEY;
    }

    /**
     * Get or create the system-wide reusable deposit wallet
     * All users share the same wallet until it reaches 40 deposits
     * Uses actual blockchain transaction count for accuracy
     * @returns {Object} - Wallet details (address, depositCount)
     */
    async getOrCreateDepositWallet() {
        try {
            // Get current active wallet
            let wallet = await SystemWallet.getActiveWallet();
            
            if (wallet) {
                // Check actual deposit count from blockchain/database
                const actualCount = await this.getActualDepositCount();
                
                // Check if rotation is needed based on actual count
                if (actualCount >= this.DEPOSITS_PER_WALLET) {
                    console.log(`[System Wallet] Rotation needed: ${actualCount}/40 deposits completed. Triggering rotation...`);
                    await this.rotateWallet();
                    
                    // Get the newly created wallet after rotation
                    wallet = await SystemWallet.getActiveWallet();
                    const newCount = await this.getActualDepositCount();
                    
                    return {
                        address: wallet.address,
                        privateKey: wallet.privateKey,
                        depositCount: newCount,
                        isNew: true,
                        canAcceptDeposits: true,
                        isSystemWallet: true
                    };
                }
                
                console.log(`[System Wallet] Using active wallet ${wallet.address} (${actualCount}/40 deposits)`);
                
                return {
                    address: wallet.address,
                    privateKey: wallet.privateKey,
                    depositCount: actualCount,
                    isNew: false,
                    canAcceptDeposits: true,
                    isSystemWallet: true
                };
            }

            // No active wallet, create new one
            console.log(`[System Wallet] No active wallet found. Creating new system wallet...`);
            const newWallet = await this.createNewWallet();
            
            return newWallet;

        } catch (error) {
            console.error('[System Wallet] Error getting/creating wallet:', error);
            throw error;
        }
    }

    /**
     * Create a new system-wide deposit wallet
     * @returns {Object} - New wallet details
     */
    async createNewWallet() {
        try {
            // Generate new Tron wallet
            const account = await this.tronWeb.createAccount();
            const address = account.address.base58;
            const privateKey = account.privateKey;

            console.log(`[System Wallet] Generated new system wallet: ${address}`);

            // Create new system wallet in database
            const systemWallet = new SystemWallet({
                address,
                privateKey,
                depositCount: 0,
                totalReceived: 0,
                status: 'ACTIVE',
                metadata: {
                    network: 'tron'
                }
            });

            await systemWallet.save();

            return {
                address,
                privateKey,
                depositCount: 0,
                isNew: true,
                canAcceptDeposits: true,
                isSystemWallet: true
            };

        } catch (error) {
            console.error('[System Wallet] Error creating new wallet:', error);
            throw error;
        }
    }

    /**
     * Count actual deposits from blockchain for system wallet
     * More accurate than manual counter - counts real transactions
     * @returns {Number} - Number of actual USDT deposits received
     */
    async getActualDepositCount() {
        try {
            const wallet = await SystemWallet.getActiveWallet();
            
            if (!wallet) {
                console.error('[System Wallet] No active wallet found');
                return 0;
            }

            // Count completed deposits from database that used this wallet
            const Deposit = require('../models/Deposit');
            const depositCount = await Deposit.countDocuments({
                address: wallet.address,
                status: { $in: ['CONFIRMED', 'COMPLETED'] },
                isSystemWallet: true
            });

            console.log(`[System Wallet] Actual deposit count from blockchain: ${depositCount}/40`);

            // Update wallet's deposit count to match reality
            if (wallet.depositCount !== depositCount) {
                wallet.depositCount = depositCount;
                await wallet.save();
                console.log(`[System Wallet] Updated deposit count to match actual: ${depositCount}`);
            }

            return depositCount;

        } catch (error) {
            console.error('[System Wallet] Error getting actual deposit count:', error);
            return 0;
        }
    }

    /**
     * Increment deposit count for system wallet (legacy - kept for compatibility)
     * Now just syncs with actual blockchain count
     * @param {Number} amount - Deposit amount
     */
    async incrementDepositCount(amount) {
        try {
            // Just sync with actual count instead of manually incrementing
            const actualCount = await this.getActualDepositCount();
            
            console.log(`[System Wallet] Synced deposit count: ${actualCount}/40`);

            // Check if rotation is needed
            if (actualCount >= this.DEPOSITS_PER_WALLET) {
                console.log(`[System Wallet] ⚠️ Wallet reached 40 deposits. Rotation needed.`);
            }

        } catch (error) {
            console.error('[System Wallet] Error syncing deposit count:', error);
        }
    }

    /**
     * Rotate system wallet - sweep to main wallet and recover TRX to fuel wallet
     * Triggered when depositCount reaches 40
     */
    async rotateWallet() {
        try {
            const wallet = await SystemWallet.getActiveWallet();
            
            if (!wallet) {
                console.log('[System Wallet] No active wallet to rotate');
                return;
            }

            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🔄 SYSTEM WALLET ROTATION STARTED`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Wallet: ${wallet.address}`);
            console.log(`Deposits: ${wallet.depositCount}`);
            console.log(`Total Received: $${wallet.totalReceived.toFixed(2)}`);

            // Mark wallet as rotating
            wallet.status = 'ROTATING';
            await wallet.save();

            // Get balances
            const usdtBalance = await this.getWalletBalance(wallet.address);
            const trxBalance = await this.getTrxBalance(wallet.address);
            
            console.log(`\n📊 Current Balances:`);
            console.log(`   USDT: ${usdtBalance.toFixed(6)}`);
            console.log(`   TRX: ${trxBalance.toFixed(6)}`);

            // Get settings
            const settings = await AdminSettings.getCurrentSettings();
            const mainWalletAddress = settings.mainWalletAddress || process.env.MAIN_WALLET_ADDRESS;

            let sweepTxHash = null;
            let trxRecoveryTxHash = null;

            // Step 1: Sweep USDT to main wallet
            if (usdtBalance > 0.01) { // Min 0.01 USDT
                console.log(`\n💰 Sweeping ${usdtBalance.toFixed(6)} USDT to main wallet...`);
                try {
                    sweepTxHash = await this.transferUSDTToMainWallet(
                        wallet.address,
                        wallet.privateKey,
                        mainWalletAddress,
                        usdtBalance
                    );
                    console.log(`   ✅ USDT Sweep TX: ${sweepTxHash}`);
                } catch (error) {
                    console.error(`   ❌ USDT sweep failed:`, error.message);
                }
            } else {
                console.log(`\n⏭️  Skipping USDT sweep (balance too low)`);
            }

            // Step 2: Recover TRX to fuel wallet
            if (trxBalance > 1) { // Keep 0.5 TRX for potential final transactions
                const trxToRecover = trxBalance - 0.5;
                console.log(`\n⚡ Recovering ${trxToRecover.toFixed(6)} TRX to fuel wallet...`);
                try {
                    trxRecoveryTxHash = await this.transferTrxToFuelWallet(
                        wallet.address,
                        wallet.privateKey,
                        trxToRecover
                    );
                    console.log(`   ✅ TRX Recovery TX: ${trxRecoveryTxHash}`);
                } catch (error) {
                    console.error(`   ❌ TRX recovery failed:`, error.message);
                }
            } else {
                console.log(`\n⏭️  Skipping TRX recovery (balance too low)`);
            }

            // Step 3: Mark wallet as retired
            await wallet.retire({
                usdt: usdtBalance,
                trx: trxBalance,
                sweepTxHash,
                trxRecoveryTxHash
            });

            console.log(`\n✅ Wallet retired successfully`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        } catch (error) {
            console.error('[System Wallet] Error rotating wallet:', error);
            throw error;
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
            console.error('[System Wallet] Error getting USDT balance:', error);
            return 0;
        }
    }

    /**
     * Get TRX balance of a wallet
     * @param {String} address - Wallet address
     * @returns {Number} - TRX balance
     */
    async getTrxBalance(address) {
        try {
            const balance = await this.tronWeb.trx.getBalance(address);
            return parseFloat(this.tronWeb.fromSun(balance));
        } catch (error) {
            console.error('[System Wallet] Error getting TRX balance:', error);
            return 0;
        }
    }

    /**
     * Transfer USDT from system wallet to main wallet
     * @param {String} fromAddress - Source address
     * @param {String} privateKey - Private key of source
     * @param {String} toAddress - Destination address (main wallet)
     * @param {Number} amount - Amount in USDT
     * @returns {String} - Transaction hash
     */
    async transferUSDTToMainWallet(fromAddress, privateKey, toAddress, amount) {
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

            console.log(`[System Wallet] USDT transfer successful: ${transaction}`);
            
            return transaction;

        } catch (error) {
            console.error('[System Wallet] USDT transfer error:', error);
            throw error;
        }
    }

    /**
     * Transfer TRX from system wallet to fuel wallet
     * @param {String} fromAddress - Source address
     * @param {String} privateKey - Private key of source
     * @param {Number} amount - Amount in TRX
     * @returns {String} - Transaction hash
     */
    async transferTrxToFuelWallet(fromAddress, privateKey, amount) {
        try {
            // Set private key for signing
            this.tronWeb.setPrivateKey(privateKey);
            
            // Convert TRX to SUN
            const amountInSun = this.tronWeb.toSun(amount);
            
            // Send TRX transaction
            const transaction = await this.tronWeb.trx.sendTransaction(
                this.FUEL_WALLET_ADDRESS,
                amountInSun,
                { privateKey }
            );

            console.log(`[System Wallet] TRX transfer successful: ${transaction.txid || transaction}`);
            
            return transaction.txid || transaction;

        } catch (error) {
            console.error('[System Wallet] TRX transfer error:', error);
            throw error;
        }
    }

    /**
     * Get active system wallet info
     * @returns {Object} - Wallet information
     */
    async getActiveWalletInfo() {
        try {
            const wallet = await SystemWallet.getActiveWallet();
            
            if (!wallet) {
                return null;
            }

            const usdtBalance = await this.getWalletBalance(wallet.address);
            const trxBalance = await this.getTrxBalance(wallet.address);

            return {
                address: wallet.address,
                depositCount: wallet.depositCount,
                totalReceived: wallet.totalReceived,
                currentUsdtBalance: usdtBalance,
                currentTrxBalance: trxBalance,
                isActive: wallet.status === 'ACTIVE',
                createdAt: wallet.createdAt,
                canAcceptMore: wallet.depositCount < this.DEPOSITS_PER_WALLET,
                depositsRemaining: this.DEPOSITS_PER_WALLET - wallet.depositCount,
                isSystemWallet: true
            };

        } catch (error) {
            console.error('[System Wallet] Error getting wallet info:', error);
            return null;
        }
    }

    /**
     * Check if system wallet needs rotation
     * @returns {Boolean} - True if rotation needed
     */
    async needsRotation() {
        try {
            return await SystemWallet.needsRotation();
        } catch (error) {
            console.error('[System Wallet] Error checking rotation:', error);
            return false;
        }
    }

    /**
     * Get all retired wallets (history)
     * @returns {Array} - List of retired wallets
     */
    async getRetiredWallets() {
        try {
            return await SystemWallet.find({ status: 'RETIRED' })
                .sort({ rotatedAt: -1 })
                .limit(50);
        } catch (error) {
            console.error('[System Wallet] Error getting retired wallets:', error);
            return [];
        }
    }
}

module.exports = ReusableWalletService;
