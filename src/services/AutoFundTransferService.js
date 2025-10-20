const { TronWeb } = require('tronweb');

class AutoFundTransferService {
    constructor() {
        this.fuelWalletPrivateKey = process.env.FUEL_WALLET_PRIVATE_KEY || process.env.OWNER_WALLET_PRIVATE_KEY;
        this.fuelWalletAddress = process.env.FUEL_WALLET_ADDRESS;
        
        this.tronWeb = new TronWeb({
            fullHost: process.env.TRON_NETWORK === 'mainnet' 
                ? 'https://api.trongrid.io'
                : 'https://api.shasta.trongrid.io',
            privateKey: this.fuelWalletPrivateKey
        });
        
        // Derive fuel wallet address if not provided
        if (!this.fuelWalletAddress && this.fuelWalletPrivateKey) {
            this.fuelWalletAddress = this.tronWeb.address.fromPrivateKey(this.fuelWalletPrivateKey);
        }
    }

    /**
     * Send TRX from fuel wallet to deposit wallet for gas fees
     * @param {string} toAddress - Deposit wallet address
     * @param {number} trxAmount - TRX amount to send
     * @param {string} reason - Reason for transfer
     * @returns {Object} Transfer result
     */
    async sendGasFees(toAddress, trxAmount, reason = 'Auto-sweep gas fees') {
        try {
            console.log(`🚀 Sending ${trxAmount} TRX from fuel wallet to ${toAddress}`);
            console.log(`Reason: ${reason}`);

            // Validate inputs
            if (!this.tronWeb.isAddress(toAddress)) {
                throw new Error('Invalid destination address');
            }

            if (trxAmount <= 0) {
                throw new Error('Invalid TRX amount');
            }

            // Check fuel wallet balance
            const fuelBalance = await this.getFuelWalletBalance();
            if (fuelBalance < trxAmount + 0.1) { // Keep 0.1 TRX buffer
                throw new Error(`Insufficient fuel wallet balance. Required: ${trxAmount + 0.1} TRX, Available: ${fuelBalance} TRX`);
            }

            // Create transaction
            const transaction = await this.tronWeb.transactionBuilder.sendTrx(
                toAddress,
                this.tronWeb.toSun(trxAmount),
                this.fuelWalletAddress
            );

            // Sign transaction
            const signedTransaction = await this.tronWeb.trx.sign(transaction);

            // Broadcast transaction
            const result = await this.tronWeb.trx.sendRawTransaction(signedTransaction);

            if (result.result) {
                console.log(`✅ Gas fees sent successfully!`);
                console.log(`Transaction ID: ${result.txid}`);
                
                return {
                    success: true,
                    txid: result.txid,
                    amount: trxAmount,
                    from: this.fuelWalletAddress,
                    to: toAddress,
                    timestamp: new Date().toISOString(),
                    reason: reason
                };
            } else {
                throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
            }

        } catch (error) {
            console.error(`❌ Failed to send gas fees:`, error.message);
            return {
                success: false,
                error: error.message,
                amount: trxAmount,
                from: this.fuelWalletAddress,
                to: toAddress,
                timestamp: new Date().toISOString(),
                reason: reason
            };
        }
    }

    /**
     * Get fuel wallet TRX balance
     * @returns {number} TRX balance
     */
    async getFuelWalletBalance() {
        try {
            const balance = await this.tronWeb.trx.getBalance(this.fuelWalletAddress);
            return parseFloat(this.tronWeb.fromSun(balance));
        } catch (error) {
            throw new Error(`Failed to get fuel wallet balance: ${error.message}`);
        }
    }

    /**
     * Check if fuel wallet has sufficient balance for operation
     * @param {number} requiredTrx - Required TRX amount
     * @returns {boolean} Has sufficient balance
     */
    async hasSufficientFuelBalance(requiredTrx) {
        try {
            const balance = await this.getFuelWalletBalance();
            return balance >= requiredTrx + 1; // Keep 1 TRX buffer
        } catch (error) {
            return false;
        }
    }

    /**
     * Get fuel wallet status and information
     * @returns {Object} Fuel wallet status
     */
    async getFuelWalletStatus() {
        try {
            const balance = await this.getFuelWalletBalance();
            const account = await this.tronWeb.trx.getAccount(this.fuelWalletAddress);
            
            return {
                address: this.fuelWalletAddress,
                balance: balance,
                active: !!account.address,
                network: process.env.TRON_NETWORK || 'mainnet',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                address: this.fuelWalletAddress,
                balance: 0,
                active: false,
                network: process.env.TRON_NETWORK || 'mainnet',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    /**
     * Batch send gas fees to multiple addresses
     * @param {Array} transfers - Array of {address, amount, reason}
     * @returns {Array} Transfer results
     */
    async batchSendGasFees(transfers) {
        const results = [];
        
        for (const transfer of transfers) {
            try {
                const result = await this.sendGasFees(
                    transfer.address, 
                    transfer.amount, 
                    transfer.reason || 'Batch gas fees'
                );
                results.push(result);
                
                // Small delay between transactions
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    ...transfer
                });
            }
        }
        
        return results;
    }

    /**
     * Validate fuel wallet configuration
     * @returns {Object} Validation result
     */
    validateConfiguration() {
        const issues = [];
        
        if (!this.fuelWalletPrivateKey) {
            issues.push('FUEL_WALLET_PRIVATE_KEY not configured');
        }
        
        if (!this.fuelWalletAddress) {
            issues.push('FUEL_WALLET_ADDRESS not configured');
        }
        
        if (this.fuelWalletPrivateKey && this.fuelWalletAddress) {
            try {
                const derivedAddress = this.tronWeb.address.fromPrivateKey(this.fuelWalletPrivateKey);
                if (derivedAddress !== this.fuelWalletAddress) {
                    issues.push('Private key does not match fuel wallet address');
                }
            } catch (error) {
                issues.push(`Invalid private key format: ${error.message}`);
            }
        }
        
        return {
            valid: issues.length === 0,
            issues: issues,
            fuelWalletAddress: this.fuelWalletAddress,
            network: process.env.TRON_NETWORK || 'mainnet'
        };
    }
}

module.exports = AutoFundTransferService;