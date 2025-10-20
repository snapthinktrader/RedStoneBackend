const Deposit = require('../models/Deposit');
const FundSweepService = require('./FundSweepService');
const cron = require('node-cron');

class AutoSweepService {
    constructor() {
        this.fundSweepService = new FundSweepService();
        this.isRunning = false;
        this.checkInterval = 30; // Check every 30 seconds
        this.processingDeposits = new Set(); // Track deposits being processed
    }

    /**
     * Start the auto-sweep monitoring service
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ Auto-sweep service is already running');
            return;
        }

        console.log('🚀 Starting Auto-Sweep Service...');
        
        // Monitor deposits every 30 seconds
        this.cronJob = cron.schedule(`*/${this.checkInterval} * * * * *`, async () => {
            await this.monitorAndSweepDeposits();
        }, {
            scheduled: false
        });

        this.cronJob.start();
        this.isRunning = true;
        
        console.log(`✅ Auto-sweep service started - monitoring every ${this.checkInterval} seconds`);
    }

    /**
     * Stop the auto-sweep monitoring service
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Auto-sweep service is not running');
            return;
        }

        if (this.cronJob) {
            this.cronJob.stop();
        }
        
        this.isRunning = false;
        console.log('🛑 Auto-sweep service stopped');
    }

    /**
     * Monitor deposits and trigger auto-sweep when funds are detected
     */
    async monitorAndSweepDeposits() {
        try {
            console.log('🔍 Monitoring deposits for auto-sweep...');
            
            // Find all pending deposits that haven't been processed
            const pendingDeposits = await Deposit.find({
                status: { $in: ['PENDING', 'PENDING_CONFIRMATIONS'] },
                isHDWallet: true,
                autoSweepProcessed: { $ne: true }
            }).populate('userId');

            console.log(`📊 Found ${pendingDeposits.length} deposits to monitor`);

            for (const deposit of pendingDeposits) {
                // Skip if already being processed
                if (this.processingDeposits.has(deposit._id.toString())) {
                    continue;
                }

                await this.processDepositForAutoSweep(deposit);
            }

        } catch (error) {
            console.error('❌ Error in auto-sweep monitoring:', error);
        }
    }

    /**
     * Process individual deposit for auto-sweep
     */
    async processDepositForAutoSweep(deposit) {
        const depositId = deposit._id.toString();
        
        try {
            // Mark as being processed
            this.processingDeposits.add(depositId);
            
            console.log(`🔍 Checking deposit ${depositId} - Address: ${deposit.address}`);

            // Check if deposit has received funds
            const hasBalance = await this.checkDepositBalance(deposit);
            
            if (!hasBalance) {
                console.log(`   💤 No funds detected for ${deposit.address}`);
                return;
            }

            console.log(`   💰 Funds detected! Initiating auto-sweep for ${deposit.address}`);

            // Trigger auto-sweep process
            await this.initiateAutoSweep(deposit);

        } catch (error) {
            console.error(`❌ Error processing deposit ${depositId}:`, error);
        } finally {
            // Remove from processing set
            this.processingDeposits.delete(depositId);
        }
    }

    /**
     * Check if deposit wallet has received funds
     */
    async checkDepositBalance(deposit) {
        try {
            const TronWebModule = require('tronweb');
            const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
            
            const tronWeb = new TronWeb({
                fullHost: process.env.TRON_NETWORK === 'testnet' 
                    ? 'https://api.shasta.trongrid.io' 
                    : 'https://api.trongrid.io'
            });

            // Check TRX balance
            const trxBalance = await tronWeb.trx.getBalance(deposit.address);
            
            if (trxBalance > 0) {
                console.log(`   📈 TRX Balance: ${tronWeb.fromSun(trxBalance)} TRX`);
                return true;
            }

            // Check USDT balance (TRC-20)
            const usdtContract = process.env.TRON_NETWORK === 'testnet' 
                ? 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs' // Testnet USDT
                : 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Mainnet USDT

            try {
                const contract = await tronWeb.contract().at(usdtContract);
                const usdtBalance = await contract.balanceOf(deposit.address).call();
                
                if (usdtBalance > 0) {
                    console.log(`   📈 USDT Balance: ${tronWeb.fromSun(usdtBalance)} USDT`);
                    return true;
                }
            } catch (usdtError) {
                console.log(`   ⚠️ Could not check USDT balance: ${usdtError.message}`);
            }

            return false;

        } catch (error) {
            console.error(`❌ Error checking balance for ${deposit.address}:`, error);
            return false;
        }
    }

    /**
     * Initiate the complete auto-sweep process
     */
    async initiateAutoSweep(deposit) {
        try {
            console.log(`🔄 Starting auto-sweep for deposit ${deposit._id}`);
            
            // Step 1: Check what type of funds are in the wallet
            const fundType = await this.detectFundType(deposit);
            
            if (fundType === 'USDT') {
                console.log('   💎 USDT detected - initiating two-step sweep');
                await this.performUSDTAutoSweep(deposit);
            } else if (fundType === 'TRX') {
                console.log('   ⚡ TRX detected - initiating direct sweep');
                await this.performTRXAutoSweep(deposit);
            } else {
                console.log('   ❓ Unknown fund type detected');
                return;
            }

            // Mark deposit as auto-sweep processed
            await Deposit.findByIdAndUpdate(deposit._id, {
                autoSweepProcessed: true,
                autoSweepProcessedAt: new Date(),
                status: 'COMPLETED'
            });

            console.log(`✅ Auto-sweep completed for deposit ${deposit._id}`);

        } catch (error) {
            console.error(`❌ Auto-sweep failed for deposit ${deposit._id}:`, error);
            
            // Mark as failed but don't prevent retry
            await Deposit.findByIdAndUpdate(deposit._id, {
                autoSweepAttempts: (deposit.autoSweepAttempts || 0) + 1,
                lastAutoSweepError: error.message,
                lastAutoSweepAttempt: new Date()
            });
        }
    }

    /**
     * Detect what type of funds are in the wallet
     */
    async detectFundType(deposit) {
        try {
            const TronWebModule = require('tronweb');
            const TronWeb = TronWebModule.TronWeb || TronWebModule.default.TronWeb;
            
            const tronWeb = new TronWeb({
                fullHost: process.env.TRON_NETWORK === 'testnet' 
                    ? 'https://api.shasta.trongrid.io' 
                    : 'https://api.trongrid.io'
            });

            // Check USDT first (higher priority)
            const usdtContract = process.env.TRON_NETWORK === 'testnet' 
                ? 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs' 
                : 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

            try {
                const contract = await tronWeb.contract().at(usdtContract);
                const usdtBalance = await contract.balanceOf(deposit.address).call();
                
                if (usdtBalance > 0) {
                    return 'USDT';
                }
            } catch (usdtError) {
                console.log(`   ⚠️ USDT check failed: ${usdtError.message}`);
            }

            // Check TRX
            const trxBalance = await tronWeb.trx.getBalance(deposit.address);
            if (trxBalance > 0) {
                return 'TRX';
            }

            return 'NONE';

        } catch (error) {
            console.error(`❌ Error detecting fund type:`, error);
            return 'ERROR';
        }
    }

    /**
     * Perform USDT auto-sweep (two-step process)
     */
    async performUSDTAutoSweep(deposit) {
        try {
            console.log('   🔄 Step 1: Sending gas fees to deposit wallet...');
            
            // Step 1: Send TRX for gas fees
            const gasResult = await this.fundSweepService.sendGasForSweep(deposit.address);
            
            if (!gasResult.success) {
                throw new Error(`Gas transfer failed: ${gasResult.error}`);
            }
            
            console.log(`   ✅ Gas sent successfully: ${gasResult.txid}`);
            
            // Wait for gas transaction to confirm
            console.log('   ⏳ Waiting for gas transaction confirmation...');
            await this.waitForConfirmation(30000); // Wait 30 seconds
            
            console.log('   🔄 Step 2: Sweeping USDT from deposit wallet...');
            
            // Step 2: Sweep USDT
            const sweepResult = await this.fundSweepService.sweepUSDT(deposit);
            
            if (!sweepResult.success) {
                throw new Error(`USDT sweep failed: ${sweepResult.error}`);
            }
            
            console.log(`   ✅ USDT swept successfully: ${sweepResult.txid}`);
            
            // Update deposit with transaction details
            await Deposit.findByIdAndUpdate(deposit._id, {
                gasTxid: gasResult.txid,
                sweepTxid: sweepResult.txid,
                autoSweepType: 'USDT',
                sweptAmount: sweepResult.amount,
                sweptAt: new Date()
            });

        } catch (error) {
            console.error('❌ USDT auto-sweep failed:', error);
            throw error;
        }
    }

    /**
     * Perform TRX auto-sweep (direct process)
     */
    async performTRXAutoSweep(deposit) {
        try {
            console.log('   🔄 Sweeping TRX from deposit wallet...');
            
            // Direct TRX sweep
            const sweepResult = await this.fundSweepService.sweepTRX(deposit);
            
            if (!sweepResult.success) {
                throw new Error(`TRX sweep failed: ${sweepResult.error}`);
            }
            
            console.log(`   ✅ TRX swept successfully: ${sweepResult.txid}`);
            
            // Update deposit with transaction details
            await Deposit.findByIdAndUpdate(deposit._id, {
                sweepTxid: sweepResult.txid,
                autoSweepType: 'TRX',
                sweptAmount: sweepResult.amount,
                sweptAt: new Date()
            });

        } catch (error) {
            console.error('❌ TRX auto-sweep failed:', error);
            throw error;
        }
    }

    /**
     * Wait for transaction confirmation
     */
    async waitForConfirmation(milliseconds = 30000) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    /**
     * Get auto-sweep service status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            processingCount: this.processingDeposits.size,
            processingDeposits: Array.from(this.processingDeposits)
        };
    }

    /**
     * Manually trigger auto-sweep for specific deposit
     */
    async manualSweep(depositId) {
        try {
            const deposit = await Deposit.findById(depositId).populate('userId');
            
            if (!deposit) {
                return { success: false, error: 'Deposit not found' };
            }

            if (deposit.autoSweepProcessed) {
                return { success: false, error: 'Deposit already processed' };
            }

            await this.processDepositForAutoSweep(deposit);
            
            return { success: true, message: 'Manual sweep initiated' };

        } catch (error) {
            console.error('❌ Manual sweep failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = AutoSweepService;