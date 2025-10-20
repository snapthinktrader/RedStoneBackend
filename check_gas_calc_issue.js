require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const GasFeeCalculatorService = require('./src/services/GasFeeCalculatorService');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const deposit = await Deposit.findById('68ea4394dd04208fb3feadd3');
  
  console.log('\n📋 Deposit Info:');
  console.log('Created:', deposit.createdAt);
  console.log('Amount:', deposit.amount, 'USDT');
  console.log('Address:', deposit.address);
  console.log('Gas Calculated:', deposit.gasFeesCalculated, 'TRX');
  
  console.log('\n🧪 Testing current gas calculation:');
  const gasCalc = new GasFeeCalculatorService();
  
  try {
    const result = await gasCalc.calculateSweepGasFees(
      deposit.address,
      'TDiFVNet9uxWu5ckvJCVHpc1qd5LMvbHNu', // Main wallet
      deposit.amount
    );
    
    console.log('\n✅ Current calculation result:');
    console.log('Total TRX needed:', result.trxNeeded);
    console.log('TRX to send:', result.trxToSend);
    console.log('Breakdown:', JSON.stringify(result.breakdown, null, 2));
  } catch (error) {
    console.error('\n❌ Gas calculation error:', error.message);
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
