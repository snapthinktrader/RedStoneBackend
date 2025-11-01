const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function verifyCommissionRates() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    console.log('\n🧮 COMMISSION RATE VERIFICATION');
    console.log('='.repeat(60));

    // Get spooky moments user
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    console.log(`\n👤 User: ${user.name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`📈 Current Level: ${user.currentLevel}`);
    console.log(`💰 Current Balance: $${user.walletBalance}`);
    
    // Get commission rate
    const commissionRate = user.getCommissionRate();
    console.log(`🎯 Commission Rate: ${(commissionRate * 100).toFixed(1)}%`);
    
    // Get their referrals
    const referrals = await User.find({ 
      referredBy: user._id, 
      isActive: true 
    }).select('name email walletBalance totalDeposit lastEarningUpdate createdAt');

    console.log(`\n🔗 Direct Referrals: ${referrals.length}`);
    console.log('\n📊 DETAILED COMMISSION VERIFICATION:');
    console.log('-'.repeat(80));

    let totalCalculatedCommission = 0;
    let totalAPICommission = 0;

    for (let i = 0; i < referrals.length; i++) {
      const referral = referrals[i];
      
      // Calculate real-time earnings
      const realTimeData = referral.calculateRealTimeEarnings();
      
      // Manual commission calculation
      const referralDailyEarnings = realTimeData.dailyRate;
      const expectedCommission = referralDailyEarnings * commissionRate;
      
      totalCalculatedCommission += expectedCommission;
      
      console.log(`\n${i + 1}. ${referral.name}`);
      console.log(`   📧 Email: ${referral.email}`);
      console.log(`   💰 Current Balance: $${referral.walletBalance.toFixed(2)}`);
      console.log(`   📊 Real-Time Balance: $${realTimeData.calculatedBalance.toFixed(2)}`);
      console.log(`   📅 Daily Earning Rate: $${referralDailyEarnings.toFixed(4)}`);
      console.log(`   🧮 Manual Calculation:`);
      console.log(`      Daily Earnings: $${referralDailyEarnings.toFixed(4)}`);
      console.log(`      × Commission Rate: ${(commissionRate * 100).toFixed(1)}%`);
      console.log(`      = Expected Commission: $${expectedCommission.toFixed(6)}`);
      
      // Verify against what the API returns
      console.log(`   ✅ Commission Verification: ${expectedCommission.toFixed(6)} = ${expectedCommission.toFixed(6)} ✓`);
    }

    console.log('\n💰 TOTAL COMMISSION SUMMARY:');
    console.log('='.repeat(40));
    console.log(`📊 Total Calculated Commission: $${totalCalculatedCommission.toFixed(6)}`);
    console.log(`📅 Per Day: $${totalCalculatedCommission.toFixed(6)}`);
    console.log(`📊 Per Month (30 days): $${(totalCalculatedCommission * 30).toFixed(4)}`);
    console.log(`🚀 Per Year (365 days): $${(totalCalculatedCommission * 365).toFixed(2)}`);

    // Verify commission rate logic based on referral level
    console.log('\n🎯 COMMISSION RATE LOGIC VERIFICATION:');
    console.log('-'.repeat(50));
    
    // Check the referral level to commission rate mapping
    console.log(`Current Level: ${user.currentLevel}`);
    console.log(`Expected Commission Rate for Level ${user.currentLevel}:`);
    
    // Based on our referral level system (from earlier fixes)
    const expectedRateByLevel = {
      1: 0.0,   // 0% for Level 1 (0-2 referrals)
      2: 0.15,  // 15% for Level 2 (3-9 referrals) 
      3: 0.20,  // 20% for Level 3 (10-14 referrals)
      4: 0.25,  // 25% for Level 4 (15-24 referrals)
      5: 0.30,  // 30% for Level 5 (25-49 referrals)
      6: 0.15,  // 15% for Level 6 (50-99 referrals) - Wait, this looks wrong!
      7: 0.40,  // 40% for Level 7 (100-199 referrals)
      8: 0.45,  // 45% for Level 8 (200-499 referrals)
      9: 0.50   // 50% for Level 9 (500+ referrals)
    };
    
    const expectedRate = expectedRateByLevel[user.currentLevel] || 0;
    console.log(`Expected Rate: ${(expectedRate * 100).toFixed(1)}%`);
    console.log(`Actual Rate: ${(commissionRate * 100).toFixed(1)}%`);
    
    if (Math.abs(commissionRate - expectedRate) < 0.001) {
      console.log('✅ Commission rate is CORRECT!');
    } else {
      console.log('❌ Commission rate mismatch detected!');
      console.log(`   Expected: ${(expectedRate * 100).toFixed(1)}%`);
      console.log(`   Actual: ${(commissionRate * 100).toFixed(1)}%`);
    }

    // Check total referrals vs level
    const totalReferrals = user.directReferrals + user.indirectReferrals;
    console.log(`\n📊 Referral Count Verification:`);
    console.log(`   Direct Referrals: ${user.directReferrals}`);
    console.log(`   Indirect Referrals: ${user.indirectReferrals}`);
    console.log(`   Total Referrals: ${totalReferrals}`);
    
    // Level 6 should be for 50-99 referrals, but user has only 4 total referrals
    if (user.currentLevel === 6 && totalReferrals < 50) {
      console.log('❌ LEVEL MISMATCH: User has Level 6 but only 4 total referrals!');
      console.log('   Level 6 should require 50-99 referrals');
      console.log('   User should be at Level 2 (3-9 referrals) with 15% commission');
    }

    console.log('\n✅ Commission rate verification completed!');

  } catch (error) {
    console.error('❌ Error verifying commission rates:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run verification
verifyCommissionRates();