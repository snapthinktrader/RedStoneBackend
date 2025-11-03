const mongoose = require('mongoose');
require('dotenv').config();

async function checkReferralTimeline() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    const user = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    const refs = await User.find({ referredBy: user._id, isActive: true })
      .select('email totalDeposit');
    
    console.log('🔍 REFERRAL DEPOSIT TIMELINE & RATE CHANGES');
    console.log('═'.repeat(80));
    
    for (const ref of refs) {
      console.log(`\n👤 ${ref.email}`);
      console.log(`   Current Total Deposit: $${ref.totalDeposit}`);
      
      // Get all deposits for this referral
      const deposits = await Transaction.find({
        userId: ref._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).select('amount createdAt').sort({ createdAt: 1 });
      
      console.log(`   Deposit History (${deposits.length} deposits):`);
      let runningTotal = 0;
      deposits.forEach((dep, i) => {
        runningTotal += dep.amount;
        const rate = runningTotal >= 10000 ? 5 : 
                     runningTotal >= 5000 ? 4.5 :
                     runningTotal >= 3500 ? 4 :
                     runningTotal >= 2000 ? 3.5 :
                     runningTotal >= 1000 ? 3 :
                     runningTotal >= 300 ? 2.5 :
                     runningTotal >= 50 ? 2 : 2;
        console.log(`   ${i+1}. ${new Date(dep.createdAt).toLocaleString()}: $${dep.amount}`);
        console.log(`      → Running Total: $${runningTotal}, Rate: ${rate}%`);
      });
    }
    
    console.log(`\n\n⚠️  PROBLEM IDENTIFIED:`);
    console.log(`═`.repeat(80));
    console.log(`Current backend calculation uses FINAL deposit amounts with FINAL rates`);
    console.log(`from the START of commission period.`);
    console.log(``);
    console.log(`Example: If referral deposited $300 on Oct 21 (2.5% rate)`);
    console.log(`         Then deposited $10,000 more on Nov 1 (now 5% rate)`);
    console.log(`         Current calc: Uses 5% rate for entire Oct 21 - Nov 2 period`);
    console.log(`         Correct calc: Use 2.5% for Oct 21-31, then 5% for Nov 1-2`);
    console.log(``);
    console.log(`✅ SOLUTION: Backend needs to track referral deposit events as timeline`);
    console.log(`            events and recalculate commission for each period!`);
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
  }
}

checkReferralTimeline();
