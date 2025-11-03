const mongoose = require('mongoose');
require('dotenv').config();

async function checkUserHistory() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    const Deposit = require('./src/models/Deposit');
    
    console.log('🔍 DEEP DIVE INTO USER HISTORY');
    console.log('═'.repeat(60));
    
    const user = await User.findOne({ email: 'xenim77715@haotuwu.com' });
    
    console.log(`\n👤 USER DOCUMENT:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}`);
    console.log(`   Updated: ${new Date(user.updatedAt).toLocaleString()}`);
    console.log(`   Total Deposit: $${user.totalDeposit}`);
    console.log(`   Wallet Balance: $${user.walletBalance}`);
    console.log(`   Referred By: ${user.referredBy}`);
    
    // Check if user was created with initial balance
    if (user.createdAt === user.updatedAt && user.totalDeposit > 0) {
      console.log(`\n⚠️  User created WITH initial totalDeposit of $${user.totalDeposit}`);
      console.log(`   This means totalDeposit was set during user creation!`);
    }
    
    // Get parent info
    if (user.referredBy) {
      const parent = await User.findById(user.referredBy).select('email');
      console.log(`\n👨‍👩‍👧 PARENT: ${parent.email}`);
    }
    
    // All transactions
    const allTx = await Transaction.find({ userId: user._id })
      .sort({ createdAt: 1 })
      .select('type amount status createdAt metadata description');
    
    console.log(`\n💳 ALL TRANSACTIONS (${allTx.length}):`);
    if (allTx.length === 0) {
      console.log(`   ⚠️  NO TRANSACTIONS!`);
    } else {
      allTx.forEach((tx, i) => {
        console.log(`\n   ${i+1}. ${tx.type} - $${tx.amount} (${tx.status})`);
        console.log(`      Date: ${new Date(tx.createdAt).toLocaleString()}`);
        if (tx.description) console.log(`      Description: ${tx.description}`);
        if (tx.metadata) {
          console.log(`      Metadata:`, JSON.stringify(tx.metadata, null, 2));
        }
      });
    }
    
    // Check Deposit table
    const deposits = await Deposit.find({ userId: user._id })
      .sort({ createdAt: 1 })
      .select('amount status createdAt balanceUpdated');
    
    console.log(`\n📋 DEPOSIT RECORDS (${deposits.length}):`);
    if (deposits.length === 0) {
      console.log(`   ⚠️  NO DEPOSIT RECORDS!`);
    } else {
      deposits.forEach((d, i) => {
        console.log(`   ${i+1}. $${d.amount} - ${d.status} (Updated: ${d.balanceUpdated})`);
      });
    }
    
    console.log(`\n═`.repeat(60));
    console.log(`\n💡 CONCLUSION:`);
    
    const txSum = allTx.filter(t => t.type === 'DEPOSIT' && t.status === 'COMPLETED')
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (txSum === 0 && user.totalDeposit > 0) {
      console.log(`   ❌ User has $${user.totalDeposit} totalDeposit but $0 in deposit transactions`);
      console.log(`   This was either:`);
      console.log(`   1. Set during user creation (signup with referral bonus?)`);
      console.log(`   2. Manually updated in MongoDB database`);
      console.log(`   3. Added through a different code path that doesn't create transactions`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

checkUserHistory();
