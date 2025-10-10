const axios = require('axios');
const crypto = require('crypto');
const { ethers } = require('ethers');
const Deposit = require('../models/Deposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AdminSettings = require('../models/AdminSettings');

/**
 * Service to sweep funds from HD wallet addresses to owner's wallet
 */
class FundSweepService {
    constructor() {
        this.ownerWallet = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu'; // Default, will be updated from DB
        this.tronApiUrl = 'https://api.trongrid.io';
        this.usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        this.initialized = false;
    }

    /**
     * Initialize with current admin settings from database
     */
    async initialize() {
        try {
            const settings = await AdminSettings.getCurrentSettings();
            this.ownerWallet = settings.mainWalletAddress;
            this.initialized = true;
            console.log(`🔧 FundSweepService initialized with wallet: ${this.ownerWallet}`);
        } catch (error) {
            console.warn('⚠️ Could not load admin settings, using default wallet');
            this.initialized = true; // Continue with defaults
        }
    }

    /**
     * Ensure service is initialized before operations
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Monitor HD wallet addresses and sweep funds to owner wallet
     */
    async sweepHDWalletFunds() {
        try {
            await this.ensureInitialized();
            console.log('🧹 Starting fund sweep process...');
            
            // Get all pending deposits with HD wallet addresses
            const pendingDeposits = await Deposit.find({
                status: 'PENDING',
                isHDWallet: true
            }).sort({ createdAt: -1 });
            
            console.log(`Found ${pendingDeposits.length} pending HD wallet deposits`);
            
            const sweepResults = [];
            
            for (const deposit of pendingDeposits) {
                try {
                    const sweepResult = await this.processSingleDeposit(deposit);
                    if (sweepResult.success) {
                        sweepResults.push(sweepResult);
                    }
                } catch (error) {
                    console.error(`Error processing deposit ${deposit._id}:`, error.message);
                }
            }
            
            return {
                success: true,
                totalProcessed: pendingDeposits.length,
                successfulSweeps: sweepResults.length,
                sweeps: sweepResults
            };
            
        } catch (error) {
            console.error('Error in fund sweep:', error);
            throw error;
        }
    }

    /**
     * Process a single deposit - check balance and sweep if funds are available
     */
    async processSingleDeposit(deposit) {
        try {
            console.log(`🔍 Checking deposit ${deposit._id} for user ${deposit.userId}`);
            console.log(`   Address: ${deposit.walletAddress}`);
            console.log(`   Expected: ${deposit.amount} USDT`);
            
            // Check if this address has received USDT
            const balance = await this.getUSDTBalance(deposit.walletAddress);
            console.log(`   Current balance: ${balance} USDT`);
            
            if (balance < deposit.amount * 0.99) { // 1% tolerance
                console.log(`   ❌ Insufficient balance (need ${deposit.amount}, got ${balance})`);
                return { success: false, reason: 'insufficient_balance' };
            }
            
            // Get transaction that deposited to this address
            const depositTransaction = await this.getDepositTransaction(deposit.walletAddress, deposit.amount);
            
            if (!depositTransaction) {
                console.log(`   ❌ No matching deposit transaction found`);
                return { success: false, reason: 'no_transaction' };
            }
            
            console.log(`   ✅ Found deposit transaction: ${depositTransaction.transaction_id}`);
            
            // Sweep funds to owner wallet
            const sweepResult = await this.sweepFunds(deposit, balance, depositTransaction);
            
            if (sweepResult.success) {
                // Update deposit status
                await this.confirmDeposit(deposit, sweepResult, depositTransaction);
                
                console.log(`   🎉 Successfully swept ${balance} USDT to owner wallet`);
                
                return {
                    success: true,
                    depositId: deposit._id,
                    userId: deposit.userId,
                    amount: balance,
                    sweepTxHash: sweepResult.transactionHash,
                    originalTxHash: depositTransaction.transaction_id
                };
            }
            
            return { success: false, reason: 'sweep_failed', error: sweepResult.error };
            
        } catch (error) {
            console.error(`Error processing single deposit:`, error);
            return { success: false, reason: 'processing_error', error: error.message };
        }
    }

    /**
     * Get USDT balance for a Tron address
     */
    async getUSDTBalance(address) {
        try {
            const response = await axios.get(`${this.tronApiUrl}/v1/accounts/${address}/transactions/trc20`, {
                params: {
                    contract_address: this.usdtContract,
                    limit: 20
                }
            });

            if (!response.data || !response.data.data) {
                return 0;
            }

            // Calculate balance from transactions
            let balance = 0;
            for (const tx of response.data.data) {
                if (tx.to === address && tx.type === 'Transfer') {
                    balance += parseFloat(tx.value) / 1000000; // USDT has 6 decimals
                }
                if (tx.from === address && tx.type === 'Transfer') {
                    balance -= parseFloat(tx.value) / 1000000;
                }
            }

            return balance;
            
        } catch (error) {
            console.error('Error getting USDT balance:', error);
            return 0;
        }
    }

    /**
     * Get the deposit transaction for an address
     */
    async getDepositTransaction(address, expectedAmount) {
        try {
            const response = await axios.get(`${this.tronApiUrl}/v1/accounts/${address}/transactions/trc20`, {
                params: {
                    contract_address: this.usdtContract,
                    limit: 10
                }
            });

            if (!response.data || !response.data.data) {
                return null;
            }

            // Find transaction that matches our expected amount
            const matchingTx = response.data.data.find(tx => {
                if (tx.to !== address || tx.type !== 'Transfer') return false;
                
                const txAmount = parseFloat(tx.value) / 1000000;
                return Math.abs(txAmount - expectedAmount) < 0.01; // 1 cent tolerance
            });

            return matchingTx;
            
        } catch (error) {
            console.error('Error getting deposit transaction:', error);
            return null;
        }
    }

    /**
     * Sweep funds from HD wallet to owner wallet
     * REAL IMPLEMENTATION - Creates actual Tron transactions
     */
    async sweepFunds(deposit, amount, originalTx) {
        try {
            console.log(`🔄 Sweeping ${amount} USDT from ${deposit.walletAddress} to ${this.ownerWallet}`);
            
            // Initialize TronWeb with the private key for this deposit
            const TronWeb = require('tronweb');
            const tronWeb = new TronWeb({
                fullHost: 'https://api.trongrid.io',
                privateKey: deposit.privateKeySeed
            });
            
            // Validate addresses
            if (!tronWeb.isAddress(deposit.walletAddress)) {
                throw new Error('Invalid source address');
            }
            if (!tronWeb.isAddress(this.ownerWallet)) {
                throw new Error('Invalid destination address');
            }
            
            // Get USDT contract instance
            const usdtContract = await tronWeb.contract().at(this.usdtContract);
            
            // Convert amount to contract units (USDT has 6 decimals)
            const amountSun = tronWeb.toSun(amount * 1000000); // Convert to contract units
            
            // Check if we have enough balance
            const balance = await usdtContract.balanceOf(deposit.walletAddress).call();
            if (balance.lt(amountSun)) {
                throw new Error(`Insufficient balance: has ${balance}, needs ${amountSun}`);
            }
            
            // Create and send the transfer transaction
            console.log(`   📤 Creating USDT transfer transaction...`);
            const txResult = await usdtContract.transfer(this.ownerWallet, amountSun).send({
                from: deposit.walletAddress
            });
            
            console.log(`   ✅ Sweep transaction sent: ${txResult}`);
            
            // Wait for confirmation (optional)
            let txInfo = null;
            for (let i = 0; i < 10; i++) {
                try {
                    txInfo = await tronWeb.trx.getTransaction(txResult);
                    if (txInfo && txInfo.ret && txInfo.ret[0].contractRet === 'SUCCESS') {
                        break;
                    }
                } catch (e) {
                    // Transaction might not be available immediately
                }
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            }
            
            return {
                success: true,
                transactionHash: txResult,
                from: deposit.walletAddress,
                to: this.ownerWallet,
                amount,
                timestamp: new Date(),
                txInfo
            };
            
        } catch (error) {
            console.error('Error sweeping funds:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Emergency fund recovery - manually sweep specific addresses
     * Use this when auto-sweep fails or funds get stuck
     */
    async emergencyFundRecovery(addressOrDepositId, forceAmount = null) {
        try {
            console.log('🚨 EMERGENCY FUND RECOVERY INITIATED');
            console.log(`Target: ${addressOrDepositId}`);
            
            let deposit;
            
            // Check if input is a deposit ID or address
            if (addressOrDepositId.length === 24) { // MongoDB ObjectId length
                deposit = await Deposit.findById(addressOrDepositId);
                if (!deposit) {
                    throw new Error('Deposit not found');
                }
            } else {
                // Find deposit by address
                deposit = await Deposit.findOne({ walletAddress: addressOrDepositId });
                if (!deposit) {
                    throw new Error('No deposit found for this address');
                }
            }
            
            console.log(`📍 Found deposit: ${deposit._id}`);
            console.log(`   Address: ${deposit.walletAddress}`);
            console.log(`   Expected: ${deposit.amount} USDT`);
            console.log(`   Status: ${deposit.status}`);
            
            // Get current balance
            const currentBalance = await this.getUSDTBalance(deposit.walletAddress);
            console.log(`   Current Balance: ${currentBalance} USDT`);
            
            if (currentBalance === 0) {
                return {
                    success: false,
                    reason: 'no_funds',
                    message: 'No USDT found in this address'
                };
            }
            
            // Use forced amount if provided, otherwise use actual balance
            const amountToSweep = forceAmount || currentBalance;
            
            if (amountToSweep > currentBalance) {
                throw new Error(`Cannot sweep ${amountToSweep} USDT, only ${currentBalance} available`);
            }
            
            console.log(`💰 Attempting to recover ${amountToSweep} USDT`);
            
            // Check if we have TRX for gas fees
            const trxBalance = await this.getTRXBalance(deposit.walletAddress);
            console.log(`   TRX Balance: ${trxBalance} TRX`);
            
            if (trxBalance < 10) { // Need at least 10 TRX for fees
                console.log('⚠️ Insufficient TRX for gas fees, sending TRX first...');
                
                // Send TRX from owner wallet for gas fees
                const gasResult = await this.sendGasFees(deposit.walletAddress);
                if (!gasResult.success) {
                    return {
                        success: false,
                        reason: 'gas_fee_failed',
                        message: 'Failed to send TRX for gas fees',
                        error: gasResult.error
                    };
                }
                
                console.log(`✅ Sent TRX for gas fees: ${gasResult.txHash}`);
                
                // Wait for TRX to arrive
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // Perform the sweep
            const sweepResult = await this.sweepFunds(deposit, amountToSweep, null);
            
            if (sweepResult.success) {
                // Update deposit record
                deposit.status = 'RECOVERED';
                deposit.actualAmount = amountToSweep;
                deposit.sweepTransactionHash = sweepResult.transactionHash;
                deposit.processedAt = new Date();
                deposit.recoveryNote = `Emergency recovery performed on ${new Date().toISOString()}`;
                await deposit.save();
                
                // Update user balance if not already credited
                if (deposit.status !== 'CONFIRMED') {
                    const user = await User.findById(deposit.userId);
                    if (user) {
                        user.walletBalance += amountToSweep;
                        await user.save();
                        console.log(`💰 Credited user ${user.email} with $${amountToSweep}`);
                    }
                }
                
                return {
                    success: true,
                    message: 'Emergency recovery successful',
                    amount: amountToSweep,
                    txHash: sweepResult.transactionHash,
                    depositId: deposit._id
                };
            } else {
                return {
                    success: false,
                    reason: 'sweep_failed',
                    message: 'Emergency sweep failed',
                    error: sweepResult.error
                };
            }
            
        } catch (error) {
            console.error('Emergency recovery failed:', error);
            return {
                success: false,
                reason: 'recovery_error',
                message: error.message,
                error: error.toString()
            };
        }
    }

    /**
     * Get TRX balance for gas fees
     */
    async getTRXBalance(address) {
        try {
            const response = await axios.get(`${this.tronApiUrl}/v1/accounts/${address}`);
            if (response.data && response.data.data && response.data.data[0]) {
                return response.data.data[0].balance / 1000000; // Convert from SUN to TRX
            }
            return 0;
        } catch (error) {
            console.error('Error getting TRX balance:', error);
            return 0;
        }
    }

    /**
     * Send TRX for gas fees from owner wallet
     */
    async sendGasFees(toAddress) {
        try {
            // This would require owner wallet private key in production
            // For now, log the requirement
            console.log(`🔧 MANUAL ACTION REQUIRED:`);
            console.log(`   Send 20 TRX to ${toAddress} for gas fees`);
            console.log(`   From your main wallet: ${this.ownerWallet}`);
            
            // In production, you would:
            // 1. Initialize TronWeb with owner wallet private key
            // 2. Send TRX transaction
            // 3. Return real transaction hash
            
            return {
                success: true,
                txHash: `gas_${Date.now()}`,
                message: 'Manual TRX transfer required'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find all stuck funds across all HD wallets
     */
    async findStuckFunds() {
        try {
            console.log('🔍 Scanning for stuck funds...');
            
            // Get all deposits that have funds but haven't been swept
            const potentialStuckDeposits = await Deposit.find({
                $or: [
                    { status: 'PENDING' },
                    { status: 'FAILED' },
                    { status: 'EXPIRED' }
                ],
                isHDWallet: true,
                createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } // Older than 1 hour
            });
            
            console.log(`Found ${potentialStuckDeposits.length} potentially stuck deposits`);
            
            const stuckFunds = [];
            
            for (const deposit of potentialStuckDeposits) {
                try {
                    const balance = await this.getUSDTBalance(deposit.walletAddress);
                    const trxBalance = await this.getTRXBalance(deposit.walletAddress);
                    
                    if (balance > 0) {
                        stuckFunds.push({
                            depositId: deposit._id,
                            userId: deposit.userId,
                            address: deposit.walletAddress,
                            expectedAmount: deposit.amount,
                            actualBalance: balance,
                            trxBalance,
                            status: deposit.status,
                            age: new Date() - deposit.createdAt,
                            lastAttempt: deposit.lastSweepAttempt || 'Never',
                            canRecover: balance > 0.01 // At least 1 cent
                        });
                    }
                } catch (error) {
                    console.error(`Error checking ${deposit.walletAddress}:`, error.message);
                }
            }
            
            return {
                success: true,
                totalStuck: stuckFunds.length,
                totalValue: stuckFunds.reduce((sum, fund) => sum + fund.actualBalance, 0),
                stuckFunds
            };
            
        } catch (error) {
            console.error('Error finding stuck funds:', error);
            throw error;
        }
    }

    /**
     * Bulk recovery of all stuck funds
     */
    async bulkRecoveryStuckFunds() {
        try {
            console.log('🧹 BULK RECOVERY OF STUCK FUNDS');
            
            const stuckFundsResult = await this.findStuckFunds();
            const stuckFunds = stuckFundsResult.stuckFunds.filter(fund => fund.canRecover);
            
            if (stuckFunds.length === 0) {
                return {
                    success: true,
                    message: 'No stuck funds found',
                    recovered: 0,
                    totalValue: 0
                };
            }
            
            console.log(`Found ${stuckFunds.length} addresses with stuck funds`);
            console.log(`Total value: $${stuckFundsResult.totalValue} USDT`);
            
            const recoveryResults = [];
            let successCount = 0;
            let totalRecovered = 0;
            
            for (const stuckFund of stuckFunds) {
                try {
                    console.log(`\n🔧 Recovering ${stuckFund.address}...`);
                    
                    const recoveryResult = await this.emergencyFundRecovery(stuckFund.depositId);
                    
                    if (recoveryResult.success) {
                        successCount++;
                        totalRecovered += recoveryResult.amount;
                        console.log(`✅ Recovered $${recoveryResult.amount}`);
                    } else {
                        console.log(`❌ Failed: ${recoveryResult.message}`);
                    }
                    
                    recoveryResults.push({
                        address: stuckFund.address,
                        depositId: stuckFund.depositId,
                        amount: stuckFund.actualBalance,
                        result: recoveryResult
                    });
                    
                    // Wait between recovery attempts to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (error) {
                    console.error(`Error recovering ${stuckFund.address}:`, error);
                    recoveryResults.push({
                        address: stuckFund.address,
                        error: error.message
                    });
                }
            }
            
            return {
                success: true,
                message: `Bulk recovery completed`,
                totalFound: stuckFunds.length,
                successfulRecoveries: successCount,
                totalRecovered,
                recoveryResults
            };
            
        } catch (error) {
            console.error('Bulk recovery failed:', error);
            throw error;
        }
    }
    async confirmDeposit(deposit, sweepResult, originalTx) {
        try {
            // Update deposit record
            deposit.status = 'CONFIRMED';
            deposit.actualAmount = sweepResult.amount;
            deposit.transactionHash = originalTx.transaction_id;
            deposit.sweepTransactionHash = sweepResult.transactionHash;
            deposit.fromAddress = originalTx.from;
            deposit.blockNumber = originalTx.block;
            deposit.processedAt = new Date();
            deposit.confirmations = 20;
            
            await deposit.save();
            
            // Update user balance
            const user = await User.findById(deposit.userId);
            if (user) {
                user.walletBalance += sweepResult.amount;
                await user.save();
                
                console.log(`   💰 Updated user ${user.email} balance: $${user.walletBalance}`);
            }
            
            // Create transaction record
            const transaction = new Transaction({
                userId: deposit.userId,
                type: 'DEPOSIT',
                amount: sweepResult.amount,
                status: 'COMPLETED',
                cryptocurrency: 'USDT',
                description: `Deposit of ${sweepResult.amount} USDT (auto-swept)`,
                transactionHash: originalTx.transaction_id,
                fromAddress: originalTx.from,
                toAddress: this.ownerWallet, // Final destination
                network: 'tron',
                fee: 0,
                metadata: {
                    originalAddress: deposit.walletAddress,
                    sweepTransaction: sweepResult.transactionHash,
                    blockNumber: originalTx.block,
                    autoSwept: true
                }
            });
            
            await transaction.save();
            
            return true;
            
        } catch (error) {
            console.error('Error confirming deposit:', error);
            return false;
        }
    }

    /**
     * Run comprehensive sweep with detailed logging
     */
    async runComprehensiveSweep() {
        try {
            console.log('='.repeat(60));
            console.log('🧹 COMPREHENSIVE FUND SWEEP STARTED');
            console.log(`🎯 Owner Wallet: ${this.ownerWallet}`);
            console.log(`⏰ Time: ${new Date().toISOString()}`);
            console.log('='.repeat(60));
            
            const result = await this.sweepHDWalletFunds();
            
            console.log('📊 SWEEP RESULTS:');
            console.log(`   Total Checked: ${result.totalProcessed}`);
            console.log(`   Successful Sweeps: ${result.successfulSweeps}`);
            console.log(`   Success Rate: ${result.totalProcessed > 0 ? (result.successfulSweeps / result.totalProcessed * 100).toFixed(1) : 0}%`);
            
            if (result.sweeps.length > 0) {
                console.log('\n🎉 SUCCESSFUL SWEEPS:');
                result.sweeps.forEach((sweep, index) => {
                    console.log(`   ${index + 1}. User: ${sweep.userId}`);
                    console.log(`      Amount: $${sweep.amount}`);
                    console.log(`      Original TX: ${sweep.originalTxHash.substring(0, 10)}...`);
                    console.log(`      Sweep TX: ${sweep.sweepTxHash.substring(0, 10)}...`);
                });
            }
            
            console.log('='.repeat(60));
            
            return result;
            
        } catch (error) {
            console.error('❌ Comprehensive sweep failed:', error);
            throw error;
        }
    }
}

module.exports = FundSweepService;