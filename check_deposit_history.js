const mongoose = require('mongoose');
require('dotenv').config();

async function checkDepositHistory() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔍 CHECKING DEPOSIT HISTORY');
    console.log('═'.repeat(60));
    
    const user = await User.findOne({ email: 'xenim77715@haotuwu.com' });
    
    if (!user) {
      console.log('❌ User not found');
      await mongoose.connection.close();
      return;
    }
    
    console.log(`\n👤 User: ${user.email}`);
    console.log(`   Total Deposit: $${user.totalDeposit}`);
    console.log(`   Wallet Balance: $${user.walletBalance}`);
    console.log(`   Referred By: ${user.referredBy || 'None'}`);
    
    // Get all deposits from Transaction table
    const deposits = await Transaction.find({
      userId: user._id,
      type: 'DEPOSIT',
      status: 'COMPLETED'
    }).sort({ createdAt: 1 }).select('amount createdAt status');
    
    console.log(`\n📅 DEPOSIT HISTORY (${deposits.length} deposits):`);
    
    let runningTotal = 0;
    deposits.forEach((dep, i) => {
      runningTotal += dep.amount;
      console.log(`   ${i+1}. $${dep.amount} on ${new Date(dep.createdAt).toLocaleString()}`);
      console.log(`      Running Total: $${runningTotal}`);
    });
    
    console.log(`\n💡 FIRST DEPOSIT ANALYSIS:`);
    if (deposits.length > 0) {
      const firstDeposit = deposits[0];
      console.log(`   First Deposit: $${firstDeposit.amount}`);
      console.log(`   Date: ${new Date(firstDeposit.createdAt).toLocaleString()}`);
      
      if (firstDeposit.amount >= 50) {
        console.log(`   ✅ First deposit $${firstDeposit.amount} ≥ $50 → UPPER TRACK`);
      } else if (firstDeposit.amount >= 15) {
        console.log(`   ✅ First deposit $${firstDeposit.amount} ≥ $15 → LOWER TRACK`);
      } else {
        console.log(`   ❌ First deposit $${firstDeposit.amount} < $15 → NO TRACK`);
      }
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

checkDepositHistory();
