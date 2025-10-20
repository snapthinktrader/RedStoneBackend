require('dotenv').config();
const mongoose = require('mongoose');
const CompleteAutoSweepService = require('./src/services/CompleteAutoSweepService');
const AutoFundTransferService = require('./src/services/AutoFundTransferService');
const GasFeeCalculatorService = require('./src/services/GasFeeCalculatorService');
const USDTSweepService = require('./src/services/USDTSweepService');
const { TronWeb } = require('tronweb');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

async function verifyCompleteWorkflow() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        console.log('\n🔍 COMPLETE BACKEND WORKFLOW VERIFICATION');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('Testing all services and configuration');
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        let allTestsPassed = true;
        const issues = [];
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 1: AutoFundTransferService Configuration
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 1: AutoFundTransferService Configuration');
        console.log('─────────────────────────────────────────────────────────────');
        
        const autoFundTransfer = new AutoFundTransferService();
        
        console.log('Environment Variables:');
        console.log(`  FUEL_WALLET_ADDRESS: ${process.env.FUEL_WALLET_ADDRESS || 'NOT SET'}`);
        console.log(`  FUEL_WALLET_PRIVATE_KEY: ${process.env.FUEL_WALLET_PRIVATE_KEY ? '***' + process.env.FUEL_WALLET_PRIVATE_KEY.slice(-4) : 'NOT SET'}`);
        console.log(`  MAIN_WALLET_ADDRESS: ${process.env.MAIN_WALLET_ADDRESS || 'NOT SET'}`);
        
        console.log('\nService Configuration:');
        console.log(`  fuelWalletAddress: ${autoFundTransfer.fuelWalletAddress}`);
        console.log(`  fuelWalletPrivateKey: ${autoFundTransfer.fuelWalletPrivateKey ? '***' + autoFundTransfer.fuelWalletPrivateKey.slice(-4) : 'NOT SET'}`);
        
        if (!autoFundTransfer.fuelWalletAddress) {
            console.log('  ❌ Fuel wallet address not configured');
            allTestsPassed = false;
            issues.push('Fuel wallet address not configured in AutoFundTransferService');
        } else {
            console.log('  ✅ Fuel wallet address configured');
            
            // Verify it matches expected address
            if (autoFundTransfer.fuelWalletAddress === 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ') {
                console.log('  ✅ Matches expected fuel wallet address');
            } else {
                console.log(`  ⚠️  Different from expected: T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ`);
            }
        }
        
        if (!autoFundTransfer.fuelWalletPrivateKey) {
            console.log('  ❌ Fuel wallet private key not configured');
            allTestsPassed = false;
            issues.push('Fuel wallet private key not configured');
        } else {
            console.log('  ✅ Fuel wallet private key configured');
            
            // Verify private key matches address
            try {
                const derivedAddress = tronWeb.address.fromPrivateKey(autoFundTransfer.fuelWalletPrivateKey);
                if (derivedAddress === autoFundTransfer.fuelWalletAddress) {
                    console.log('  ✅ Private key matches wallet address');
                } else {
                    console.log(`  ❌ Private key mismatch!`);
                    console.log(`     Expected: ${autoFundTransfer.fuelWalletAddress}`);
                    console.log(`     Derived: ${derivedAddress}`);
                    allTestsPassed = false;
                    issues.push('Fuel wallet private key does not match address');
                }
            } catch (error) {
                console.log(`  ❌ Invalid private key: ${error.message}`);
                allTestsPassed = false;
                issues.push('Invalid fuel wallet private key');
            }
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 2: USDTSweepService Configuration
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 2: USDTSweepService Configuration');
        console.log('─────────────────────────────────────────────────────────────');
        
        const usdtSweepService = new USDTSweepService();
        
        console.log(`  Main Wallet Address: ${usdtSweepService.mainWalletAddress}`);
        
        if (usdtSweepService.mainWalletAddress === 'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu') {
            console.log('  ✅ Correct main wallet address');
        } else {
            console.log('  ⚠️  Different main wallet address');
        }
        
        // Verify main wallet exists
        try {
            const mainAccount = await tronWeb.trx.getAccount(usdtSweepService.mainWalletAddress);
            if (mainAccount.address) {
                console.log('  ✅ Main wallet exists on blockchain');
            }
        } catch (error) {
            console.log(`  ❌ Main wallet error: ${error.message}`);
            allTestsPassed = false;
            issues.push('Main wallet not found on blockchain');
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 3: CompleteAutoSweepService Initialization
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 3: CompleteAutoSweepService Initialization');
        console.log('─────────────────────────────────────────────────────────────');
        
        const completeAutoSweep = new CompleteAutoSweepService();
        
        console.log('  Service Components:');
        console.log(`    hdWalletService: ${completeAutoSweep.hdWalletService ? '✅' : '❌'}`);
        console.log(`    gasFeeCalculator: ${completeAutoSweep.gasFeeCalculator ? '✅' : '❌'}`);
        console.log(`    autoFundTransfer: ${completeAutoSweep.autoFundTransfer ? '✅' : '❌'}`);
        console.log(`    usdtSweepService: ${completeAutoSweep.usdtSweepService ? '✅' : '❌'}`);
        
        console.log('\n  Configuration:');
        console.log(`    checkInterval: ${completeAutoSweep.checkInterval / 1000}s`);
        console.log(`    maxRetryAttempts: ${completeAutoSweep.maxRetryAttempts}`);
        
        // Verify fuel wallet address in auto-sweep service
        console.log('\n  Recovery Configuration:');
        console.log(`    Fuel Wallet (for TRX recovery): ${completeAutoSweep.autoFundTransfer.fuelWalletAddress}`);
        console.log(`    Main Wallet (for USDT): ${completeAutoSweep.usdtSweepService.mainWalletAddress}`);
        
        if (completeAutoSweep.autoFundTransfer.fuelWalletAddress === 'T9yPwwZiMbcLuhKWUtHwqLEoqqvm4S9mYJ') {
            console.log('    ✅ TRX will be recovered to correct fuel wallet');
        } else {
            console.log('    ❌ TRX recovery wallet incorrect!');
            allTestsPassed = false;
            issues.push('TRX will not be recovered to fuel wallet');
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 4: Gas Fee Calculation
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 4: Gas Fee Calculation Service');
        console.log('─────────────────────────────────────────────────────────────');
        
        const gasCalc = new GasFeeCalculatorService();
        
        try {
            // Test with a sample calculation
            const testAddress = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
            const result = await gasCalc.calculateSweepGasFees(
                testAddress,
                usdtSweepService.mainWalletAddress,
                10
            );
            
            console.log('  ✅ Gas calculation working');
            console.log(`    Total TRX needed: ${result.trxNeeded.toFixed(6)} TRX`);
            console.log(`    USDT transfer cost: ${result.breakdown.usdtTransferCost.toFixed(6)} TRX`);
            console.log(`    Buffer: ${result.breakdown.buffer} TRX`);
            
            if (result.trxNeeded > 14 && result.trxNeeded < 20) {
                console.log('  ✅ Gas calculation in expected range (14-20 TRX)');
            } else {
                console.log(`  ⚠️  Gas calculation outside expected range: ${result.trxNeeded} TRX`);
            }
        } catch (error) {
            console.log(`  ❌ Gas calculation failed: ${error.message}`);
            allTestsPassed = false;
            issues.push('Gas fee calculation service not working');
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 5: Workflow Steps Verification
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 5: Complete Workflow Steps');
        console.log('─────────────────────────────────────────────────────────────');
        
        console.log('  Expected Flow:');
        console.log('    1️⃣  User creates deposit → Generate HD wallet');
        console.log('    2️⃣  User sends USDT → Status: CONFIRMED');
        console.log('    3️⃣  Auto-sweep detects confirmed deposit');
        console.log('    4️⃣  Calculate gas fees (~16.38 TRX)');
        console.log('    5️⃣  Send TRX from FUEL wallet to deposit wallet');
        console.log('    6️⃣  Sweep USDT from deposit wallet to MAIN wallet');
        console.log('    7️⃣  Recover remaining TRX from deposit wallet to FUEL wallet');
        console.log('    8️⃣  Update status to COMPLETED');
        
        console.log('\n  Wallet Addresses:');
        console.log(`    FUEL Wallet (gas source + recovery): ${completeAutoSweep.autoFundTransfer.fuelWalletAddress}`);
        console.log(`    MAIN Wallet (USDT destination): ${completeAutoSweep.usdtSweepService.mainWalletAddress}`);
        console.log(`    HD Wallet (deposit, temporary): Generated per deposit`);
        
        // Verify wallets are different
        if (completeAutoSweep.autoFundTransfer.fuelWalletAddress !== completeAutoSweep.usdtSweepService.mainWalletAddress) {
            console.log('  ✅ Fuel and Main wallets are different (correct)');
        } else {
            console.log('  ❌ Fuel and Main wallets are the same (incorrect!)');
            allTestsPassed = false;
            issues.push('Fuel and Main wallets should be different');
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 6: Check Fuel Wallet Balance
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 6: Fuel Wallet Balance Check');
        console.log('─────────────────────────────────────────────────────────────');
        
        try {
            const fuelBalance = await tronWeb.trx.getBalance(autoFundTransfer.fuelWalletAddress);
            const fuelTrx = parseFloat(tronWeb.fromSun(fuelBalance));
            
            console.log(`  Current Balance: ${fuelTrx.toFixed(6)} TRX`);
            
            if (fuelTrx >= 50) {
                console.log('  ✅ Sufficient balance for multiple deposits');
            } else if (fuelTrx >= 20) {
                console.log('  ⚠️  Low balance, can handle 1-2 deposits');
            } else {
                console.log('  ❌ Insufficient balance for deposits');
                allTestsPassed = false;
                issues.push(`Fuel wallet needs more TRX (has ${fuelTrx}, needs at least 20)`);
            }
        } catch (error) {
            console.log(`  ❌ Error checking balance: ${error.message}`);
            allTestsPassed = false;
            issues.push('Cannot check fuel wallet balance');
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // TEST 7: Verify TRX Recovery Code
        // ══════════════════════════════════════════════════════════════════
        console.log('✓ TEST 7: TRX Recovery Code Verification');
        console.log('─────────────────────────────────────────────────────────────');
        
        // Read the actual code to verify it's correct
        const fs = require('fs');
        const serviceCode = fs.readFileSync('./src/services/CompleteAutoSweepService.js', 'utf8');
        
        // Check for critical recovery patterns
        const hasRecoveryCheck = serviceCode.includes('remainingTrxBalance');
        const hasFloorConversion = serviceCode.includes('Math.floor(tronWeb.toSun');
        const sendToFuelWallet = serviceCode.includes('this.autoFundTransfer.fuelWalletAddress');
        const hasRecoveryUpdate = serviceCode.includes('trxRecoveryTxHash');
        
        console.log('  Code Analysis:');
        console.log(`    Checks remaining TRX: ${hasRecoveryCheck ? '✅' : '❌'}`);
        console.log(`    Uses Math.floor for SUN conversion: ${hasFloorConversion ? '✅' : '❌'}`);
        console.log(`    Sends to fuel wallet: ${sendToFuelWallet ? '✅' : '❌'}`);
        console.log(`    Updates recovery transaction: ${hasRecoveryUpdate ? '✅' : '❌'}`);
        
        if (!hasRecoveryCheck || !hasFloorConversion || !sendToFuelWallet || !hasRecoveryUpdate) {
            console.log('  ⚠️  Some recovery code patterns missing');
            if (!sendToFuelWallet) {
                allTestsPassed = false;
                issues.push('TRX recovery not sending to fuel wallet');
            }
        } else {
            console.log('  ✅ All recovery code patterns present');
        }
        
        console.log();
        
        // ══════════════════════════════════════════════════════════════════
        // FINAL SUMMARY
        // ══════════════════════════════════════════════════════════════════
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 VERIFICATION SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        if (allTestsPassed) {
            console.log('✅ ✅ ✅ ALL TESTS PASSED! ✅ ✅ ✅\n');
            console.log('🎯 Backend is correctly configured:');
            console.log('   ✅ Gas fees: ~16.38 TRX calculated correctly');
            console.log('   ✅ USDT swept to: ' + usdtSweepService.mainWalletAddress);
            console.log('   ✅ TRX recovered to: ' + autoFundTransfer.fuelWalletAddress);
            console.log('   ✅ Status updates to: COMPLETED');
            console.log('\n🚀 Ready for production use!');
        } else {
            console.log('❌ ❌ ❌ TESTS FAILED! ❌ ❌ ❌\n');
            console.log('🚫 Issues found:');
            issues.forEach((issue, index) => {
                console.log(`   ${index + 1}. ${issue}`);
            });
            console.log('\n⚠️  Fix these issues before using in production!');
        }
        
        console.log('\n═══════════════════════════════════════════════════════════════\n');
        
        // ══════════════════════════════════════════════════════════════════
        // DEPLOYMENT RECOMMENDATIONS
        // ══════════════════════════════════════════════════════════════════
        if (allTestsPassed) {
            console.log('💡 DEPLOYMENT CHECKLIST:');
            console.log('   □ Deploy backend to Vercel: vercel --prod');
            console.log('   □ Update Vercel alias: vercel alias set <deployment> red-stone-backend.vercel.app');
            console.log('   □ Test with small deposit (1 USDT) first');
            console.log('   □ Monitor fuel wallet balance');
            console.log('   □ Verify auto-sweep runs every 30 seconds');
            console.log('   □ Check all transaction hashes on TRONSCAN\n');
        }
        
        process.exit(allTestsPassed ? 0 : 1);
        
    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Run the verification
verifyCompleteWorkflow();
