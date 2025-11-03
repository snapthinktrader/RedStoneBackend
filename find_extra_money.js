const mongoose = require('mongoose');
require('dotenv').config();

async function findExtraMoney() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔍 TRACING THE EXTRA $1080');
    console.log('═'.repeat(60));
    
    const user = await User.findOne({ email: 'xenim77715@haotuwu.com' });
    
    console.log(`\n👤 User: ${user.email}`);
    console.log(`   User ID: ${user._id}`);
    console.log(`   Total Deposit: $${user.totalDeposit}`);
    console.log(`   Wallet Balance: $${user.walletBalance}`);
    console.log(`   Created At: ${new Date(user.createdAt).toLocaleString()}`);
    
    // Get ALL transactions for this user
    const allTransactions = await Transaction.find({
      userId: user._id
    }).sort({ createdAt: 1 }).select('type amount status createdAt description');
    
    console.log(`\n📜 ALL TRANSACTIONS (${allTransactions.length} total):`);
    
    let runningBalance = 0;
    allTransactions.forEach((tx, i) => {
      const sign = ['DEPOSIT', 'COMMISSION', 'BONUS', 'REFERRAL_BONUS'].includes(tx.type) ? '+' : '-';
      const change = sign === '+' ? tx.amount : -tx.amount;
      runningBalance += change;
      
      console.log(`\n${i+1}. ${tx.type} - ${sign}$${tx.amount} (${tx.status})`);
      console.log(`   Date: ${new Date(tx.createdAt).toLocaleString()}`);
      if (tx.description) console.log(`   Description: ${tx.description}`);
      console.log(`   Running Balance: $${runningBalance.toFixed(2)}`);
    });
    
    console.log('\n═'.repeat(60));
    console.log('💰 BALANCE ANALYSIS:');
    
    const deposits = allTransactions.filter(t => t.type === 'DEPOSIT' && t.status === 'COMPLETED');
    const bonuses = allTransactions.filter(t => ['BONUS', 'REFERRAL_BONUS', 'MILESTONE_BONUS'].includes(t.type));
    const commissions = allTransactions.filter(t => t.type === 'COMMISSION');
    const withdrawals = allTransactions.filter(t => t.type === 'WITHDRAWAL');
    
    const depositSum = deposits.reduce((sum, t) => sum + t.amount, 0);
    const bonusSum = bonuses.reduce((sum, t) => sum + t.amount, 0);
    const commissionSum = commissions.reduce((sum, t) => sum + t.amount, 0);
    const withdrawalSum = withdrawals.reduce((sum, t) => sum + t.amount, 0);
    
    console.log(`   Deposits: $${depositSum}`);
    console.log(`   Bonuses: $${bonusSum}`);
    console.log(`   Commissions: $${commissionSum}`);
    console.log(`   Withdrawals: $${withdrawalSum}`);
    console.log(`   Net: $${depositSum + bonusSum + commissionSum - withdrawalSum}`);
    
    console.log(`\n📊 DISCREPANCY:`);
    console.log(`   User.totalDeposit: $${user.totalDeposit}`);
    console.log(`   Actual Deposits: $${depositSum}`);
    console.log(`   Extra Amount: $${user.totalDeposit - depositSum}`);
    
    // Check if there were any direct database updates
    console.log(`\n🔍 CHECKING FOR MANUAL UPDATES:`);
    console.log(`   User last updated: ${new Date(user.updatedAt).toLocaleString()}`);
    
    if (bonuses.length > 0) {
      console.log(`\n💡 FOUND ${bonuses.length} BONUS TRANSACTIONS:`);
      bonuses.forEach(b => {
        console.log(`   - $${b.amount} ${b.type} on ${new Date(b.createdAt).toLocaleString()}`);
      });
      console.log(`\n   ⚠️  Bonuses may have been added to totalDeposit incorrectly`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

findExtraMoney();
