const Deposit = require('../models/Deposit');
const EnhancedHDWalletService = require('./EnhancedHDWalletService');

class EmergencyWalletRecoveryService {
    constructor() {
        this.hdWalletService = new EnhancedHDWalletService();
    }

    /**
     * Get all wallet private keys for emergency recovery
     * WARNING: This should only be used in emergency situations
     * @returns {Array} Array of wallet recovery information
     */
    async getAllWalletPrivateKeys() {
        try {
            console.log('🚨 EMERGENCY WALLET RECOVERY INITIATED');
            console.log('⚠️  WARNING: This exposes private keys - use only in emergencies!');
            
            // Get all deposits with wallet information
            const deposits = await Deposit.find({
                walletPrivateKey: { $exists: true, $ne: null }
            }).select('_id address publicKey walletPrivateKey emergencyPrivateKey walletBackup userId amount network status createdAt');

            const walletRecoveryData = [];

            for (const deposit of deposits) {
                try {
                    let privateKey = null;
                    
                    // Try to decrypt the primary private key
                    if (deposit.walletPrivateKey) {
                        try {
                            privateKey = this.hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
                        } catch (error) {
                            console.log(`Failed to decrypt primary key for ${deposit.address}: ${error.message}`);
                        }
                    }

                    // If primary failed, try emergency backup
                    if (!privateKey && deposit.emergencyPrivateKey) {
                        try {
                            privateKey = this.hdWalletService.decryptPrivateKey(deposit.emergencyPrivateKey);
                        } catch (error) {
                            console.log(`Failed to decrypt emergency key for ${deposit.address}: ${error.message}`);
                        }
                    }

                    walletRecoveryData.push({
                        depositId: deposit._id.toString(),
                        address: deposit.address,
                        publicKey: deposit.publicKey,
                        privateKey: privateKey, // SENSITIVE: Only for emergency use
                        network: deposit.network,
                        amount: deposit.amount,
                        status: deposit.status,
                        userId: deposit.userId,
                        createdAt: deposit.createdAt,
                        walletBackup: deposit.walletBackup,
                        hasPrivateKey: !!privateKey,
                        recoveryStatus: privateKey ? 'RECOVERABLE' : 'FAILED'
                    });
                } catch (error) {
                    walletRecoveryData.push({
                        depositId: deposit._id.toString(),
                        address: deposit.address,
                        error: error.message,
                        recoveryStatus: 'ERROR'
                    });
                }
            }

            console.log(`📊 Recovery Summary: ${walletRecoveryData.length} wallets processed`);
            console.log(`✅ Recoverable: ${walletRecoveryData.filter(w => w.recoveryStatus === 'RECOVERABLE').length}`);
            console.log(`❌ Failed: ${walletRecoveryData.filter(w => w.recoveryStatus === 'FAILED').length}`);
            console.log(`⚠️  Errors: ${walletRecoveryData.filter(w => w.recoveryStatus === 'ERROR').length}`);

            return walletRecoveryData;
        } catch (error) {
            throw new Error(`Emergency wallet recovery failed: ${error.message}`);
        }
    }

    /**
     * Get specific wallet private key by address
     * @param {string} address - Wallet address
     * @returns {Object} Wallet recovery data
     */
    async getWalletPrivateKey(address) {
        try {
            const deposit = await Deposit.findOne({ address }).select('_id address publicKey walletPrivateKey emergencyPrivateKey walletBackup');
            
            if (!deposit) {
                throw new Error(`No deposit found for address: ${address}`);
            }

            let privateKey = null;
            
            // Try primary decryption
            if (deposit.walletPrivateKey) {
                try {
                    privateKey = this.hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
                } catch (error) {
                    console.log(`Primary decryption failed: ${error.message}`);
                }
            }

            // Try emergency backup
            if (!privateKey && deposit.emergencyPrivateKey) {
                try {
                    privateKey = this.hdWalletService.decryptPrivateKey(deposit.emergencyPrivateKey);
                } catch (error) {
                    console.log(`Emergency decryption failed: ${error.message}`);
                }
            }

            return {
                depositId: deposit._id.toString(),
                address: deposit.address,
                publicKey: deposit.publicKey,
                privateKey: privateKey,
                walletBackup: deposit.walletBackup,
                hasPrivateKey: !!privateKey,
                recoveryMethod: privateKey ? (deposit.walletPrivateKey ? 'PRIMARY' : 'EMERGENCY') : 'FAILED'
            };
        } catch (error) {
            throw new Error(`Failed to recover wallet ${address}: ${error.message}`);
        }
    }

    /**
     * Check balances for all wallets (for emergency fund recovery)
     * @returns {Array} Wallet balances
     */
    async checkAllWalletBalances() {
        try {
            const deposits = await Deposit.find({
                address: { $exists: true }
            }).select('_id address amount network status');

            const balanceData = [];

            for (const deposit of deposits) {
                try {
                    const balance = await this.hdWalletService.getWalletBalance(deposit.address);
                    balanceData.push({
                        depositId: deposit._id.toString(),
                        address: deposit.address,
                        network: deposit.network,
                        depositAmount: deposit.amount,
                        currentBalance: balance,
                        hasBalance: balance.trx > 0 || balance.usdt > 0,
                        status: deposit.status
                    });
                } catch (error) {
                    balanceData.push({
                        depositId: deposit._id.toString(),
                        address: deposit.address,
                        error: error.message,
                        hasBalance: false
                    });
                }
            }

            const walletsWithBalance = balanceData.filter(w => w.hasBalance);
            console.log(`💰 Found ${walletsWithBalance.length} wallets with balance out of ${balanceData.length} total`);

            return balanceData;
        } catch (error) {
            throw new Error(`Failed to check wallet balances: ${error.message}`);
        }
    }

    /**
     * Export wallet data for backup purposes
     * @returns {Object} Complete backup data
     */
    async exportWalletBackup() {
        try {
            const walletData = await this.getAllWalletPrivateKeys();
            const balanceData = await this.checkAllWalletBalances();

            const backupData = {
                exportedAt: new Date().toISOString(),
                totalWallets: walletData.length,
                recoverableWallets: walletData.filter(w => w.recoveryStatus === 'RECOVERABLE').length,
                walletsWithBalance: balanceData.filter(b => b.hasBalance).length,
                walletData: walletData.map(w => ({
                    ...w,
                    privateKey: w.privateKey ? '***ENCRYPTED***' : null // Hide private keys in export
                })),
                balanceData,
                metadata: {
                    network: process.env.TRON_NETWORK || 'mainnet',
                    mainWallet: process.env.MAINNET_OWNER_WALLET,
                    fuelWallet: process.env.FUEL_WALLET_ADDRESS
                }
            };

            console.log('📁 Wallet backup data exported (private keys hidden in this export)');
            return backupData;
        } catch (error) {
            throw new Error(`Failed to export wallet backup: ${error.message}`);
        }
    }
}

module.exports = EmergencyWalletRecoveryService;