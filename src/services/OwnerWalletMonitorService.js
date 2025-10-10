const axios = require('axios');
const Deposit = require('../models/Deposit');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

/**
 * Service to monitor the owner's wallet for incoming deposits
 * and match them to specific user deposit requests
 */
class OwnerWalletMonitorService {
    constructor() {
        this.ownerWallet = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
        this.tronApiUrl = 'https://api.trongrid.io';
        this.usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT-TRC20
    }

    /**
     * Monitor owner's wallet for new USDT deposits and match to users
     */
    async monitorOwnerWallet() {
        try {
            console.log(`🔍 Monitoring owner wallet: ${this.ownerWallet}`);
            
            // Get recent USDT transfers to owner's wallet
            const recentTransfers = await this.getRecentUSDTTransfers();
            console.log(`Found ${recentTransfers.length} recent transfers`);
            
            // Get pending deposits from database
            const pendingDeposits = await Deposit.find({ 
                status: 'PENDING',
                walletAddress: this.ownerWallet 
            }).sort({ createdAt: -1 });
            
            console.log(`Found ${pendingDeposits.length} pending deposits`);
            
            const matchedDeposits = [];
            
            // Try to match transfers to pending deposits
            for (const transfer of recentTransfers) {
                const transferAmount = parseFloat(transfer.value) / 1000000; // USDT has 6 decimals
                const transferTime = new Date(transfer.block_timestamp);
                
                console.log(`Processing transfer: ${transferAmount} USDT at ${transferTime}`);
                
                // Find matching pending deposit
                const matchingDeposit = await this.findMatchingDeposit(
                    pendingDeposits, 
                    transferAmount, 
                    transferTime,
                    transfer.transaction_id
                );
                
                if (matchingDeposit) {
                    const confirmed = await this.confirmDeposit(matchingDeposit, transfer);
                    if (confirmed) {
                        matchedDeposits.push({
                            deposit: matchingDeposit,
                            transaction: transfer
                        });
                    }
                }
            }
            
            return {
                success: true,
                totalChecked: recentTransfers.length,
                matchedDeposits: matchedDeposits.length,
                matches: matchedDeposits
            };
            
        } catch (error) {
            console.error('Error monitoring owner wallet:', error);
            throw error;
        }
    }

    /**
     * Get recent USDT transfers to owner's wallet
     */
    async getRecentUSDTTransfers() {
        try {
            // Get TRC20 transfers (USDT) to owner's wallet
            const response = await axios.get(
                `${this.tronApiUrl}/v1/accounts/${this.ownerWallet}/transactions/trc20`,
                {
                    params: {
                        contract_address: this.usdtContract,
                        limit: 50, // Check last 50 transactions
                        order_by: 'block_timestamp,desc'
                    }
                }
            );

            if (!response.data || !response.data.data) {
                return [];
            }

            // Filter only incoming transfers (to our address)
            const incomingTransfers = response.data.data.filter(tx => 
                tx.to === this.ownerWallet && 
                tx.type === 'Transfer' &&
                parseFloat(tx.value) > 0
            );

            return incomingTransfers;
            
        } catch (error) {
            console.error('Error fetching USDT transfers:', error);
            return [];
        }
    }

