const mongoose = require('mongoose');
require('dotenv').config();

async function checkAllDeposits() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Deposit = require('./src/models/Deposit');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔍 CHECKING ALL DEPOSIT RECORDS');
    console.log('═'.repeat(60));
    
    const user = await User.findOne({ email: 'xenim77715@haotuwu.com' });
    
    console.log(`\n👤 User: ${user.email}`);
    console.log(`   User ID: ${user._id}`);
    console.log(`   Total Deposit: $${user.totalDeposit}`);
    
    // Check Deposit table
    const depositRecords = await Deposit.find({
      userId: user._id
    }).sort({ createdAt: 1 }).select('amount status balanceUpdated createdAt');
    
    console.log(`\n📋 DEPOSIT TABLE (${depositRecords.length} records):`);
    depositRecords.forEach((dep, i) => {
      console.log(`   ${i+1}. $${dep.amount} - Status: ${dep.status}, Updated: ${dep.balanceUpdated || false}`);
      console.log(`      Created: ${new Date(dep.createdAt).toLocaleString()}`);
    });
    
    // Check Transaction table
    const transactions = await Transaction.find({
      userId: user._id,
      type: 'DEPOSIT'
    }).sort({ createdAt: 1 }).select('amount status createdAt');
    
    console.log(`\n💳 TRANSACTION TABLE (${transactions.length} records):`);
    transactions.forEach((tx, i) => {
      console.log(`   ${i+1}. $${tx.amount} - Status: ${tx.status}`);
      console.log(`      Created: ${new Date(tx.createdAt).toLocaleString()}`);
    });
    
    console.log(`\n⚠️  DISCREPANCY ANALYSIS:`);
    const depositSum = depositRecords.reduce((sum, d) => sum + (d.status === 'CONFIRMED' && d.balanceUpdated ? d.amount : 0), 0);
    const txSum = transactions.reduce((sum, t) => sum + (t.status === 'COMPLETED' ? t.amount : 0), 0);
    
    console.log(`   Deposit table sum (CONFIRMED + balanceUpdated): $${depositSum}`);
    console.log(`   Transaction table sum (COMPLETED): $${txSum}`);
    console.log(`   User.totalDeposit: $${user.totalDeposit}`);
    
    if (user.totalDeposit !== txSum) {
      console.log(`\n❌ MISMATCH! totalDeposit ($${user.totalDeposit}) ≠ Transaction sum ($${txSum})`);
    } else {
      console.log(`\n✅ totalDeposit matches Transaction table`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

checkAllDeposits();
