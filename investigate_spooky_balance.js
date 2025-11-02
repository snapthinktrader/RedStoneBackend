require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Deposit = require('./src/models/Deposit');
const Transaction = require('./src/models/Transaction');

mongoose.connect(process.env.MONGODB_URI);

async function investigateSpookyBalance() {
  try {
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n=== USER DATA ===');
    console.log('Stored walletBalance:', user.walletBalance);
    console.log('Total Deposit:', user.totalDeposit);
    console.log('Lifetime Referral Earnings:', user.lifetimeReferralEarnings);
    console.log('Pending Commission:', user.pendingCommission);
    console.log('Daily Earning Rate:', user.dailyEarningRate);
    console.log('Last Earning Update:', user.lastEarningUpdate);
    console.log('Created At:', user.createdAt);
    
    // Check deposits
    console.log('\n=== DEPOSITS ===');
    const deposits = await Deposit.find({ userId: user._id, status: 'CONFIRMED' });
    console.log('Total deposits:', deposits.length);
    let totalDepositAmount = 0;
    for (const dep of deposits) {
      const processed = dep.processedAt || dep.createdAt;
      const daysSince = (Date.now() - processed) / (1000 * 60 * 60 * 24);
      console.log(`- $${dep.amount} deposited ${daysSince.toFixed(2)} days ago`);
      totalDepositAmount += dep.amount;
    }
    console.log('Sum of deposit amounts:', totalDepositAmount);
    
    // Check calculateRealTimeEarnings
    console.log('\n=== REAL-TIME EARNINGS CALCULATION ===');
    const earningsData = user.calculateRealTimeEarnings();
    console.log('calculatedBalance:', earningsData.calculatedBalance);
    console.log('pendingEarnings:', earningsData.pendingEarnings);
    console.log('lastUpdate:', earningsData.lastUpdate);
    console.log('ratePerSecond:', earningsData.ratePerSecond);
    console.log('dailyRate:', earningsData.dailyRate);
    
    // Manual calculation check
    const now = new Date();
    const lastUpdate = user.lastEarningUpdate || user.createdAt;
    const elapsedSeconds = Math.floor((now - lastUpdate) / 1000);
    const elapsedDays = elapsedSeconds / 86400;
    
    console.log('\n=== MANUAL CALCULATION ===');
    console.log('Time since last update:', elapsedDays.toFixed(2), 'days');
    console.log('Current balance for calculation:', user.walletBalance);
    console.log('Daily rate:', user.dailyEarningRate);
    
    // Simple interest calculation
    const simpleInterestEarnings = user.walletBalance * user.dailyEarningRate * elapsedDays;
    console.log('Simple interest earnings:', simpleInterestEarnings.toFixed(2));
    console.log('Expected balance (simple):', (user.walletBalance + simpleInterestEarnings).toFixed(2));
    
    // Compound interest calculation (if that's being used)
    const compoundBalance = user.walletBalance * Math.pow(1 + user.dailyEarningRate, elapsedDays);
    const compoundEarnings = compoundBalance - user.walletBalance;
    console.log('\nCompound interest earnings:', compoundEarnings.toFixed(2));
    console.log('Expected balance (compound):', compoundBalance.toFixed(2));
    
    // Check if there are any REFERRAL_COMMISSION transactions that might be double-counted
    console.log('\n=== CHECKING TRANSACTIONS ===');
    const refCommTxs = await Transaction.find({
      userId: user._id,
      type: 'REFERRAL_COMMISSION',
      status: 'COMPLETED'
    }).sort({ createdAt: -1 }).limit(10);
    
    console.log('Recent REFERRAL_COMMISSION transactions:', refCommTxs.length);
    let totalRefCommFromTx = 0;
    refCommTxs.forEach(tx => {
      console.log(`- $${tx.amount} on ${tx.createdAt.toISOString()}`);
      totalRefCommFromTx += tx.amount;
    });
    console.log('Total from transactions (last 10):', totalRefCommFromTx);
    
    // Check all commission transactions ever
    const allRefComm = await Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: 'REFERRAL_COMMISSION',
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    if (allRefComm.length > 0) {
      console.log('\nALL REFERRAL_COMMISSION transactions:');
      console.log('Count:', allRefComm[0].count);
      console.log('Total amount:', allRefComm[0].total);
      console.log('\n⚠️  WARNING: Old commission system may have added', allRefComm[0].total, 'to walletBalance!');
      console.log('This might be double-counted if also calculating real-time commission.');
    }
    
    console.log('\n=== DIAGNOSIS ===');
    console.log('Stored walletBalance:', user.walletBalance);
    console.log('Expected earnings (compound):', compoundEarnings.toFixed(2));
    console.log('Expected total:', (user.walletBalance + compoundEarnings + user.pendingCommission).toFixed(2));
    console.log('Actual API returns:', 12104.47);
    console.log('Difference:', (12104.47 - user.walletBalance - compoundEarnings - user.pendingCommission).toFixed(2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

investigateSpookyBalance();
