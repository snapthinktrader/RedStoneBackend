const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const USDTSweepService = require('./src/services/USDTSweepService');
const EnhancedHDWalletService = require('./src/services/EnhancedHDWalletService');
require('dotenv').config();

async function checkAndUpdateDeposit() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');

        // Get the latest deposit
        const deposit = await Deposit.findOne().sort({ createdAt: -1 });
        
        if (!deposit) {
            console.log('❌ No deposits found');
            return;
        }

        console.log('🔍 LIVE DEPOSIT CHECK');
        console.log('=====================');
        console.log('📍 Address:', deposit.address);
        console.log('📊 Current Status:', deposit.status);
        console.log('💰 Expected Amount:', deposit.expectedAmount, 'USDT');
        console.log('💰 Recorded Amount:', deposit.actualAmount, 'USDT');

        // Decrypt private key
        const hdWalletService = new EnhancedHDWalletService();
        let privateKey;
        try {
            privateKey = hdWalletService.decryptPrivateKey(deposit.walletPrivateKey);
            console.log('✅ Private key decrypted successfully');
        } catch (error) {
            console.log('❌ Failed to decrypt private key:', error.message);
            return;
        }

        // Check real blockchain balances
        console.log('\n🔍 Checking blockchain balances...');
        const usdtSweepService = new USDTSweepService();
        
        try {
            const balances = await usdtSweepService.getWalletBalances(deposit.address, privateKey);
            
            console.log('💰 BLOCKCHAIN BALANCES:');
            console.log('  TRX:', balances.trx);
            console.log('  USDT:', balances.usdt);
            
            // Check if there's any change
            let hasUpdates = false;
            
            if (balances.usdt > 0) {
                if (deposit.actualAmount !== balances.usdt) {
                    console.log('📝 Updating actualAmount:', deposit.actualAmount, '→', balances.usdt);
                    deposit.actualAmount = balances.usdt;
                    hasUpdates = true;
                }
                
                if (deposit.status !== 'CONFIRMED') {
                    console.log('📝 Updating status: PENDING → CONFIRMED');
                    deposit.status = 'CONFIRMED';
                    hasUpdates = true;
                }
            } else {
                console.log('ℹ️ No USDT found yet');
            }
            
            if (hasUpdates) {
                await deposit.save();
                console.log('✅ Database updated successfully');
            } else {
                console.log('ℹ️ No updates needed');
            }
            
        } catch (error) {
            console.log('❌ Balance check failed:', error.message);
        }

        // Also check manually via TronScan
        console.log('\n🌐 TronScan Link for manual verification:');
        console.log(`https://tronscan.org/#/address/${deposit.address}`);
        
        // Check if this wallet is eligible for auto-sweep
        console.log('\n🎯 Auto-Sweep Eligibility:');
        const refreshedDeposit = await Deposit.findById(deposit._id);
        
        console.log('  Status:', refreshedDeposit.status);
        console.log('  Has Amount:', refreshedDeposit.actualAmount > 0);
        console.log('  Not Processed:', !refreshedDeposit.autoSweepProcessed);
        console.log('  Sweep Status:', refreshedDeposit.sweepStatus);
        
        const isEligible = refreshedDeposit.status === 'CONFIRMED' && 
                          refreshedDeposit.actualAmount > 0 && 
                          !refreshedDeposit.autoSweepProcessed && 
                          ['NONE', 'FAILED'].includes(refreshedDeposit.sweepStatus);
        
        console.log('  ✅ ELIGIBLE FOR AUTO-SWEEP:', isEligible);
        
        if (isEligible) {
            console.log('\n🚀 READY TO PROCESS!');
            console.log('💡 You can now run the auto-sweep process');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
    }
}

checkAndUpdateDeposit();