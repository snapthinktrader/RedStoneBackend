const mongoose = require('mongoose');
require('dotenv').config();

async function fixMilestoneCounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const User = require('./src/models/User');
    
    // Get ALL users
    const allUsers = await User.find({ isActive: true }).select('email milestoneTracking referredBy');
    console.log(`\n📊 Found ${allUsers.length} active users\n`);
    console.log('━'.repeat(80));
    
    let fixed = 0;
    let unchanged = 0;
    let errors = 0;
    
    for (const user of allUsers) {
      try {
        // Get all direct referrals for this user
        const directReferrals = await User.find({
          referredBy: user._id,
          isActive: true
        }).select('totalDeposit');
        
        // Count referrals by track
        let lowerCount = 0;
        let upperCount = 0;
        
        directReferrals.forEach(ref => {
          const deposit = ref.totalDeposit || 0;
          if (deposit >= 50) {
            upperCount++;
          } else if (deposit >= 15 && deposit < 50) {
            lowerCount++;
          }
          // Note: Deposits < $15 don't count in any track
        });
        
        // Get current counts
        const currentLower = user.milestoneTracking?.lowerTrack?.count || 0;
        const currentUpper = user.milestoneTracking?.upperTrack?.count || 0;
        
        // Check if update needed
        const needsUpdate = (currentLower !== lowerCount) || (currentUpper !== upperCount);
        
        if (needsUpdate) {
          // Initialize milestone tracking if needed
          if (!user.milestoneTracking) {
            user.milestoneTracking = {
              lowerTrack: { count: 0, lastMilestoneClaimed: 0 },
              upperTrack: { count: 0, lastMilestoneClaimed: 0 }
            };
          }
          
          // Update counts
          user.milestoneTracking.lowerTrack.count = lowerCount;
          user.milestoneTracking.upperTrack.count = upperCount;
          
          await user.save();
          
          console.log(`✅ FIXED: ${user.email || user._id}`);
          console.log(`   Lower: ${currentLower} → ${lowerCount}`);
          console.log(`   Upper: ${currentUpper} → ${upperCount}`);
          console.log(`   Direct Referrals: ${directReferrals.length}`);
          console.log('');
          fixed++;
        } else {
          unchanged++;
        }
        
      } catch (err) {
        console.error(`❌ Error processing ${user.email}:`, err.message);
        errors++;
      }
    }
    
    console.log('━'.repeat(80));
    console.log('\n📈 SUMMARY:');
    console.log(`   ✅ Fixed: ${fixed} users`);
    console.log(`   ➖ Unchanged: ${unchanged} users`);
    console.log(`   ❌ Errors: ${errors} users`);
    console.log(`   📊 Total Processed: ${allUsers.length} users`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

fixMilestoneCounts();
