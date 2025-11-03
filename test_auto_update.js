const mongoose = require('mongoose');
require('dotenv').config();

async function testAutoUpdate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    
    console.log('🧪 TESTING AUTO-UPDATE FIX');
    console.log('═'.repeat(60));
    
    // Get spookymoments62 (the referrer/parent)
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n📊 BEFORE TEST:');
    console.log(`   Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    // Test calling updateMilestoneTracking on the PARENT (as Deposit.js does)
    console.log('\n🔧 CALLING updateMilestoneTracking() on PARENT...');
    await parent.updateMilestoneTracking(15); // depositAmount doesn't matter, we recalculate all
    
    // Reload to see updated values
    const updated = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n📊 AFTER TEST:');
    console.log(`   Lower Track: ${updated.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${updated.milestoneTracking?.upperTrack?.count || 0}`);
    
    // Verify counts are correct
    const refs = await User.find({ referredBy: updated._id, isActive: true })
      .select('email totalDeposit');
    
    console.log('\n✅ VERIFICATION:');
    let expectedLower = 0, expectedUpper = 0;
    refs.forEach(ref => {
      const deposit = ref.totalDeposit || 0;
      if (deposit >= 50) expectedUpper++;
      else if (deposit >= 15 && deposit < 50) expectedLower++;
    });
    
    console.log(`   Expected Lower: ${expectedLower}, Got: ${updated.milestoneTracking.lowerTrack.count}`);
    console.log(`   Expected Upper: ${expectedUpper}, Got: ${updated.milestoneTracking.upperTrack.count}`);
    
    if (expectedLower === updated.milestoneTracking.lowerTrack.count &&
        expectedUpper === updated.milestoneTracking.upperTrack.count) {
      console.log('\n✅ AUTO-UPDATE IS WORKING CORRECTLY!');
    } else {
      console.log('\n❌ COUNTS MISMATCH!');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

testAutoUpdate();
