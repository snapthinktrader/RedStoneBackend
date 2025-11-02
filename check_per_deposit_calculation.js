require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Deposit = require('./src/models/Deposit');

mongoose.connect(process.env.MONGODB_URI);

async function checkPerDepositCalculation() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== CHECKING PER-DEPOSIT EARNINGS ===');
    console.log('User:', user.email);
    console.log('Total Wallet Balance:', user.walletBalance);
    console.log('Daily Rate:', user.dailyEarningRate);
    
    // Get deposits
    const deposits = await Deposit.find({
      userId: user._id,
      status: 'CONFIRMED',
      balanceUpdated: true
    }).sort({ processedAt: 1 });
    
    console.log('\n=== DEPOSITS ===');
    console.log('Found', deposits.length, 'deposits');
    
    if (deposits.length === 0) {
      console.log('\n⚠️  NO DEPOSITS FOUND!');
      console.log('This explains why the calculation uses account creation date.');
      console.log('The $4,099 balance was likely added manually or through old system.');
      console.log('\nCurrent behavior:');
      console.log('- Treating $4,099 as if deposited on account creation (26.9 days ago)');
      console.log('- Using compound interest: $4,099 × (1.04)^26.9 = $11,772');
      console.log('\nThis is why balance is so high!');
    } else {
      console.log('\nCalculating earnings per deposit:');
      const now = new Date();
      const SECONDS_PER_DAY = 86400;
      let totalEarnings = 0;
      
      for (const dep of deposits) {
        const startTime = dep.processedAt || dep.createdAt;
        const daysSince = (now - startTime) / (1000 * 60 * 60 * 24);
        const secondsSince = Math.floor((now - startTime) / 1000);
        
        // Simple interest per deposit
        const simpleEarnings = dep.amount * user.dailyEarningRate * daysSince;
        
        // Compound interest per deposit
        const compoundFactor = Math.pow(1 + (user.dailyEarningRate / SECONDS_PER_DAY), secondsSince);
        const compoundEarnings = dep.amount * (compoundFactor - 1);
        
        console.log(`\nDeposit: $${dep.amount}`);
        console.log(`  Deposited: ${startTime.toISOString()} (${daysSince.toFixed(2)} days ago)`);
        console.log(`  Simple interest earnings: $${simpleEarnings.toFixed(2)}`);
        console.log(`  Compound interest earnings: $${compoundEarnings.toFixed(2)}`);
        
        totalEarnings += compoundEarnings;
      }
      
      console.log('\n=== TOTALS ===');
      console.log('Sum of deposits:', deposits.reduce((sum, d) => sum + d.amount, 0));
      console.log('Total pending earnings (compound per-deposit):', totalEarnings.toFixed(2));
      console.log('Expected balance:', (deposits.reduce((sum, d) => sum + d.amount, 0) + totalEarnings).toFixed(2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkPerDepositCalculation();
