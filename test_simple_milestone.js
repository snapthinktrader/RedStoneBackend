const mongoose = require('mongoose');
require('dotenv').config();

async function testSimpleMilestone() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    
    console.log('🧪 TESTING SIMPLE MILESTONE LOGIC');
    console.log('═'.repeat(60));
    
    // Get spookymoments62 and their referrals
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    const refs = await User.find({ referredBy: parent._id, isActive: true })
      .select('email totalDeposit');
    
    console.log('\n📊 CURRENT STATE:');
    console.log(`   Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    console.log('\n👥 ALL REFERRALS:');
    refs.forEach((ref, i) => {
      const deposit = ref.totalDeposit || 0;
      let track = '';
      if (deposit >= 50) track = 'UPPER';
      else if (deposit >= 15) track = 'LOWER';
      else track = 'NONE';
      console.log(`   ${i+1}. ${ref.email}: $${deposit} → ${track}`);
    });
    
    console.log('\n✅ EXPECTED COUNTS:');
    let expectedLower = 0, expectedUpper = 0;
    refs.forEach(ref => {
      const deposit = ref.totalDeposit || 0;
      if (deposit >= 50) expectedUpper++;
      else if (deposit >= 15 && deposit < 50) expectedLower++;
    });
    console.log(`   Lower Track: ${expectedLower}`);
    console.log(`   Upper Track: ${expectedUpper}`);
    
    // Simulate what happens on FIRST deposit
    console.log('\n🧪 SIMULATING FIRST DEPOSIT LOGIC:');
    
    // Example: New referral deposits $15 (first deposit)
    const mockReferral = { totalDeposit: 15 }; // totalDeposit = depositAmount means FIRST deposit
    
    console.log('   Simulating: New referral deposits $15 (FIRST deposit)');
    parent.updateMilestoneTracking(15, mockReferral);
    
    console.log('\n📊 AFTER SIMULATION:');
    console.log(`   Lower Track: ${parent.milestoneTracking.lowerTrack.count}`);
    console.log(`   Upper Track: ${parent.milestoneTracking.upperTrack.count}`);
    
    // Don't save - just testing
    console.log('\n✅ TEST COMPLETE (not saved to database)');
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

testSimpleMilestone();
