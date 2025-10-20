const mongoose = require('mongoose');
const CompleteAutoSweepService = require('./src/services/CompleteAutoSweepService');
const Deposit = require('./src/models/Deposit');
require('dotenv').config();

async function processSpecificDeposit() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📊 Connected to database');

        const address = 'TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa';
        const deposit = await Deposit.findOne({ address });
        
        if (!deposit) {
            throw new Error('Deposit not found');
        }

        console.log('✅ Found deposit for processing');
        console.log('💰 Amount:', deposit.actualAmount, 'USDT');

        const autoSweepService = new CompleteAutoSweepService();
        
        console.log('🚀 Processing single deposit...');
        await autoSweepService.processSingleDeposit(deposit);
        
        console.log('✅ Deposit processing completed');

        // Check final status
        const updatedDeposit = await Deposit.findOne({ address });
        console.log('\n📊 Final Status:');
        console.log('🔄 Sweep Status:', updatedDeposit.sweepStatus);
        console.log('✅ Auto-Sweep Processed:', updatedDeposit.autoSweepProcessed);
        console.log('⛽ Gas Fees Sent:', updatedDeposit.gasFeesSent);
        console.log('🔗 Gas TX Hash:', updatedDeposit.gasTxHash);
        console.log('💸 Sweep TX Hash:', updatedDeposit.sweepTxHash);
        console.log('💰 Swept Amount:', updatedDeposit.sweptAmount);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

processSpecificDeposit();