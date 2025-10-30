const Deposit = require('../models/Deposit');
const EnhancedHDWalletService = require('./EnhancedHDWalletService');
const GasFeeCalculatorService = require('./GasFeeCalculatorService');
const AutoFundTransferService = require('./AutoFundTransferService');
const USDTSweepService = require('./USDTSweepService');

class CompleteAutoSweepService {
    constructor() {
        this.hdWalletService = new EnhancedHDWalletService();
        this.gasFeeCalculator = new GasFeeCalculatorService();
        this.autoFundTransfer = new AutoFundTransferService();
        this.usdtSweepService = new USDTSweepService();
        
        this.isRunning = false;
        this.checkInterval = (process.env.AUTO_SWEEP_CHECK_INTERVAL || 30) * 1000; // Default 30 seconds
        this.maxRetryAttempts = parseInt(process.env.AUTO_SWEEP_MAX_RETRY_ATTEMPTS) || 3;
    }

    /**
     * Start the auto-sweep monitoring service
     */
    start() {
        if (this.isRunning) {
            console.log('🔄 Auto-sweep service is already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Starting Complete Auto-Sweep Service...');
        console.log(`⏰ Check interval: ${this.checkInterval / 1000} seconds`);
        
        // Immediate check
        this.processAutoSweep();
        
        // Set up recurring checks
        this.intervalId = setInterval(() => {
            this.processAutoSweep();
        }, this.checkInterval);
    }

    /**
     * Stop the auto-sweep monitoring service
     */
    stop() {
        if (!this.isRunning) {
            console.log('🛑 Auto-sweep service is not running');
            return;
        }

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        console.log('🛑 Auto-sweep service stopped');
    }

    /**
     * Process auto-sweep for all eligible deposits
     */
    async processAutoSweep() {
        try {
            console.log('\n🔍 Checking for deposits requiring auto-sweep...');
            
            // Find deposits that need processing
            const depositsToProcess = await this.findDepositsForAutoSweep();
            
            if (depositsToProcess.length === 0) {
                console.log('✅ No deposits require auto-sweep processing');
                return;
            }

            console.log(`📋 Found ${depositsToProcess.length} deposits to process`);

            // Process each deposit
            for (const deposit of depositsToProcess) {
                await this.processSingleDeposit(deposit);
                // Small delay between deposits
                await this.sleep(2000);
            }

        } catch (error) {
            console.error('❌ Error in auto-sweep process:', error.message);
        }
    }

    /**
     * Find deposits that need auto-sweep processing
     * @returns {Array} Deposits ready for processing
     */
    async findDepositsForAutoSweep() {
        try {
            // Find confirmed deposits that haven't been swept yet
            const deposits = await Deposit.find({
                status: 'CONFIRMED',
                sweepStatus: { $in: ['NONE', 'FAILED'] },
                sweepAttempts: { $lt: this.maxRetryAttempts },
                actualAmount: { $gt: 0 },
                autoSweepProcessed: { $ne: true }
            }).sort({ processedAt: 1 });

            // Check each deposit for USDT balance
            const eligibleDeposits = [];
            for (const deposit of deposits) {
                const usdtCheck = await this.usdtSweepService.checkUSDTBalance(deposit.address);
                if (usdtCheck.hasUsdt && usdtCheck.amount > 0) {
                    eligibleDeposits.push(deposit);
                }
            }

            return eligibleDeposits;
        } catch (error) {
            console.error('❌ Error finding deposits for auto-sweep:', error.message);
            return [];
        }
    }

    /**
     * Process a single deposit through the complete auto-sweep workflow
     * @param {Object} deposit - Deposit document
     */
    async processSingleDeposit(deposit) {
        console.log(`\n🔄 Processing deposit ${deposit._id} (${deposit.address})`);
        
        try {
            // Update sweep status
            await this.updateDepositSweepStatus(deposit._id, 'GAS_CALCULATING');
            
            // Step 1: Decrypt private key first (needed for balance checking)
            if (!deposit.walletPrivateKey) {
                throw new Error('Wallet private key not found in deposit record');
            }

            let privateKey;
            try {
                privateKey = this.hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
            } catch (decryptError) {
                // If decryption fails, assume it's already plain text (for migration)
                privateKey = deposit.walletPrivateKey;
            }

            // Step 2: Get wallet balances using private key for accurate USDT reading
            const balances = await this.usdtSweepService.getWalletBalances(deposit.address, privateKey);
            console.log(`💰 Current balances - TRX: ${balances.trx}, USDT: ${balances.usdt}`);
            
            if (balances.usdt <= 0) {
                console.log(`⚠️ No USDT to sweep in ${deposit.address}`);
                await this.updateDepositSweepStatus(deposit._id, 'NONE', 'No USDT to sweep');
                return;
            }

            // Step 2: Calculate gas fees needed
            const gasCalculation = await this.gasFeeCalculator.calculateSweepGasFees(
                deposit.address,
                this.usdtSweepService.mainWalletAddress,
                balances.usdt
            );

            console.log(`⛽ Gas calculation:`, gasCalculation);
            
            // Update deposit with gas fee calculation
            await Deposit.findByIdAndUpdate(deposit._id, {
                gasFeesCalculated: gasCalculation.trxNeeded,
                sweepStatus: 'GAS_SENDING'
            });

            // Step 3: Send gas fees if needed
            if (gasCalculation.trxToSend > 0) {
                console.log(`💸 Sending ${gasCalculation.trxToSend} TRX for gas fees...`);
                
                const gasTransferResult = await this.autoFundTransfer.sendGasFees(
                    deposit.address,
                    gasCalculation.trxToSend,
                    `Gas fees for USDT sweep - ${balances.usdt} USDT`
                );

                if (!gasTransferResult.success) {
                    throw new Error(`Gas transfer failed: ${gasTransferResult.error}`);
                }

                // Update deposit with gas transfer info
                await Deposit.findByIdAndUpdate(deposit._id, {
                    gasFeesSent: gasCalculation.trxToSend,
                    gasTxHash: gasTransferResult.txid,
                    sweepStatus: 'GAS_SENT'
                });

                console.log(`✅ Gas fees sent: ${gasTransferResult.txid}`);
                
                // Wait for gas transfer to confirm
                await this.sleep(5000);
            } else {
                console.log(`✅ Sufficient TRX already available for sweep`);
                await this.updateDepositSweepStatus(deposit._id, 'GAS_SENT');
            }

            // Step 4: Sweep USDT using the already decrypted private key
            console.log(`🔄 Starting USDT sweep...`);
            await this.updateDepositSweepStatus(deposit._id, 'SWEEPING');

            const sweepResult = await this.usdtSweepService.sweepUSDT(
                deposit.address,
                privateKey,
                balances.usdt
            );

            if (sweepResult.success) {
                console.log(`✅ USDT sweep successful: ${sweepResult.txid}`);
                
                // Update deposit with successful sweep
                await Deposit.findByIdAndUpdate(deposit._id, {
                    sweepTransactionHash: sweepResult.txid,
                    sweepStatus: 'SWEPT',
                    processedAt: new Date(),
                    lastSweepAttempt: new Date()
                });
                
                // ✅ Step 5: Recover remaining TRX back to fuel wallet
                console.log(`🔄 Checking for remaining TRX to recover...`);
                await this.sleep(3000); // Wait for sweep to confirm
                
                try {
                    const remainingTrxBalance = await this.gasFeeCalculator.getTrxBalance(deposit.address);
                    
                    if (remainingTrxBalance > 0.5) { // Only recover if more than 0.5 TRX (to cover transaction fee)
                        console.log(`💰 Found ${remainingTrxBalance} TRX remaining, recovering to fuel wallet...`);
                        
                        const tronWeb = this.usdtSweepService.tronWeb;
                        tronWeb.setPrivateKey(privateKey);
                        
                        // Calculate how much to send (leave 0.1 TRX for the transaction fee)
                        const amountToRecover = Math.max(0, remainingTrxBalance - 0.1);
                        const amountInSun = Math.floor(tronWeb.toSun(amountToRecover)); // Ensure integer
                        
                        console.log(`💸 Recovering ${amountToRecover} TRX (${amountInSun} SUN) to fuel wallet: ${this.autoFundTransfer.fuelWalletAddress}`);
                        
                        const recoverTx = await tronWeb.trx.sendTransaction(
                            this.autoFundTransfer.fuelWalletAddress,
                            amountInSun
                        );
                        
                        if (recoverTx.result || recoverTx.txid) {
                            console.log(`✅ TRX recovery successful: ${recoverTx.txid}`);
                            console.log(`💸 Recovered ${amountToRecover} TRX to fuel wallet`);
                        } else {
                            console.log(`⚠️ TRX recovery transaction unclear: ${recoverTx.txid || 'No txid'}`);
                        }
                        
                        // Update deposit with recovery info
                        await Deposit.findByIdAndUpdate(deposit._id, {
                            trxRecoveryTxHash: recoverTx.txid,
                            trxRecovered: amountToRecover
                        });
                    } else {
                        console.log(`ℹ️ Only ${remainingTrxBalance} TRX remaining (below 0.5 TRX threshold), skipping recovery`);
                    }
                } catch (recoveryError) {
                    console.error(`⚠️ TRX recovery failed (non-critical): ${recoveryError.message}`);
                    // Don't throw - recovery failure shouldn't fail the whole sweep
                }
                
                // ✅ Update deposit status to COMPLETED
                await Deposit.findByIdAndUpdate(deposit._id, {
                    status: 'COMPLETED'
                });
                
                // ✅ Increment system wallet deposit count (if using reusable wallet)
                if (deposit.isReusableWallet && deposit.isSystemWallet) {
                    try {
                        const ReusableWalletService = require('./reusableWalletService');
                        const reusableWalletService = new ReusableWalletService();
                        await reusableWalletService.incrementDepositCount(deposit.actualAmount || deposit.expectedAmount);
                        console.log(`📊 System wallet deposit count incremented`);
                    } catch (countError) {
                        console.error(`⚠️ Failed to increment system wallet count:`, countError.message);
                    }
                }
                
                console.log(`🎉 Deposit ${deposit._id} auto-sweep completed successfully!`);
            } else {
                throw new Error(`USDT sweep failed: ${sweepResult.error}`);
            }

        } catch (error) {
            console.error(`❌ Auto-sweep failed for deposit ${deposit._id}:`, error.message);
            
            // Update deposit with failure info
            await Deposit.findByIdAndUpdate(deposit._id, {
                sweepStatus: 'FAILED',
                sweepError: error.message,
                sweepAttempts: (deposit.sweepAttempts || 0) + 1,
                lastSweepAttempt: new Date()
            });
        }
    }

    /**
     * Update deposit sweep status
     * @param {string} depositId - Deposit ID
     * @param {string} status - New status
     * @param {string} error - Error message (optional)
     */
    async updateDepositSweepStatus(depositId, status, error = null) {
        const updateData = { sweepStatus: status };
        if (error) {
            updateData.sweepError = error;
        }
        
        await Deposit.findByIdAndUpdate(depositId, updateData);
    }

    /**
     * Create deposit with enhanced auto-sweep support
     * @param {Object} depositData - Deposit creation data
     * @returns {Object} Created deposit
     */
    async createDepositWithAutoSweep(depositData) {
        try {
            // Generate new wallet for the deposit
            const wallet = this.hdWalletService.createDepositWallet(
                depositData.addressIndex || Date.now()
            );

            // Create emergency backup encryption (using different method for redundancy)
            const emergencyKey = process.env.JWT_SECRET || 'emergency-backup-key';
            const emergencyEncrypted = this.hdWalletService.encryptPrivateKey(wallet.privateKey);

            // Create deposit record with comprehensive wallet backup info
            const deposit = new Deposit({
                ...depositData,
                address: wallet.address,
                walletAddress: wallet.address,
                depositAddress: wallet.address, // ✅ FIXED: Explicitly set depositAddress field
                publicKey: wallet.publicKey,
                derivationPath: wallet.derivationPath,
                addressIndex: wallet.addressIndex,
                walletPrivateKey: wallet.encryptedPrivateKey, // Primary encrypted storage
                emergencyPrivateKey: emergencyEncrypted, // Emergency backup
                walletBackup: {
                    address: wallet.address,
                    publicKey: wallet.publicKey,
                    derivationPath: wallet.derivationPath,
                    createdAt: new Date()
                },
                sweepStatus: 'NONE',
                isHDWallet: true
            });

            await deposit.save();
            
            console.log(`✅ Created deposit with auto-sweep support: ${deposit._id}`);
            console.log(`📍 Deposit address: ${wallet.address}`);
            console.log(`🔐 Stored encrypted private key and emergency backup`);
            console.log(`📋 Wallet backup info: Address=${wallet.address}, PublicKey=${wallet.publicKey.substring(0, 20)}...`);
            
            return deposit;
        } catch (error) {
            throw new Error(`Failed to create deposit with auto-sweep: ${error.message}`);
        }
    }

    /**
     * Get auto-sweep service status
     * @returns {Object} Service status
     */
    async getServiceStatus() {
        try {
            const fuelWalletStatus = await this.autoFundTransfer.getFuelWalletStatus();
            const pendingDeposits = await this.findDepositsForAutoSweep();
            
            return {
                running: this.isRunning,
                checkInterval: this.checkInterval / 1000,
                maxRetryAttempts: this.maxRetryAttempts,
                fuelWallet: fuelWalletStatus,
                pendingDeposits: pendingDeposits.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                running: this.isRunning,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = CompleteAutoSweepService;