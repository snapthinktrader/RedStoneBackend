const { TronWeb } = require('tronweb');

class GasFeeCalculatorService {
    constructor() {
        this.tronWeb = new TronWeb({
            fullHost: process.env.TRON_NETWORK === 'mainnet' 
                ? 'https://api.trongrid.io'
                : 'https://api.shasta.trongrid.io'
        });
        
        // Standard gas costs for different transaction types (REAL measured values from blockchain)
        this.gasCosts = {
            TRX_TRANSFER: 0.1, // TRX for basic TRX transfer
            USDT_TRANSFER: 13.0, // TRX for USDT TRC20 transfer (actual measured via triggerConstantContract: 13.57 TRX)
            CONTRACT_CALL: 2, // TRX for contract interaction
            BUFFER: 3.0 // Extra TRX buffer for safety (~20% buffer on 13.57 = total 16-17 TRX per sweep)
        };
    }

    /**
     * Calculate TRX needed for USDT sweep operation
     * @param {string} fromAddress - Source wallet address
     * @param {string} toAddress - Destination wallet address  
     * @param {number} usdtAmount - Amount of USDT to sweep
     * @returns {Object} { trxNeeded, breakdown }
     */
    async calculateSweepGasFees(fromAddress, toAddress, usdtAmount) {
        try {
            let totalTrxNeeded = 0;
            const breakdown = {};

            // Check current TRX balance
            const currentTrxBalance = await this.getTrxBalance(fromAddress);
            breakdown.currentTrx = currentTrxBalance;

            // Calculate USDT transfer cost
            const usdtTransferCost = await this.estimateUsdtTransferCost(fromAddress, toAddress, usdtAmount);
            breakdown.usdtTransferCost = usdtTransferCost;
            totalTrxNeeded += usdtTransferCost;

            // Add buffer for network congestion
            const buffer = this.gasCosts.BUFFER;
            breakdown.buffer = buffer;
            totalTrxNeeded += buffer;

            // Calculate how much TRX we need to send
            const trxToSend = Math.max(0, totalTrxNeeded - currentTrxBalance);
            breakdown.trxToSend = trxToSend;

            return {
                trxNeeded: totalTrxNeeded,
                trxToSend: trxToSend,
                breakdown: breakdown,
                sufficient: currentTrxBalance >= totalTrxNeeded
            };
        } catch (error) {
            throw new Error(`Failed to calculate gas fees: ${error.message}`);
        }
    }

