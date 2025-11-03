const mongoose = require('mongoose');
require('dotenv').config();

async function checkLowerTrack() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log('🔍 CHECKING LOWER TRACK COUNT');
    console.log('═'.repeat(60));
    
    // Get all referrals
    const refs = await User.find({ referredBy: user._id, isActive: true })
      .select('email totalDeposit');
    
    console.log('\n👥 ALL REFERRALS:');
    let lowerCount = 0;
    let upperCount = 0;
    let noTrack = 0;
    
    refs.forEach((ref, i) => {
      const deposit = ref.totalDeposit || 0;
      let track = '';
      
      if (deposit >= 50) {
        track = 'UPPER ($50+)';
        upperCount++;
      } else if (deposit >= 15 && deposit < 50) {
        track = 'LOWER ($15-$49)';
        lowerCount++;
      } else {
        track = 'NO TRACK (< $15)';
        noTrack++;
      }
      
      console.log(`${i+1}. ${ref.email}: $${deposit} → ${track}`);
    });
    
    console.log(`\n📊 CALCULATED COUNTS:`);
    console.log(`   Lower Track ($15-$49): ${lowerCount}`);
    console.log(`   Upper Track ($50+): ${upperCount}`);
    console.log(`   No Track (< $15): ${noTrack}`);
    
    console.log(`\n💾 STORED IN DATABASE:`);
    console.log(`   Lower Track: ${user.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${user.milestoneTracking?.upperTrack?.count || 0}`);
    
    if (lowerCount !== (user.milestoneTracking?.lowerTrack?.count || 0)) {
      console.log(`\n⚠️  MISMATCH DETECTED!`);
      console.log(`   Expected Lower: ${lowerCount}`);
      console.log(`   Stored Lower: ${user.milestoneTracking?.lowerTrack?.count || 0}`);
      console.log(`   `);
      console.log(`   The fix is deployed but database hasn't updated yet.`);
      console.log(`   Updating now...`);
      
      // Update the counts
      user.milestoneTracking.lowerTrack.count = lowerCount;
      user.milestoneTracking.upperTrack.count = upperCount;
      await user.save();
      
      console.log(`\n✅ UPDATED! Lower: ${lowerCount}, Upper: ${upperCount}`);
    } else {
      console.log(`\n✅ Counts are correct!`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
  }
}

checkLowerTrack();
