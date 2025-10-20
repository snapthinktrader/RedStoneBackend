const { TronWeb } = require('tronweb');
require('dotenv').config();

async function checkRealUSDTTransferFees() {
    try {
        const tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io'
        });

        const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        const fromAddress = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa'; // Our deposit wallet
        const toAddress = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu'; // Main wallet
        const usdtAmount = 10; // 10 USDT

        console.log('🔍 Checking REAL USDT transfer fees...');
        console.log('📍 From:', fromAddress);
        console.log('📍 To:', toAddress);
        console.log('💰 Amount:', usdtAmount, 'USDT');

        // Convert USDT to contract units (6 decimals)
        const usdtUnits = tronWeb.toBigNumber(usdtAmount).multipliedBy(1000000);
        console.log('🔢 USDT Units:', usdtUnits.toString());

        // Get USDT contract
        const contract = await tronWeb.contract().at(usdtContract);
        
        // Build the transfer transaction
        console.log('\n🏗️ Building USDT transfer transaction...');
        
        const functionSelector = 'transfer(address,uint256)';
        const parameter = [
            { type: 'address', value: toAddress },
            { type: 'uint256', value: usdtUnits.toString() }
        ];

        // Create transaction to estimate fees
        const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
            usdtContract,
            functionSelector,
            {},
            parameter,
            fromAddress
        );

        console.log('📊 Transaction estimation result:');
        console.log('⚡ Energy Used:', transaction.energy_used);
        console.log('🔋 Energy Penalty:', transaction.energy_penalty);
        console.log('💎 Net Usage:', transaction.net_usage);
        console.log('💵 Net Fee:', transaction.net_fee);

        // Get current energy price
        console.log('\n💰 Getting current network prices...');
        const chainParameters = await tronWeb.trx.getChainParameters();
        const energyFeeParam = chainParameters.find(p => p.key === 'getEnergyFee');
        const energyPrice = energyFeeParam ? energyFeeParam.value : 420; // Default 420 sun per energy
        
        console.log('⚡ Energy Price:', energyPrice, 'sun per energy unit');

        // Calculate actual cost
        const energyUsed = transaction.energy_used || 14000; // Default if not available
        const energyCostSun = energyUsed * energyPrice;
        const energyCostTrx = energyCostSun / 1000000; // Convert sun to TRX

        const netFeeTrx = (transaction.net_fee || 0) / 1000000;
        const totalCostTrx = energyCostTrx + netFeeTrx;

        console.log('\n💎 REAL COST CALCULATION:');
        console.log('⚡ Energy Used:', energyUsed, 'units');
        console.log('💰 Energy Cost:', energyCostTrx.toFixed(6), 'TRX');
        console.log('🌐 Net Fee:', netFeeTrx.toFixed(6), 'TRX');
        console.log('🎯 TOTAL COST:', totalCostTrx.toFixed(6), 'TRX');

        // Add reasonable buffer
        const bufferTrx = 0.5; // Small buffer
        const recommendedTrx = totalCostTrx + bufferTrx;

        console.log('🛡️ Buffer:', bufferTrx, 'TRX');
        console.log('✅ RECOMMENDED GAS AMOUNT:', recommendedTrx.toFixed(2), 'TRX');

        console.log('\n📈 Comparison with current settings:');
        console.log('❌ Current setting: 20 TRX (overestimated by', (20 - recommendedTrx).toFixed(2), 'TRX)');
        console.log('✅ Actual need:', recommendedTrx.toFixed(2), 'TRX');
        console.log('💡 Savings:', (20 - recommendedTrx).toFixed(2), 'TRX per transaction');

    } catch (error) {
        console.error('❌ Error checking real fees:', error.message);
        
        // Fallback: check recent USDT transactions for reference
        console.log('\n🔍 Checking recent USDT transactions for reference...');
        try {
            const recentTxs = await tronWeb.trx.getTransactionsFromAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 10);
            if (recentTxs && recentTxs.length > 0) {
                console.log('📊 Found', recentTxs.length, 'recent USDT transactions');
                // Analyze recent transactions...
            }
        } catch (fallbackError) {
            console.log('❌ Fallback also failed:', fallbackError.message);
        }
    }
}

checkRealUSDTTransferFees();