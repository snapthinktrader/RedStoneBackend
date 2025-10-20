require('dotenv').config();
const mongoose = require('mongoose');
const Deposit = require('./src/models/Deposit');
const { TronWeb } = require('tronweb');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const deposit = await Deposit.findById('68ea4394dd04208fb3feadd3');
  
  console.log('\n📋 STUCK DEPOSIT ANALYSIS');
  console.log('═══════════════════════════════════════════════════════');
  
  console.log('\n💾 Database Info:');
  console.log('Deposit ID:', deposit._id);
  console.log('Amount:', deposit.amount, 'USDT');
  console.log('Status:', deposit.status);
  console.log('Sweep Status:', deposit.sweepStatus);
  console.log('Created:', deposit.createdAt);
  
  console.log('\n🏦 Wallet Address:');
  const walletAddress = deposit.address || deposit.walletBackup?.address;
  console.log('Address:', walletAddress);
  
  console.log('\n💰 Previous Gas Fees:');
  console.log('Calculated:', deposit.gasFeesCalculated, 'TRX');
  console.log('Sent:', deposit.gasFeesSent, 'TRX');
  console.log('Gas TX Hash:', deposit.gasTxHash);
  
  console.log('\n🔄 Previous Sweep Attempts:');
  console.log('Sweep TX Hash:', deposit.sweepTransactionHash);
  console.log('Attempts:', deposit.sweepAttempts);
  console.log('Last Attempt:', deposit.lastSweepAttempt);
  console.log('Error:', deposit.sweepError);
  
  console.log('\n📊 CURRENT BLOCKCHAIN STATUS:');
  console.log('═══════════════════════════════════════════════════════');
  
  // Get current TRX balance
  try {
    const trxBalance = await tronWeb.trx.getBalance(walletAddress);
    const trxAmount = tronWeb.fromSun(trxBalance);
    console.log('\n💵 TRX Balance:', trxAmount, 'TRX');
  } catch (error) {
    console.log('\n❌ Error fetching TRX balance:', error.message);
  }
  
  // Get current USDT balance
  try {
    const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const contract = await tronWeb.contract().at(usdtContract);
    const usdtBalance = await contract.balanceOf(walletAddress).call();
    const usdtAmount = tronWeb.toBigNumber(usdtBalance).div(1000000).toNumber();
    console.log('💵 USDT Balance:', usdtAmount, 'USDT');
  } catch (error) {
    console.log('❌ Error fetching USDT balance:', error.message);
  }
  
  console.log('\n🎯 REQUIRED ACTION:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Need ~16.38 TRX for sweep (currently has 2.001 TRX)');
  console.log('Missing: ~14.38 TRX');
  console.log('\nOptions:');
  console.log('1. Send additional 14.5 TRX to wallet and retry sweep');
  console.log('2. Reset deposit status to allow auto-sweep to retry');
  console.log('3. Manual sweep using script');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
