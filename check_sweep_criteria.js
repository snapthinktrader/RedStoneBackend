const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
require('dotenv').config();

async function checkAutoSweepCriteria() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');

        const address = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
        const deposit = await Deposit.findOne({ address });

        console.log('🔍 Checking auto-sweep criteria for deposit:');
        console.log('📍 Address:', deposit.address);
        console.log('📊 Status:', deposit.status);
        console.log('🔄 Sweep Status:', deposit.sweepStatus);
        console.log('✅ Auto-Sweep Processed:', deposit.autoSweepProcessed);
        console.log('🎯 Expected Amount:', deposit.expectedAmount);
        console.log('💰 Actual Amount:', deposit.actualAmount);
        console.log('⏰ Created:', deposit.createdAt);
        console.log('🔚 Expires:', deposit.expiresAt);
        console.log('📅 Is Expired:', deposit.isExpired());

        // Check the auto-sweep criteria
        console.log('\n🔍 Auto-sweep criteria check:');
        console.log('1. Status is CONFIRMED:', deposit.status === 'CONFIRMED');
        console.log('2. Not expired:', !deposit.isExpired());
        console.log('3. Not already processed:', !deposit.autoSweepProcessed);
        console.log('4. Sweep status allows processing:', ['NONE', 'FAILED'].includes(deposit.sweepStatus));
        console.log('5. Has actual amount:', deposit.actualAmount > 0);

        const shouldProcess = deposit.status === 'CONFIRMED' && 
                            !deposit.isExpired() && 
                            !deposit.autoSweepProcessed && 
                            ['NONE', 'FAILED'].includes(deposit.sweepStatus) &&
                            deposit.actualAmount > 0;

        console.log('\n🎯 Should be processed:', shouldProcess);

        if (!shouldProcess) {
            console.log('\n🔧 Manual fix - updating sweep status...');
            deposit.sweepStatus = 'NONE';
            deposit.autoSweepProcessed = false;
            await deposit.save();
            console.log('✅ Reset sweep status to allow processing');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

checkAutoSweepCriteria();