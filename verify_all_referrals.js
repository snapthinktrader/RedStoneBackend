const mongoose = require('mongoose');
require('dotenv').config();

async function verifyAllReferrals() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔍 VERIFYING ALL REFERRALS WITH FIRST DEPOSIT');
    console.log('═'.repeat(60));
    
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    const refs = await User.find({ referredBy: parent._id, isActive: true })
      .select('email totalDeposit walletBalance');
    
    console.log(`\n👤 Parent: ${parent.email}`);
    console.log(`   Current Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Current Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    console.log(`\n👥 ANALYZING ${refs.length} REFERRALS:`);
    console.log('═'.repeat(60));
    
    let correctLower = 0;
    let correctUpper = 0;
    
    for (const ref of refs) {
      // Get ACTUAL first deposit from Transaction table
      const firstTx = await Transaction.findOne({
        userId: ref._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).sort({ createdAt: 1 }).select('amount createdAt');
      
      if (firstTx) {
        const firstDepositAmount = firstTx.amount;
        let track = 'NONE';
        
        if (firstDepositAmount >= 50) {
          track = 'UPPER';
          correctUpper++;
        } else if (firstDepositAmount >= 15) {
          track = 'LOWER';
          correctLower++;
        }
        
        console.log(`\n${ref.email}`);
        console.log(`   User totalDeposit: $${ref.totalDeposit}`);
        console.log(`   ACTUAL First Deposit: $${firstDepositAmount} on ${new Date(firstTx.createdAt).toLocaleString()}`);
        console.log(`   → Should count in: ${track} track`);
      } else {
        console.log(`\n${ref.email}`);
        console.log(`   User totalDeposit: $${ref.totalDeposit}`);
        console.log(`   ⚠️  NO TRANSACTION FOUND`);
      }
    }
    
    console.log('\n═'.repeat(60));
    console.log('📊 CORRECT COUNTS (based on ACTUAL first deposits):');
    console.log(`   Lower Track: ${correctLower}`);
    console.log(`   Upper Track: ${correctUpper}`);
    
    console.log('\n💾 STORED IN DATABASE:');
    console.log(`   Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    if (correctLower === parent.milestoneTracking?.lowerTrack?.count && 
        correctUpper === parent.milestoneTracking?.upperTrack?.count) {
      console.log('\n✅ COUNTS ARE CORRECT!');
    } else {
      console.log('\n❌ COUNTS MISMATCH!');
      console.log(`   Lower: Expected ${correctLower}, Got ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
      console.log(`   Upper: Expected ${correctUpper}, Got ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

verifyAllReferrals();