    /**
     * Estimate cost of USDT transfer using REAL blockchain data via triggerConstantContract
     * @param {string} fromAddress - Source address
     * @param {string} toAddress - Destination address
     * @param {number} usdtAmount - USDT amount
     * @returns {number} Estimated TRX cost
     */
    async estimateUsdtTransferCost(fromAddress, toAddress, usdtAmount) {
        try {
            console.log(`🔍 Fetching REAL gas fees from blockchain for ${usdtAmount} USDT transfer...`);
            
            // Get current energy and bandwidth prices from network
            const chainParameters = await this.tronWeb.trx.getChainParameters();
            const energyFeeParam = chainParameters.find(p => p.key === 'getEnergyFee');
            const energyPrice = energyFeeParam ? energyFeeParam.value : 100; // sun per energy unit
            
            console.log(`⚡ Current energy price: ${energyPrice} sun per energy unit`);

            // Get USDT contract
            const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
            
            // Convert USDT amount to contract units (6 decimals)
            const usdtUnits = this.tronWeb.toBigNumber(usdtAmount).multipliedBy(1000000);
            
            // Prepare parameters for constant contract call
            const parameter = [
                { type: 'address', value: toAddress },
                { type: 'uint256', value: usdtUnits.toString() }
            ];

            // Use triggerConstantContract to get REAL energy requirements from blockchain
            console.log('📡 Calling triggerConstantContract for accurate energy estimation...');
            const constantResult = await this.tronWeb.transactionBuilder.triggerConstantContract(
                usdtContract,
                'transfer(address,uint256)',
                {},
                parameter,
                fromAddress
            );

            // Get energy used from the constant contract call
            let energyRequired = constantResult.energy_used;
            
            if (!energyRequired || energyRequired === 0) {
                console.log('⚠️ No energy data from constant contract, using safe fallback: 130000 units');
                energyRequired = 130000; // Safe default based on real blockchain response
            }

            console.log(`⚡ Real energy required: ${energyRequired} units`);

            // Get account resources to calculate what needs to be purchased
            let accountEnergy = 0;
            let accountBandwidth = 0;
            
            try {
                const resources = await this.tronWeb.trx.getAccountResources(fromAddress);
                accountEnergy = resources.EnergyAvailable || 0;
                accountBandwidth = resources.NetAvailable || 0;
                console.log(`💎 Account has ${accountEnergy} energy and ${accountBandwidth} bandwidth available`);
            } catch (e) {
                console.log('⚠️ Could not fetch account resources, assuming zero');
            }

            // Calculate energy that needs to be bought
            const energyToBuy = Math.max(0, energyRequired - accountEnergy);
            const energyCostSun = energyToBuy * energyPrice;
            const energyCostTrx = energyCostSun / 1000000;

            // Calculate bandwidth needed (approximate transaction size)
            const bandwidthNeeded = 350; // Typical for USDT transfer
            const bandwidthToBuy = Math.max(0, bandwidthNeeded - accountBandwidth);
            const bandwidthCostSun = bandwidthToBuy * 1000; // 1000 sun per byte
            const bandwidthCostTrx = bandwidthCostSun / 1000000;

            const totalCostTrx = energyCostTrx + bandwidthCostTrx;

            console.log(`💰 Energy cost: ${energyCostTrx.toFixed(6)} TRX (${energyToBuy} units to buy)`);
            console.log(`🌐 Bandwidth cost: ${bandwidthCostTrx.toFixed(6)} TRX (${bandwidthToBuy} bytes to buy)`);
            console.log(`🎯 Total cost: ${totalCostTrx.toFixed(6)} TRX`);

            return totalCostTrx;

        } catch (error) {
            console.log('❌ Could not fetch real-time gas fees:', error.message);
            console.log('🔄 Using safe fallback calculation...');
            
            // Fallback: Use safe default based on real blockchain measurements
            try {
                const chainParameters = await this.tronWeb.trx.getChainParameters();
                const energyFeeParam = chainParameters.find(p => p.key === 'getEnergyFee');
                const energyPrice = energyFeeParam ? energyFeeParam.value : 100;
                
                // Use conservative energy estimate
                const safeEnergyEstimate = 130000; // Based on real triggerConstantContract response
                const energyCostSun = safeEnergyEstimate * energyPrice;
                const energyCostTrx = energyCostSun / 1000000;
                
                // Add bandwidth
                const bandwidthCostTrx = 0.350; // ~350 bytes * 1000 sun
                
                const totalWithBandwidth = energyCostTrx + bandwidthCostTrx;
                
                console.log(`🔄 Fallback: ${totalWithBandwidth.toFixed(6)} TRX`);
                return totalWithBandwidth;
                
            } catch (fallbackError) {
                console.log('❌ Fallback also failed, using safe default: 14 TRX');
                return 14.0; // Safe default to cover ~130k energy
            }
        }
    }

    /**
     * Get TRX balance of address
     * @param {string} address - Wallet address
     * @returns {number} TRX balance
     */
    async getTrxBalance(address) {
        try {
            const balance = await this.tronWeb.trx.getBalance(address);
            return parseFloat(this.tronWeb.fromSun(balance));
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get USDT balance of address
     * @param {string} address - Wallet address
     * @returns {number} USDT balance
     */
    async getUsdtBalance(address) {
        try {
            const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
            const contract = await this.tronWeb.contract().at(usdtContract);
            const balance = await contract.balanceOf(address).call();
            return this.tronWeb.toBigNumber(balance).div(1000000).toNumber();
        } catch (error) {
            return 0;
        }
    }

    /**
     * Calculate gas for TRX transfer (for sending gas fees)
     * @param {number} trxAmount - TRX amount to send
     * @returns {number} Gas cost in TRX
     */
    calculateTrxTransferGas(trxAmount) {
        return this.gasCosts.TRX_TRANSFER;
    }

    /**
     * Check if address has sufficient TRX for operation
     * @param {string} address - Wallet address
     * @param {number} requiredTrx - Required TRX amount
     * @returns {boolean} Has sufficient TRX
     */
    async hasSufficientTrx(address, requiredTrx) {
        try {
            const balance = await this.getTrxBalance(address);
            return balance >= requiredTrx;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current network gas prices and status
     * @returns {Object} Network status
     */
    async getNetworkStatus() {
        try {
            const chainParameters = await this.tronWeb.trx.getChainParameters();
            const energyPrice = chainParameters.find(p => p.key === 'getEnergyFee');
            
            return {
                energyPrice: energyPrice ? energyPrice.value : 420,
                network: process.env.TRON_NETWORK || 'mainnet',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                energyPrice: 420, // Default
                network: process.env.TRON_NETWORK || 'mainnet',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

module.exports = GasFeeCalculatorService;