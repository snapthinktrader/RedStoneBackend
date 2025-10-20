require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const depositId = '68ea4394dd04208fb3feadd3';
  const deposit = await Deposit.findById(depositId);
  
  console.log('\n🔧 PREPARING STUCK DEPOSIT FOR RETRY');
  console.log('═══════════════════════════════════════════════════════');
  
  console.log('\n📋 Current Status:');
  console.log('Deposit ID:', depositId);
  console.log('Wallet:', deposit.address);
  console.log('Amount:', deposit.amount, 'USDT');
  console.log('Current Status:', deposit.status);
  console.log('Current Sweep Status:', deposit.sweepStatus);
  console.log('Sweep Attempts:', deposit.sweepAttempts);
  
  console.log('\n💰 Current Balances:');
  console.log('TRX:', '0 TRX (consumed in failed attempts)');
  console.log('USDT:', '10 USDT (still in wallet)');
  
  console.log('\n🎯 Action Required:');
  console.log('1. Send 16.5 TRX to wallet: TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa');
  console.log('2. Reset deposit status to allow auto-sweep retry');
  console.log('3. Auto-sweep will process within 30 seconds');
  
  console.log('\n❓ Do you want to reset the deposit status? (y/n)');
  console.log('This will:');
  console.log('  - Change status from CONFIRMED to CONFIRMED');
  console.log('  - Change sweepStatus from SWEPT to FAILED');
  console.log('  - Clear sweep error');
  console.log('  - Allow auto-sweep to pick it up again');
  
  // Update deposit to allow retry
  await Deposit.findByIdAndUpdate(depositId, {
    sweepStatus: 'FAILED',
    sweepError: 'Insufficient gas - awaiting manual gas top-up',
    lastSweepAttempt: new Date()
  });
  
  console.log('\n✅ Deposit updated and ready for retry!');
  console.log('\nNext Steps:');
  console.log('1. Send 16.5 TRX to: TSf6zjTxDDWkh45jQKdLbgNBWmH1DKKbZa');
  console.log('2. Wait 30 seconds for auto-sweep to detect and process');
  console.log('3. Monitor with: node check_stuck_deposit.js');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
