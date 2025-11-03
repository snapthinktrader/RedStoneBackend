const mongoose = require('mongoose');
require('dotenv').config();

async function checkUserWallet() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    // Find the user
    const user = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('\n👤 USER: snapthinktrader@gmail.com');
    console.log('━'.repeat(80));
    
    console.log('\n💰 WALLET BALANCES:');
    console.log('   Wallet Balance:', user.walletBalance);
    console.log('   Stored Balance:', user.storedBalance);
    console.log('   Pending Earnings:', user.pendingEarnings);
    console.log('   Pending Own Earnings:', user.pendingOwnEarnings);
    console.log('   Pending Referral Commission:', user.pendingReferralCommission);
    
    console.log('\n📊 ACCOUNT INFO:');
    console.log('   Total Deposits:', user.totalDeposit);
    console.log('   Deposit Level:', user.currentLevel, '-', user.levelName);
    console.log('   Daily Rate:', (user.dailyEarningRate * 100) + '%');
    console.log('   Direct Referrals:', user.directReferrals);
    console.log('   Indirect Referrals:', user.indirectReferrals);
    console.log('   Commission Rate:', (user.getCommissionRate() * 100) + '%');
    
    // Get all transactions
    console.log('\n📋 ALL TRANSACTIONS:');
    const transactions = await Transaction.find({
      userId: user._id,
      status: 'COMPLETED'
    }).select('type amount description createdAt').sort({ createdAt: 1 });
    
    let totalDeposits = 0;
    let totalBonuses = 0;
    let totalWithdrawals = 0;
    
    transactions.forEach((tx, index) => {
      console.log(`\n${index + 1}. ${tx.type}`);
      console.log(`   Amount: $${tx.amount}`);
      console.log(`   Description: ${tx.description || 'N/A'}`);
      console.log(`   Date: ${new Date(tx.createdAt).toLocaleString()}`);
      
      if (tx.type === 'DEPOSIT') {
        totalDeposits += tx.amount;
      } else if (tx.type === 'PROMOTIONAL_BONUS' || tx.type === 'MILESTONE_BONUS') {
        totalBonuses += tx.amount;
      } else if (tx.type === 'WITHDRAWAL') {
        totalWithdrawals += tx.amount;
      }
    });
    
    console.log('\n━'.repeat(80));
    console.log('📊 TRANSACTION SUMMARY:');
    console.log('   Total Deposits:', totalDeposits);
    console.log('   Total Bonuses:', totalBonuses);
    console.log('   Total Withdrawals:', totalWithdrawals);
    console.log('   Net Balance (Deposits + Bonuses - Withdrawals):', totalDeposits + totalBonuses - totalWithdrawals);
    
    // Calculate real-time earnings
    console.log('\n⏱️  CALCULATING REAL-TIME EARNINGS...');
    const earnings = await user.calculateRealTimeEarnings();
    
    console.log('\n💎 CALCULATED EARNINGS:');
    console.log('   Calculated Balance:', earnings.calculatedBalance?.toFixed(2) || '0.00');
    console.log('   Own Earnings:', earnings.pendingOwnEarnings?.toFixed(2) || '0.00');
    console.log('   Referral Commission:', earnings.pendingReferralCommission?.toFixed(2) || '0.00');
    console.log('   Daily Commission Rate:', earnings.dailyReferralCommission?.toFixed(2) || '0.00');
    
    // Get referral details
    console.log('\n👥 REFERRAL DETAILS:');
    const directReferrals = await User.find({
      referredBy: user._id,
      isActive: true
    }).select('email totalDeposit walletBalance currentLevel levelName createdAt');
    
    if (directReferrals.length > 0) {
      directReferrals.forEach((ref, index) => {
        console.log(`\n${index + 1}. ${ref.email}`);
        console.log(`   Total Deposit: $${ref.totalDeposit}`);
        console.log(`   Wallet Balance: $${ref.walletBalance}`);
        console.log(`   Level: ${ref.currentLevel} - ${ref.levelName}`);
        console.log(`   Joined: ${new Date(ref.createdAt).toLocaleDateString()}`);
      });
      
      // Check first referral deposit time
      const Transaction = require('./src/models/Transaction');
      const firstRefDeposit = await Transaction.findOne({
        userId: { $in: directReferrals.map(r => r._id) },
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).sort({ createdAt: 1 });
      
      if (firstRefDeposit) {
        console.log('\n⏰ COMMISSION START TIME:');
        console.log('   First Referral Deposit:', new Date(firstRefDeposit.createdAt).toLocaleString());
        console.log('   Commission should start from this date, NOT from account creation');
      }
    } else {
      console.log('   No direct referrals found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

checkUserWallet();
