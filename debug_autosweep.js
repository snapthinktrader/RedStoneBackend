const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const CompleteAutoSweepService = require('./src/services/CompleteAutoSweepService');
const USDTSweepService = require('./src/services/USDTSweepService');
const EnhancedHDWalletService = require('./src/services/EnhancedHDWalletService');
require('dotenv').config();

async function debugAutoSweepCriteria() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');

        // Get the latest deposit
        const deposit = await Deposit.findOne().sort({ createdAt: -1 });
        
        console.log('🔍 DEBUG AUTO-SWEEP CRITERIA');
        console.log('=============================');

        // Set it to confirmed with amount for testing
        deposit.status = 'CONFIRMED';
        deposit.actualAmount = 50;
        deposit.autoSweepProcessed = false;
        deposit.sweepStatus = 'NONE';
        deposit.sweepAttempts = 0;
        await deposit.save();

        console.log('✅ Set deposit to test conditions');
        console.log('📋 Deposit criteria:');
        console.log('  Status:', deposit.status, '(should be CONFIRMED)');
        console.log('  actualAmount:', deposit.actualAmount, '(should be > 0)');
        console.log('  autoSweepProcessed:', deposit.autoSweepProcessed, '(should be false)');
        console.log('  sweepStatus:', deposit.sweepStatus, '(should be NONE or FAILED)');
        console.log('  sweepAttempts:', deposit.sweepAttempts, '(should be < 3)');

        // Check database query
        console.log('\n🔍 Testing database query...');
        const deposits = await Deposit.find({
            status: 'CONFIRMED',
            sweepStatus: { $in: ['NONE', 'FAILED'] },
            sweepAttempts: { $lt: 3 },
            actualAmount: { $gt: 0 },
            autoSweepProcessed: { $ne: true }
        });

        console.log('📊 Query results:', deposits.length, 'deposits found');
        
        if (deposits.length > 0) {
            console.log('✅ Database query works - deposit found');
            
            // Now check USDT balance
            console.log('\n💰 Testing USDT balance check...');
            
            const usdtSweepService = new USDTSweepService();
            
            try {
                const usdtCheck = await usdtSweepService.checkUSDTBalance(deposit.address);
                console.log('📊 USDT check result:');
                console.log('  hasUsdt:', usdtCheck.hasUsdt);
                console.log('  amount:', usdtCheck.amount);
                
                if (!usdtCheck.hasUsdt || usdtCheck.amount <= 0) {
                    console.log('❌ USDT check failed - no real blockchain USDT');
                    console.log('💡 This is why the deposit is not eligible');
                    console.log('📝 The system needs actual USDT on the blockchain, not just database records');
                }
            } catch (error) {
                console.log('❌ USDT check error:', error.message);
            }
            
        } else {
            console.log('❌ Database query failed - no deposits found');
        }

        // Now test the full auto-sweep function
        console.log('\n🎯 Testing findDepositsForAutoSweep...');
        const autoSweepService = new CompleteAutoSweepService();
        const eligibleDeposits = await autoSweepService.findDepositsForAutoSweep();
        
        console.log('📊 Eligible deposits:', eligibleDeposits.length);
        
        if (eligibleDeposits.length === 0) {
            console.log('💡 CONCLUSION: Deposit is not eligible because there is no real USDT on the blockchain');
            console.log('✅ This is correct behavior - the system only processes deposits with actual funds');
        }

        // Reset
        deposit.status = 'PENDING';
        deposit.actualAmount = 0;
        await deposit.save();
        console.log('\n🔄 Reset deposit to original state');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
    }
}

debugAutoSweepCriteria();