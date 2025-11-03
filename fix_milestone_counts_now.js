const mongoose = require('mongoose');
require('dotenv').config();

async function fixMilestoneCounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔧 FIXING MILESTONE COUNTS');
    console.log('═'.repeat(60));
    
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log(`\n📊 BEFORE FIX:`);
    console.log(`   Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    // Get all referrals
    const refs = await User.find({ referredBy: parent._id, isActive: true });
    
    let correctLower = 0;
    let correctUpper = 0;
    
    console.log(`\n🔍 RECALCULATING FROM FIRST TRANSACTIONS...`);
    
    for (const ref of refs) {
      // Get FIRST transaction
      const firstTx = await Transaction.findOne({
        userId: ref._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).sort({ createdAt: 1 }).select('amount');
      
      if (firstTx) {
        if (firstTx.amount >= 50) {
          correctUpper++;
        } else if (firstTx.amount >= 15 && firstTx.amount < 50) {
          correctLower++;
        }
      }
    }
    
    console.log(`   Calculated: Lower=${correctLower}, Upper=${correctUpper}`);
    
    // Update parent's milestone tracking
    if (!parent.milestoneTracking) {
      parent.milestoneTracking = {
        lowerTrack: { count: 0, lastMilestoneClaimed: 0, claimedMilestones: [] },
        upperTrack: { count: 0, lastMilestoneClaimed: 0, claimedMilestones: [] }
      };
    }
    
    parent.milestoneTracking.lowerTrack.count = correctLower;
    parent.milestoneTracking.upperTrack.count = correctUpper;
    
    await parent.save();
    
    console.log(`\n✅ FIXED!`);
    console.log(`   Lower Track: ${correctLower}`);
    console.log(`   Upper Track: ${correctUpper}`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

fixMilestoneCounts();
