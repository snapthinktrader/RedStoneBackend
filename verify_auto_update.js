const mongoose = require('mongoose');
require('dotenv').config();

async function verifyAutoUpdate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    
    console.log('🔍 VERIFYING AUTO-UPDATE MECHANISM');
    console.log('═'.repeat(60));
    
    // Get spookymoments62 and the two $15 referrals
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    const ref1 = await User.findOne({ email: 'falebo9140@hh7f.com' });
    const ref2 = await User.findOne({ email: 'mevihad372@haotuwu.com' });
    
    console.log('\n📅 DEPOSIT TIMELINE:');
    
    if (ref1) {
      const deposits1 = await Transaction.find({
        userId: ref1._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).sort({ createdAt: 1 });
      
      console.log(`\n1️⃣  ${ref1.email} (Total: $${ref1.totalDeposit})`);
      deposits1.forEach(d => {
        console.log(`   ✓ $${d.amount} on ${new Date(d.createdAt).toLocaleString()}`);
      });
    }
    
    if (ref2) {
      const deposits2 = await Transaction.find({
        userId: ref2._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }).sort({ createdAt: 1 });
      
      console.log(`\n2️⃣  ${ref2.email} (Total: $${ref2.totalDeposit})`);
      deposits2.forEach(d => {
        console.log(`   ✓ $${d.amount} on ${new Date(d.createdAt).toLocaleString()}`);
      });
    }
    
    console.log(`\n💾 CURRENT MILESTONE TRACKING:`);
    console.log(`   Lower Track: ${user.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${user.milestoneTracking?.upperTrack?.count || 0}`);
    console.log(`   Last Updated: ${user.updatedAt}`);
    
    // Check if updateMilestoneTracking is properly implemented
    console.log(`\n🔧 CHECKING updateMilestoneTracking METHOD:`);
    const methodExists = typeof user.updateMilestoneTracking === 'function';
    console.log(`   Method exists: ${methodExists ? '✅' : '❌'}`);
    
    if (methodExists) {
      console.log(`\n🧪 TESTING AUTO-UPDATE (DRY RUN):`);
      console.log(`   Calling updateMilestoneTracking()...`);
      
      await user.updateMilestoneTracking();
      
      console.log(`   ✅ Method executed successfully`);
      console.log(`   Updated Lower Track: ${user.milestoneTracking.lowerTrack.count}`);
      console.log(`   Updated Upper Track: ${user.milestoneTracking.upperTrack.count}`);
    }
    
    // Check where it's being called
    console.log(`\n📍 WHERE AUTO-UPDATE SHOULD TRIGGER:`);
    console.log(`   1. Deposit.js line 329 - When referral deposits`);
    console.log(`   2. adminRoutes.js line 199 - When admin adds deposit`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

verifyAutoUpdate();
