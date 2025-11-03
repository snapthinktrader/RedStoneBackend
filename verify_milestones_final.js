const mongoose = require('mongoose');
require('dotenv').config();

async function verifyMilestones() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔍 VERIFYING MILESTONE COUNTS');
    console.log('═'.repeat(60));
    
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log(`\n👤 Parent: ${parent.email}`);
    console.log(`   Current Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Current Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    // Get all referrals
    const refs = await User.find({ referredBy: parent._id, isActive: true })
      .select('email totalDeposit');
    
    console.log(`\n👥 ANALYZING ${refs.length} REFERRALS (based on FIRST TRANSACTION):`);
    console.log('═'.repeat(60));
    
    let correctLower = 0;
    let correctUpper = 0;
    let noTrack = 0;
    
    for (const ref of refs) {
      // Get FIRST transaction
      const firstTx = await Transaction.findOne({
        userId: ref._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).sort({ createdAt: 1 }).select('amount createdAt');
      
      if (firstTx) {
        const firstAmount = firstTx.amount;
        let track = '';
        
        if (firstAmount >= 50) {
          track = 'UPPER ($50+)';
          correctUpper++;
        } else if (firstAmount >= 15 && firstAmount < 50) {
          track = 'LOWER ($15-$49)';
          correctLower++;
        } else {
          track = 'NONE (< $15)';
          noTrack++;
        }
        
        console.log(`\n${ref.email}`);
        console.log(`   totalDeposit: $${ref.totalDeposit}`);
        console.log(`   First Transaction: $${firstAmount} on ${new Date(firstTx.createdAt).toLocaleString()}`);
        console.log(`   → Track: ${track}`);
      } else {
        console.log(`\n${ref.email}`);
        console.log(`   totalDeposit: $${ref.totalDeposit}`);
        console.log(`   ⚠️  NO TRANSACTION FOUND`);
      }
    }
    
    console.log('\n═'.repeat(60));
    console.log('📊 CORRECT COUNTS (based on FIRST TRANSACTION):');
    console.log(`   Lower Track: ${correctLower}`);
    console.log(`   Upper Track: ${correctUpper}`);
    console.log(`   No Track: ${noTrack}`);
    
    console.log('\n💾 CURRENTLY STORED:');
    console.log(`   Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    if (correctLower === parent.milestoneTracking?.lowerTrack?.count && 
        correctUpper === parent.milestoneTracking?.upperTrack?.count) {
      console.log('\n✅ COUNTS ARE CORRECT!');
    } else {
      console.log('\n❌ COUNTS NEED FIXING!');
      console.log(`   Expected: Lower=${correctLower}, Upper=${correctUpper}`);
      console.log(`   Current: Lower=${parent.milestoneTracking?.lowerTrack?.count || 0}, Upper=${parent.milestoneTracking?.upperTrack?.count || 0}`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

verifyMilestones();
