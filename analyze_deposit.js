require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const deposit = await Deposit.findById('68ea4394dd04208fb3feadd3');
  
  console.log('\n📋 Deposit Analysis:');
  console.log('ID:', deposit._id);
  console.log('Amount:', deposit.amount, 'USDT');
  console.log('Status:', deposit.status);
  console.log('Sweep Status:', deposit.sweepStatus);
  
  console.log('\n💰 Gas Fees:');
  console.log('Calculated:', deposit.gasFeesCalculated, 'TRX');
  console.log('Sent:', deposit.gasFeesSent, 'TRX');
  console.log('TX Hash:', deposit.gasTxHash);
  
  console.log('\n🔄 Sweep Info:');
  console.log('Sweep TX:', deposit.sweepTransactionHash);
  console.log('Sweep Error:', deposit.sweepError);
  console.log('Attempts:', deposit.sweepAttempts);
  
  console.log('\n🏦 Wallet:');
  console.log('Address (direct):', deposit.address);
  console.log('Address (depositAddress):', deposit.depositAddress);
  console.log('Address (walletBackup):', deposit.walletBackup?.address);
  console.log('Has privateKey:', !!deposit.walletPrivateKey);
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
