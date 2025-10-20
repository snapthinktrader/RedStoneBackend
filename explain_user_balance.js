require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Deposit = require('./src/models/Deposit');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('\n💰 USER BALANCE EXPLANATION');
  console.log('═══════════════════════════════════════════════════════');
  
  // Find user
  const user = await User.findOne({ email: 'snapthinktrader@gmail.com' });
  
  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }
  
  console.log(`\n📊 Current User Balance:`);
  console.log(`User: ${user.name || user.username}`);
  console.log(`Email: ${user.email}`);
  
  // Calculate real-time earnings
  const earningsData = user.calculateRealTimeEarnings();
  
  console.log(`\n💵 Balance Breakdown:`);
  console.log(`Stored Balance: $${user.walletBalance.toFixed(2)}`);
  console.log(`Last Earning Update: ${user.lastEarningUpdate || 'Never set'}`);
  console.log(`  Elapsed: ${(earningsData.elapsedSeconds / 3600).toFixed(2)} hours`);
  console.log(`  Earnings: $${(earningsData.earnings || 0).toFixed(2)}`);
  console.log(`Real-time Balance: $${(earningsData.calculatedBalance || user.walletBalance).toFixed(2)}`);
  
  console.log('\n📋 Finding all deposits for this user...');
  const deposits = await Deposit.find({ userId: user._id }).sort({ createdAt: 1 });
  
  console.log(`\nTotal Deposits Found: ${deposits.length}\n`);
  
  let totalDeposited = 0;
  
  deposits.forEach((deposit, index) => {
    console.log(`─────────────────────────────────────────────────────`);
    console.log(`Deposit #${index + 1}:`);
    console.log(`  ID: ${deposit._id}`);
    console.log(`  Amount: $${deposit.amount}`);
    console.log(`  Status: ${deposit.status}`);
    console.log(`  Network: ${deposit.network}`);
    console.log(`  Created: ${deposit.createdAt}`);
    console.log(`  Wallet: ${deposit.address || deposit.walletBackup?.address || 'N/A'}`);
    
    if (deposit.status === 'COMPLETED' || deposit.status === 'CONFIRMED') {
      totalDeposited += deposit.amount;
      console.log(`  ✅ Added to balance`);
    } else {
      console.log(`  ⏳ Not yet added to balance`);
    }
  });
  
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`📊 SUMMARY:`);
  console.log(`═══════════════════════════════════════════════════════`);
  const earnings = earningsData.earnings || 0;
  const calculatedBalance = earningsData.calculatedBalance || user.walletBalance;
  
  console.log(`\nTotal Deposited (COMPLETED/CONFIRMED): $${totalDeposited.toFixed(2)}`);
  console.log(`Stored in walletBalance: $${user.walletBalance.toFixed(2)}`);
  console.log(`\n💹 Earnings Calculation (2% daily compound):`);
  console.log(`  Base Amount: $${user.walletBalance.toFixed(2)}`);
  console.log(`  Time Period: ${(earningsData.elapsedSeconds / 3600).toFixed(2)} hours`);
  console.log(`  Earnings Rate: 2% per day = 0.000023148% per second`);
  console.log(`  Earnings Accrued: $${earnings.toFixed(2)}`);
  console.log(`\n🎯 Current Display Balance: $${calculatedBalance.toFixed(2)}`);
  
  console.log(`\n💡 Explanation:`);
  if (calculatedBalance > totalDeposited) {
    const difference = calculatedBalance - totalDeposited;
    console.log(`The balance shows $${calculatedBalance.toFixed(2)} instead of $${totalDeposited.toFixed(2)} because:`);
    console.log(`  1. You deposited: $${totalDeposited.toFixed(2)}`);
    console.log(`  2. Earnings accrued: +$${earnings.toFixed(2)}`);
    console.log(`  3. Difference: $${difference.toFixed(2)} (earnings)`);
    console.log(`\nThe system is working correctly with 2% daily compound interest! 📈`);
  } else if (user.walletBalance > totalDeposited) {
    console.log(`There may be additional deposits or manual adjustments.`);
    console.log(`Check deposit history for all transactions.`);
  } else {
    console.log(`Balance matches expected amount from deposits.`);
  }
  
  console.log(`\n═══════════════════════════════════════════════════════\n`);
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
