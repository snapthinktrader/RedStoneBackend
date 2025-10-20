// Emergency wallet recovery test - for emergency fund recovery only
const mongoose = require('mongoose');
const EmergencyWalletRecoveryService = require('./src/services/EmergencyWalletRecoveryService');
require('dotenv').config();

async function testWalletBackupSystem() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database for wallet backup verification');

        const emergencyService = new EmergencyWalletRecoveryService();

        console.log('\n🔍 Checking wallet backup system...');
        
        // Test 1: Check wallet balances
        console.log('\n1️⃣ Checking all wallet balances...');
        const balances = await emergencyService.checkAllWalletBalances();
        
        const walletsWithFunds = balances.filter(b => b.hasBalance);
        console.log(`💰 Wallets with funds: ${walletsWithFunds.length}/${balances.length}`);
        
        if (walletsWithFunds.length > 0) {
            console.log('📋 Wallets with balance:');
            walletsWithFunds.forEach(wallet => {
                console.log(`  - ${wallet.address}: TRX=${wallet.currentBalance?.trx || 0}, USDT=${wallet.currentBalance?.usdt || 0}`);
            });
        }

        // Test 2: Export backup (without exposing private keys)
        console.log('\n2️⃣ Generating wallet backup export...');
        const backupData = await emergencyService.exportWalletBackup();
        console.log(`📁 Backup created: ${backupData.totalWallets} total wallets, ${backupData.recoverableWallets} recoverable`);

        // Test 3: Check if we can recover private keys (just count, don't expose)
        console.log('\n3️⃣ Verifying private key recovery capabilities...');
        const recoveryData = await emergencyService.getAllWalletPrivateKeys();
        const recoverable = recoveryData.filter(w => w.recoveryStatus === 'RECOVERABLE');
        
        console.log(`🔐 Private key recovery status:`);
        console.log(`  ✅ Recoverable wallets: ${recoverable.length}`);
        console.log(`  ❌ Failed recoveries: ${recoveryData.filter(w => w.recoveryStatus === 'FAILED').length}`);
        console.log(`  ⚠️  Error cases: ${recoveryData.filter(w => w.recoveryStatus === 'ERROR').length}`);

        console.log('\n✅ Wallet backup system verification complete!');
        console.log('🚨 IMPORTANT: Private keys are encrypted and stored securely');
        console.log('💡 Use EmergencyWalletRecoveryService.getAllWalletPrivateKeys() only in emergencies');

    } catch (error) {
        console.error('❌ Wallet backup test failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

// Run the test
if (require.main === module) {
    testWalletBackupSystem();
}

module.exports = { testWalletBackupSystem };