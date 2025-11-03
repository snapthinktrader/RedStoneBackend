const mongoose = require('mongoose');
require('dotenv').config();

async function debugReferralCounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    
    console.log('🔍 DEBUGGING REFERRAL COUNT DISCREPANCY');
    console.log('═'.repeat(60));
    
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('\n👤 PARENT USER: spookymoments62@gmail.com');
    console.log(`   Stored Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Stored Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    console.log(`   Total Referrals Field: ${parent.totalReferrals || 0}`);
    
    // Get ALL users who claim this parent as referrer
    const allRefs = await User.find({ referredBy: parent._id })
      .select('email isActive totalDeposit');
    
    console.log(`\n📋 ALL USERS WITH referredBy = ${parent._id}:`);
    console.log(`   Total found: ${allRefs.length}`);
    
    let activeLower = 0, activeUpper = 0, activeNone = 0;
    let inactiveLower = 0, inactiveUpper = 0, inactiveNone = 0;
    
    allRefs.forEach((ref, i) => {
      const deposit = ref.totalDeposit || 0;
      let track = '';
      
      if (deposit >= 50) {
        track = 'UPPER ($50+)';
        if (ref.isActive) activeUpper++;
        else inactiveUpper++;
      } else if (deposit >= 15 && deposit < 50) {
        track = 'LOWER ($15-$49)';
        if (ref.isActive) activeLower++;
        else inactiveLower++;
      } else {
        track = 'NO TRACK (< $15)';
        if (ref.isActive) activeNone++;
        else inactiveNone++;
      }
      
      console.log(`   ${i+1}. ${ref.email}`);
      console.log(`      Status: ${ref.isActive ? '✅ ACTIVE' : '❌ INACTIVE'}`);
      console.log(`      Deposit: $${deposit} → ${track}`);
    });
    
    console.log(`\n📊 COUNT BREAKDOWN:`);
    console.log(`   ACTIVE Users:`);
    console.log(`      Lower ($15-$49): ${activeLower}`);
    console.log(`      Upper ($50+): ${activeUpper}`);
    console.log(`      No Track (< $15): ${activeNone}`);
    console.log(`   `);
    console.log(`   INACTIVE Users:`);
    console.log(`      Lower ($15-$49): ${inactiveLower}`);
    console.log(`      Upper ($50+): ${inactiveUpper}`);
    console.log(`      No Track (< $15): ${inactiveNone}`);
    
    console.log(`\n🎯 WHAT updateMilestoneTracking SHOULD CALCULATE:`);
    console.log(`   Query: { referredBy: ${parent._id}, isActive: true }`);
    console.log(`   Expected Lower: ${activeLower}`);
    console.log(`   Expected Upper: ${activeUpper}`);
    
    console.log(`\n💾 WHAT'S STORED IN DATABASE:`);
    console.log(`   Stored Lower: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Stored Upper: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    if (activeLower !== (parent.milestoneTracking?.lowerTrack?.count || 0) ||
        activeUpper !== (parent.milestoneTracking?.upperTrack?.count || 0)) {
      console.log(`\n❌ DISCREPANCY FOUND!`);
      console.log(`   The stored counts don't match the calculated counts.`);
      console.log(`   This means updateMilestoneTracking() is not calculating correctly.`);
    } else {
      console.log(`\n✅ NO DISCREPANCY - Counts are correct!`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

debugReferralCounts();
