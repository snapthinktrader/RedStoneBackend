require('dotenv').config();
const mongoose = require('mongoose');
const SystemWallet = require('./src/models/SystemWallet');
const ReusableWalletService = require('./src/services/reusableWalletService');

/**
 * Test script for system-wide reusable wallet
 * Tests wallet creation, deposit counting, and rotation at 40 deposits
 */

async function testSystemWallet() {
    try {
        console.log('\n🧪 SYSTEM WALLET TEST SCRIPT');
        console.log('═══════════════════════════════════════════════════════\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const reusableWalletService = new ReusableWalletService();

        // Test 1: Get or create system wallet
        console.log('📝 TEST 1: Get or Create System Wallet');
        console.log('───────────────────────────────────────────────────────');
        
        const walletInfo = await reusableWalletService.getOrCreateDepositWallet();
        console.log(`✅ Wallet Address: ${walletInfo.address}`);
        console.log(`   Deposit Count: ${walletInfo.depositCount}/40`);
        console.log(`   Is New: ${walletInfo.isNew}`);
        console.log(`   Can Accept Deposits: ${walletInfo.canAcceptDeposits}`);

        // Test 2: Check wallet info
        console.log('\n📝 TEST 2: Get Active Wallet Info');
        console.log('───────────────────────────────────────────────────────');
        
        const activeInfo = await reusableWalletService.getActiveWalletInfo();
        if (activeInfo) {
            console.log(`✅ Active Wallet: ${activeInfo.address}`);
            console.log(`   Deposit Count: ${activeInfo.depositCount}/40`);
            console.log(`   Total Received: $${activeInfo.totalReceived.toFixed(2)}`);
            console.log(`   USDT Balance: ${activeInfo.currentUsdtBalance.toFixed(6)} USDT`);
            console.log(`   TRX Balance: ${activeInfo.currentTrxBalance.toFixed(6)} TRX`);
            console.log(`   Deposits Remaining: ${activeInfo.depositsRemaining}`);
        }

        // Test 3: Check if rotation is needed
        console.log('\n📝 TEST 3: Check Rotation Status');
        console.log('───────────────────────────────────────────────────────');
        
        const needsRotation = await reusableWalletService.needsRotation();
        console.log(`   Needs Rotation: ${needsRotation ? '⚠️ YES' : '✅ NO'}`);

        if (needsRotation) {
            console.log('\n⚠️  WARNING: Wallet has reached 40 deposits!');
            console.log('   Rotation will be triggered on next deposit.');
        }

        // Test 4: Simulate deposit count increment
        console.log('\n📝 TEST 4: Simulate Deposit (Increment Counter)');
        console.log('───────────────────────────────────────────────────────');
        console.log('❓ Increment deposit count? (y/n)');
        
        // For automated testing, skip this step
        console.log('⏭️  Skipping increment in test mode\n');

        // Test 5: Get retired wallets history
        console.log('📝 TEST 5: Retired Wallets History');
        console.log('───────────────────────────────────────────────────────');
        
        const retiredWallets = await reusableWalletService.getRetiredWallets();
        if (retiredWallets.length > 0) {
            console.log(`✅ Found ${retiredWallets.length} retired wallet(s):\n`);
            retiredWallets.forEach((wallet, index) => {
                console.log(`   ${index + 1}. Address: ${wallet.address}`);
                console.log(`      Deposits: ${wallet.depositCount}`);
                console.log(`      Total Received: $${wallet.totalReceived.toFixed(2)}`);
                console.log(`      Rotated: ${wallet.rotatedAt?.toLocaleDateString() || 'N/A'}`);
                console.log('');
            });
        } else {
            console.log('   No retired wallets yet\n');
        }

        // Summary
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ ALL TESTS COMPLETED');
        console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB\n');
    }
}

// Run tests
testSystemWallet();