    /**
     * Find matching deposit request for a transaction
     */
    async findMatchingDeposit(pendingDeposits, transferAmount, transferTime, transactionId) {
        try {
            // Check if this transaction was already processed
            const existingDeposit = await Deposit.findOne({ 
                transactionHash: transactionId 
            });
            
            if (existingDeposit) {
                console.log(`Transaction ${transactionId} already processed`);
                return null;
            }
            
            // Find deposits that match the amount and time criteria
            const potentialMatches = pendingDeposits.filter(deposit => {
                const amountMatch = Math.abs(deposit.amount - transferAmount) < 0.01; // 1 cent tolerance
                const timeDiff = Math.abs(transferTime - deposit.createdAt) / (1000 * 60); // minutes
                const timeMatch = timeDiff <= 60; // Within 1 hour of deposit request
                
                console.log(`Checking deposit ${deposit._id}: amount ${deposit.amount} vs ${transferAmount}, time diff ${timeDiff} min`);
                
                return amountMatch && timeMatch;
            });
            
            if (potentialMatches.length === 0) {
                console.log(`No matching deposit found for ${transferAmount} USDT`);
                return null;
            }
            
            if (potentialMatches.length === 1) {
                console.log(`✅ Perfect match found: ${potentialMatches[0]._id}`);
                return potentialMatches[0];
            }
            
            // Multiple matches - choose the closest by time
            const closestMatch = potentialMatches.reduce((closest, current) => {
                const closestTimeDiff = Math.abs(transferTime - closest.createdAt);
                const currentTimeDiff = Math.abs(transferTime - current.createdAt);
                return currentTimeDiff < closestTimeDiff ? current : closest;
            });
            
            console.log(`✅ Best match found: ${closestMatch._id} (closest by time)`);
            return closestMatch;
            
        } catch (error) {
            console.error('Error finding matching deposit:', error);
            return null;
        }
    }

    /**
     * Confirm a deposit and update user balance
     */
    async confirmDeposit(deposit, transfer) {
        try {
            const transferAmount = parseFloat(transfer.value) / 1000000;
            
            console.log(`🎯 Confirming deposit ${deposit._id} for user ${deposit.userId}`);
            
            // Update deposit record
            deposit.status = 'CONFIRMED';
            deposit.actualAmount = transferAmount;
            deposit.transactionHash = transfer.transaction_id;
            deposit.fromAddress = transfer.from;
            deposit.blockNumber = transfer.block;
            deposit.processedAt = new Date();
            deposit.confirmations = 20; // Assume confirmed on Tron
            
            await deposit.save();
            
            // Update user balance
            const user = await User.findById(deposit.userId);
            if (!user) {
                console.error(`User ${deposit.userId} not found`);
                return false;
            }
            
            user.walletBalance += transferAmount;
            await user.save();
            
            // Create transaction record
            const transaction = new Transaction({
                userId: deposit.userId,
                type: 'DEPOSIT',
                amount: transferAmount,
                status: 'COMPLETED',
                cryptocurrency: 'USDT',
                description: `Deposit of ${transferAmount} USDT`,
                transactionHash: transfer.transaction_id,
                fromAddress: transfer.from,
                toAddress: this.ownerWallet,
                network: 'tron',
                fee: 0,
                metadata: {
                    blockNumber: transfer.block,
                    blockTimestamp: transfer.block_timestamp,
                    confirmations: 20
                }
            });
            
            await transaction.save();
            
            console.log(`✅ Deposit confirmed! User ${user.email} balance: $${user.walletBalance}`);
            
            return true;
            
        } catch (error) {
            console.error('Error confirming deposit:', error);
            return false;
        }
    }

    /**
     * Run monitoring with detailed logging
     */
    async runDetailedMonitoring() {
        try {
            console.log('='.repeat(50));
            console.log('🚀 Starting Owner Wallet Monitoring');
            console.log(`📍 Wallet Address: ${this.ownerWallet}`);
            console.log(`⏰ Time: ${new Date().toISOString()}`);
            console.log('='.repeat(50));
            
            const result = await this.monitorOwnerWallet();
            
            console.log('📊 MONITORING RESULTS:');
            console.log(`   Transactions Checked: ${result.totalChecked}`);
            console.log(`   Deposits Matched: ${result.matchedDeposits}`);
            console.log('='.repeat(50));
            
            if (result.matches.length > 0) {
                console.log('🎉 SUCCESSFUL MATCHES:');
                result.matches.forEach((match, index) => {
                    console.log(`   ${index + 1}. User: ${match.deposit.userId}`);
                    console.log(`      Amount: $${match.deposit.actualAmount}`);
                    console.log(`      TX: ${match.transaction.transaction_id.substring(0, 10)}...`);
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Monitoring failed:', error);
            throw error;
        }
    }
}

module.exports = OwnerWalletMonitorService;