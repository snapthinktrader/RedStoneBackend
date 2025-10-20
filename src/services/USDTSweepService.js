const { TronWeb } = require('tronweb');

class USDTSweepService {
    constructor() {
        this.usdtContractAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC20
        this.mainWalletAddress = process.env.MAINNET_OWNER_WALLET || 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
        
        this.tronWeb = new TronWeb({
            fullHost: process.env.TRON_NETWORK === 'mainnet' 
                ? 'https://api.trongrid.io'
                : 'https://api.shasta.trongrid.io'
        });
    }

    /**
     * Sweep USDT from deposit wallet to main wallet
     * @param {string} fromAddress - Deposit wallet address
     * @param {string} privateKey - Deposit wallet private key
     * @param {number} usdtAmount - USDT amount to sweep (optional, sweeps all if not specified)
     * @returns {Object} Sweep result
     */
    async sweepUSDT(fromAddress, privateKey, usdtAmount = null) {
        try {
            console.log(`🔄 Starting USDT sweep from ${fromAddress} to ${this.mainWalletAddress}`);

            // Create TronWeb instance with the deposit wallet private key
            const depositWalletTronWeb = new TronWeb({
                fullHost: process.env.TRON_NETWORK === 'mainnet' 
                    ? 'https://api.trongrid.io'
                    : 'https://api.shasta.trongrid.io',
                privateKey: privateKey
            });

            // Verify private key matches address
            const derivedAddress = depositWalletTronWeb.address.fromPrivateKey(privateKey);
            if (derivedAddress !== fromAddress) {
                throw new Error('Private key does not match deposit wallet address');
            }

            // Get current balances using the private key for accurate reading
            const balances = await this.getWalletBalances(fromAddress, privateKey);
            console.log(`Current balances - TRX: ${balances.trx}, USDT: ${balances.usdt}`);

            // Determine amount to sweep
            const amountToSweep = usdtAmount || balances.usdt;
            if (amountToSweep <= 0) {
                throw new Error('No USDT to sweep');
            }

            if (amountToSweep > balances.usdt) {
                throw new Error(`Insufficient USDT balance. Requested: ${amountToSweep}, Available: ${balances.usdt}`);
            }

            // Check if we have enough TRX for the transaction (realistic requirement)
            const requiredTrx = 2; // Based on real gas fee calculation (~1.4 + buffer)
            if (balances.trx < requiredTrx) {
                throw new Error(`Insufficient TRX for transaction. Required: ~${requiredTrx} TRX, Available: ${balances.trx} TRX`);
            }

            // Get USDT contract instance
            const contract = await depositWalletTronWeb.contract().at(this.usdtContractAddress);

            // Convert USDT amount to contract units (6 decimals)
            const usdtUnits = depositWalletTronWeb.toBigNumber(amountToSweep).multipliedBy(1000000);

            console.log(`📝 Creating USDT transfer transaction...`);
            console.log(`Amount: ${amountToSweep} USDT (${usdtUnits.toString()} units)`);

            // Create transfer transaction
            const transaction = await depositWalletTronWeb.transactionBuilder.triggerSmartContract(
                this.usdtContractAddress,
                'transfer(address,uint256)',
                {
                    feeLimit: 50000000, // 50 TRX fee limit
                    callValue: 0
                },
                [
                    { type: 'address', value: this.mainWalletAddress },
                    { type: 'uint256', value: usdtUnits.toString() }
                ],
                fromAddress
            );

            if (!transaction.result || !transaction.result.result) {
                throw new Error(`Failed to create transaction: ${JSON.stringify(transaction)}`);
            }

            console.log(`✏️ Signing transaction...`);
            const signedTransaction = await depositWalletTronWeb.trx.sign(transaction.transaction);

            console.log(`📡 Broadcasting transaction...`);
            const result = await depositWalletTronWeb.trx.sendRawTransaction(signedTransaction);

            if (result.result) {
                console.log(`✅ USDT sweep successful!`);
                console.log(`Transaction ID: ${result.txid}`);
                
                return {
                    success: true,
                    txid: result.txid,
                    amount: amountToSweep,
                    from: fromAddress,
                    to: this.mainWalletAddress,
                    timestamp: new Date().toISOString(),
                    balancesBefore: balances
                };
            } else {
                throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
            }

        } catch (error) {
            console.error(`❌ USDT sweep failed:`, error.message);
            return {
                success: false,
                error: error.message,
                amount: usdtAmount,
                from: fromAddress,
                to: this.mainWalletAddress,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get wallet balances (TRX and USDT)
     * @param {string} address - Wallet address
     * @returns {Object} { trx, usdt }
     */
    async getWalletBalances(address, privateKey = null) {
        try {
            // Use TronWeb instance with private key if provided for better USDT balance checking
            const tronWebInstance = privateKey ? new TronWeb({
                fullHost: process.env.TRON_NETWORK === 'mainnet' 
                    ? 'https://api.trongrid.io'
                    : 'https://api.shasta.trongrid.io',
                privateKey: privateKey
            }) : this.tronWeb;

            // Get TRX balance
            const trxBalance = await tronWebInstance.trx.getBalance(address);
            const trxAmount = parseFloat(tronWebInstance.fromSun(trxBalance));

            // Get USDT balance
            let usdtAmount = 0;
            try {
                const contract = await tronWebInstance.contract().at(this.usdtContractAddress);
                const usdtBalance = await contract.balanceOf(address).call();
                usdtAmount = tronWebInstance.toBigNumber(usdtBalance).div(1000000).toNumber();
            } catch (usdtError) {
                console.log(`Could not fetch USDT balance: ${usdtError.message}`);
            }

            return { trx: trxAmount, usdt: usdtAmount };
        } catch (error) {
            return { trx: 0, usdt: 0 };
        }
    }

    /**
     * Check if address has USDT to sweep
     * @param {string} address - Wallet address
     * @returns {Object} { hasUsdt, amount }
     */
    async checkUSDTBalance(address) {
        try {
            const contract = await this.tronWeb.contract().at(this.usdtContractAddress);
            const balance = await contract.balanceOf(address).call();
            const amount = this.tronWeb.toBigNumber(balance).div(1000000).toNumber();
            
            return {
                hasUsdt: amount > 0,
                amount: amount
            };
        } catch (error) {
            return { hasUsdt: false, amount: 0 };
        }
    }

    /**
     * Estimate gas needed for USDT transfer
     * @param {string} fromAddress - Source address
     * @param {number} usdtAmount - USDT amount
     * @returns {Object} Gas estimation
     */
    async estimateGas(fromAddress, usdtAmount) {
        try {
            const usdtUnits = this.tronWeb.toBigNumber(usdtAmount).multipliedBy(1000000);
            
            const transaction = await this.tronWeb.transactionBuilder.triggerSmartContract(
                this.usdtContractAddress,
                'transfer(address,uint256)',
                { feeLimit: 50000000 },
                [
                    { type: 'address', value: this.mainWalletAddress },
                    { type: 'uint256', value: usdtUnits.toString() }
                ],
                fromAddress
            );

            const energyUsed = transaction.energy_used || 14000;
            const trxCost = (energyUsed / 1000) + 5; // Approximate conversion + buffer

            return {
                energyUsed: energyUsed,
                trxCost: trxCost,
                feeLimit: 50
            };
        } catch (error) {
            return {
                energyUsed: 14000,
                trxCost: 20,
                feeLimit: 50
            };
        }
    }

    /**
     * Validate sweep parameters
     * @param {string} fromAddress - Source address
     * @param {string} privateKey - Private key
     * @param {number} usdtAmount - USDT amount
     * @returns {Object} Validation result
     */
    async validateSweepParameters(fromAddress, privateKey, usdtAmount) {
        const issues = [];

        // Validate address
        if (!this.tronWeb.isAddress(fromAddress)) {
            issues.push('Invalid source address');
        }

        // Validate private key
        try {
            const derivedAddress = this.tronWeb.address.fromPrivateKey(privateKey);
            if (derivedAddress !== fromAddress) {
                issues.push('Private key does not match source address');
            }
        } catch (error) {
            issues.push('Invalid private key format');
        }

        // Check balances if address is valid
        if (issues.length === 0) {
            const balances = await this.getWalletBalances(fromAddress, privateKey);
            
            if (balances.usdt < usdtAmount) {
                issues.push(`Insufficient USDT balance. Required: ${usdtAmount}, Available: ${balances.usdt}`);
            }
            
            const requiredTrx = 2; // Realistic TRX requirement based on actual gas costs
            if (balances.trx < requiredTrx) {
                issues.push(`Insufficient TRX for transaction. Required: ~${requiredTrx} TRX, Available: ${balances.trx}`);
            }
        }

        return {
            valid: issues.length === 0,
            issues: issues
        };
    }
}

module.exports = USDTSweepService;