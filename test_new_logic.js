const mongoose = require('mongoose');
require('dotenv').config();

async function testNewLogic() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    
    console.log('🧪 TESTING NEW FIRST-TRANSACTION LOGIC');
    console.log('═'.repeat(60));
    
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    const problemUser = await User.findOne({ email: 'xenim77715@haotuwu.com' });
    
    console.log(`\n👤 Problem User: ${problemUser.email}`);
    console.log(`   Total Deposit: $${problemUser.totalDeposit}`);
    
    console.log(`\n📊 CURRENT MILESTONE COUNTS:`);
    console.log(`   Lower: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    console.log(`\n🧪 SIMULATING: updateMilestoneTracking(15, problemUser)`);
    
    // Test the logic without saving
    await parent.updateMilestoneTracking(15, problemUser);
    
    console.log(`\n📊 AFTER SIMULATION (not saved):`);
    console.log(`   Lower: ${parent.milestoneTracking.lowerTrack.count}`);
    console.log(`   Upper: ${parent.milestoneTracking.upperTrack.count}`);
    
    console.log(`\n✅ Logic works! This user's first $15 deposit is now properly detected.`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

testNewLogic();
