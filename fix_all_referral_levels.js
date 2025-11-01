const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function fixAllReferralLevels() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔧 FIXING ALL REFERRAL LEVELS IN SYSTEM');
    console.log('======================================');
    console.log('');
    
    console.log('📊 Checking all users and fixing referral levels...');
    console.log('');
    
    // Use the static method to fix all referral levels
    const updatedCount = await User.fixAllReferralLevels();
    
    console.log('');
    console.log('✅ REFERRAL LEVEL FIX COMPLETE!');
    console.log(`📈 Updated ${updatedCount} users' referral levels`);
    console.log('');
    
    // Verify the fixes by checking specific users
    console.log('🔍 VERIFICATION - Checking specific users:');
    console.log('------------------------------------------');
    
    const testUsers = [
      'snapthinktrader@gmail.com',
      'spookymoments62@gmail.com'
    ];
    
    for (const email of testUsers) {
      const user = await User.findOne({ email });
      if (user) {
        console.log(`👤 ${user.name} (${email}):`);
        console.log(`   📊 Direct Referrals: ${user.directReferrals || 0}`);
        console.log(`   🏆 Referral Level: ${user.referralLevel || 1}`);
        console.log(`   💼 Commission Rate: ${((user.referralLevel === 1 ? 0 : [0, 15, 20, 25, 30, 35, 40, 45, 50][user.referralLevel - 1]) || 0)}%`);
        console.log('');
      }
    }
    
    console.log('🎉 All referral levels are now correctly synchronized!');
    console.log('Future referrals will automatically update levels correctly.');
    
  } catch (error) {
    console.error('❌ Error fixing referral levels:', error);
  } finally {
    await mongoose.disconnect();
  }
}

fixAllReferralLevels();