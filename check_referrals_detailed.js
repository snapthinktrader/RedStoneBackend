const mongoose = require('mongoose');
require('dotenv').config();

async function checkReferralDetails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    
    console.log('🔍 DETAILED REFERRAL CHECK FOR SPOOKYMOMENTS62');
    console.log('═'.repeat(70));
    
    const parent = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    if (!parent) {
      console.log('❌ User not found');
      await mongoose.connection.close();
      return;
    }
    
    console.log(`\n👤 USER: ${parent.email}`);
    console.log(`   Total Deposit: $${parent.totalDeposit}`);
    console.log(`   Wallet Balance: $${parent.walletBalance.toFixed(2)}`);
    
    // Get all referrals
    const allReferrals = await User.find({ 
      referredBy: parent._id 
    }).select('email totalDeposit isActive walletBalance createdAt');
    
    console.log(`\n👥 ALL REFERRALS (${allReferrals.length} total):`);
    console.log('─'.repeat(70));
    
    let activeLower = 0, activeUpper = 0, activeNoTrack = 0;
    let inactiveLower = 0, inactiveUpper = 0, inactiveNoTrack = 0;
    
    allReferrals.forEach((ref, i) => {
      const deposit = ref.totalDeposit || 0;
      const balance = ref.walletBalance || 0;
      const status = ref.isActive ? '✅ ACTIVE' : '❌ INACTIVE';
      let track = '';
      
      if (deposit >= 50) {
        track = 'UPPER ($50+)';
        if (ref.isActive) activeUpper++; else inactiveUpper++;
      } else if (deposit >= 15 && deposit < 50) {
        track = 'LOWER ($15-$49)';
        if (ref.isActive) activeLower++; else inactiveLower++;
      } else {
        track = 'NO TRACK (< $15)';
        if (ref.isActive) activeNoTrack++; else inactiveNoTrack++;
      }
      
      console.log(`\n${i+1}. ${ref.email}`);
      console.log(`   Status: ${status}`);
      console.log(`   Deposit: $${deposit.toFixed(2)} → ${track}`);
      console.log(`   Balance: $${balance.toFixed(2)}`);
      console.log(`   Joined: ${new Date(ref.createdAt).toLocaleDateString()}`);
    });
    
    console.log('\n' + '═'.repeat(70));
    console.log('📊 SUMMARY BY STATUS:');
    console.log('─'.repeat(70));
    
    console.log('\n✅ ACTIVE REFERRALS:');
    console.log(`   Lower Track ($15-$49): ${activeLower}`);
    console.log(`   Upper Track ($50+): ${activeUpper}`);
    console.log(`   No Track (< $15): ${activeNoTrack}`);
    console.log(`   TOTAL ACTIVE: ${activeLower + activeUpper + activeNoTrack}`);
    
    console.log('\n❌ INACTIVE REFERRALS:');
    console.log(`   Lower Track ($15-$49): ${inactiveLower}`);
    console.log(`   Upper Track ($50+): ${inactiveUpper}`);
    console.log(`   No Track (< $15): ${inactiveNoTrack}`);
    console.log(`   TOTAL INACTIVE: ${inactiveLower + inactiveUpper + inactiveNoTrack}`);
    
    console.log('\n💾 STORED IN DATABASE:');
    console.log(`   Lower Track: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
    console.log(`   Upper Track: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
    
    console.log('\n' + '═'.repeat(70));
    
    if (activeLower !== (parent.milestoneTracking?.lowerTrack?.count || 0) ||
        activeUpper !== (parent.milestoneTracking?.upperTrack?.count || 0)) {
      console.log('⚠️  DISCREPANCY FOUND!');
      console.log(`   Expected Lower: ${activeLower}, Stored: ${parent.milestoneTracking?.lowerTrack?.count || 0}`);
      console.log(`   Expected Upper: ${activeUpper}, Stored: ${parent.milestoneTracking?.upperTrack?.count || 0}`);
      console.log('\n🔧 Fixing now...');
      
      parent.milestoneTracking.lowerTrack.count = activeLower;
      parent.milestoneTracking.upperTrack.count = activeUpper;
      await parent.save();
      
      console.log(`✅ FIXED! Lower: ${activeLower}, Upper: ${activeUpper}`);
    } else {
      console.log('✅ Counts are correct!');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
  }
}

checkReferralDetails();
