const GasFeeCalculatorService = require('./src/services/GasFeeCalculatorService');
require('dotenv').config();

async function testGasCalculation() {
    try {
        const gasCalculator = new GasFeeCalculatorService();
        
        console.log('🧪 TESTING GAS FEE CALCULATION');
        console.log('═══════════════════════════════════════════════════════\n');
        
        // Test addresses
        const depositWallet = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
        const mainWallet = 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu';
        const usdtAmount = 10;
        
        console.log('📋 Test Parameters:');
        console.log('   From:', depositWallet);
        console.log('   To:', mainWallet);
        console.log('   Amount:', usdtAmount, 'USDT\n');
        
        // Test 1: Get network status
        console.log('1️⃣ Network Status:');
        console.log('─────────────────────────────────────────────────────');
        const networkStatus = await gasCalculator.getNetworkStatus();
        console.log('   Energy Price:', networkStatus.energyPrice, 'sun per unit');
        console.log('   Network:', networkStatus.network);
        console.log('   Timestamp:', networkStatus.timestamp);
        console.log('');
        
        // Test 2: Check current balances
        console.log('2️⃣ Current Balances:');
        console.log('─────────────────────────────────────────────────────');
        const trxBalance = await gasCalculator.getTrxBalance(depositWallet);
        const usdtBalance = await gasCalculator.getUsdtBalance(depositWallet);
        console.log('   TRX Balance:', trxBalance, 'TRX');
        console.log('   USDT Balance:', usdtBalance, 'USDT');
        console.log('');
        
        // Test 3: Estimate USDT transfer cost
        console.log('3️⃣ USDT Transfer Cost Estimation:');
        console.log('─────────────────────────────────────────────────────');
        const transferCost = await gasCalculator.estimateUsdtTransferCost(
            depositWallet, 
            mainWallet, 
            usdtAmount
        );
        console.log('   Estimated cost:', transferCost, 'TRX');
        console.log('');
        
        // Test 4: Calculate complete sweep gas fees
        console.log('4️⃣ Complete Sweep Gas Fee Calculation:');
        console.log('─────────────────────────────────────────────────────');
        const gasFees = await gasCalculator.calculateSweepGasFees(
            depositWallet,
            mainWallet,
            usdtAmount
        );
        
        console.log('   Total TRX Needed:', gasFees.trxNeeded.toFixed(6), 'TRX');
        console.log('   TRX to Send:', gasFees.trxToSend.toFixed(6), 'TRX');
        console.log('   Sufficient Balance:', gasFees.sufficient ? '✅ YES' : '❌ NO');
        console.log('');
        console.log('   Breakdown:');
        console.log('   ├─ Current TRX:', gasFees.breakdown.currentTrx, 'TRX');
        console.log('   ├─ USDT Transfer Cost:', gasFees.breakdown.usdtTransferCost.toFixed(6), 'TRX');
        console.log('   ├─ Buffer:', gasFees.breakdown.buffer, 'TRX');
        console.log('   └─ Need to Send:', gasFees.breakdown.trxToSend.toFixed(6), 'TRX');
        console.log('');
        
        // Test 5: Compare with actual failed transaction
        console.log('5️⃣ Comparison with Failed Transaction:');
        console.log('─────────────────────────────────────────────────────');
        console.log('   Previous attempt sent:', '2.001 TRX');
        console.log('   Transaction result:', 'OUT_OF_ENERGY');
        console.log('   Energy actually used:', '20,010 units');
        console.log('   Energy cost (100 sun/unit):', '2.001 TRX');
        console.log('');
        console.log('   Our calculation suggests:', gasFees.trxToSend.toFixed(6), 'TRX');
        console.log('   Difference:', (gasFees.trxToSend - 2.001).toFixed(6), 'TRX');
        console.log('');
        
        // Analysis
        console.log('📊 ANALYSIS:');
        console.log('═══════════════════════════════════════════════════════');
        
        if (gasFees.trxToSend < 2.001) {
            console.log('❌ PROBLEM: Our calculation is LOWER than what failed!');
            console.log('   This means we would send insufficient gas again.');
        } else if (gasFees.trxToSend > 5) {
            console.log('⚠️  WARNING: Our calculation is very high (>5 TRX)');
            console.log('   This might be too much gas fee.');
        } else if (gasFees.trxToSend >= 3 && gasFees.trxToSend <= 5) {
            console.log('✅ GOOD: Calculation is reasonable (3-5 TRX range)');
            console.log('   This should be sufficient with good buffer.');
        } else {
            console.log('⚠️  BORDERLINE: Calculation is 2-3 TRX');
            console.log('   Might work but has minimal buffer.');
        }
        
        console.log('');
        console.log('💡 RECOMMENDATION:');
        if (gasFees.trxToSend < 3) {
            console.log('   Send at least 4 TRX to be safe');
            console.log('   Reason: 20,010 energy × 100 sun = 2.001 TRX + buffer needed');
        } else {
            console.log('   Current calculation of', gasFees.trxToSend.toFixed(3), 'TRX should be sufficient');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

testGasCalculation();
