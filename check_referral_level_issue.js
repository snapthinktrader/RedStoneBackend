const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
require('dotenv').config();

async function checkReferralLevelIssue(userEmail) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`🔍 CHECKING REFERRAL LEVEL ISSUE FOR: ${userEmail}`);
    console.log('================================================');
    console.log('');
    
    // Find the user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`📧 User ID: ${user._id}`);
    console.log(`🏆 Current Referral Level: ${user.referralLevel || 1}`);
    console.log(`💰 Current Balance: $${user.walletBalance}`);
    console.log(`📊 Stored Direct Referrals: ${user.directReferrals || 0}`);
    console.log(`📊 Stored Indirect Referrals: ${user.indirectReferrals || 0}`);
    console.log('');
    
    // Count actual direct referrals
    const actualDirectReferrals = await User.find({
      referredBy: user._id,
      isActive: true
    });
    
    console.log(`👥 ACTUAL DIRECT REFERRALS: ${actualDirectReferrals.length}`);
    console.log('------------------------------------------');
    
    for (let i = 0; i < actualDirectReferrals.length; i++) {
      const referral = actualDirectReferrals[i];
      
      // Check deposits for each referral
      const deposits = await Transaction.find({
        userId: referral._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      });
      
      const totalDeposits = deposits.reduce((sum, dep) => sum + dep.amount, 0);
      
      console.log(`${i + 1}. ${referral.name} (${referral.email})`);
      console.log(`   📅 Joined: ${referral.createdAt.toDateString()}`);
      console.log(`   ✅ Active: ${referral.isActive}`);
      console.log(`   💰 Balance: $${referral.walletBalance}`);
      console.log(`   💳 Total Deposits: $${totalDeposits}`);
      console.log(`   📊 Deposit Count: ${deposits.length}`);
      console.log('');
    }
    
    // Check referral level calculation logic
    console.log('📈 REFERRAL LEVEL CALCULATION:');
    console.log('-------------------------------');
    
    // From User model referral level logic
    const referralCount = actualDirectReferrals.length;
    let expectedReferralLevel = 1;
    
    if (referralCount >= 1000) expectedReferralLevel = 9;       // Level 9: 1000 referrals
    else if (referralCount >= 500) expectedReferralLevel = 8;   // Level 8: 500 referrals
    else if (referralCount >= 100) expectedReferralLevel = 7;   // Level 7: 100 referrals
    else if (referralCount >= 50) expectedReferralLevel = 6;    // Level 6: 50 referrals
    else if (referralCount >= 25) expectedReferralLevel = 5;    // Level 5: 25 referrals
    else if (referralCount >= 15) expectedReferralLevel = 4;    // Level 4: 15 referrals
    else if (referralCount >= 10) expectedReferralLevel = 3;    // Level 3: 10 referrals
    else if (referralCount >= 3) expectedReferralLevel = 2;     // Level 2: 3 referrals
    else expectedReferralLevel = 1;                             // Level 1: 0-2 referrals
    
    console.log(`📊 Actual Referral Count: ${referralCount}`);
    console.log(`🎯 Expected Referral Level: ${expectedReferralLevel}`);
    console.log(`🏆 Current Referral Level: ${user.referralLevel || 1}`);
    
    if (expectedReferralLevel > (user.referralLevel || 1)) {
      console.log(`🚨 LEVEL MISMATCH DETECTED!`);
      console.log(`   Should be Level ${expectedReferralLevel}, but is Level ${user.referralLevel || 1}`);
      console.log('   This indicates the referral level update logic is not working properly.');
    } else {
      console.log('✅ Referral level appears correct for current referral count');
    }
    
    console.log('');
    
    // Check referral commission rates
    console.log('💼 REFERRAL COMMISSION RATES:');
    console.log('------------------------------');
    
    const commissionRates = {
      1: { direct: 0.00, indirect: 0.00 },  // Level 1: 0% commission
      2: { direct: 0.15, indirect: 0.02 },  // Level 2: 15% direct, 2% indirect
      3: { direct: 0.20, indirect: 0.03 },  // Level 3: 20% direct, 3% indirect
      4: { direct: 0.25, indirect: 0.04 },  // Level 4: 25% direct, 4% indirect
      5: { direct: 0.30, indirect: 0.05 },  // Level 5: 30% direct, 5% indirect
      6: { direct: 0.35, indirect: 0.06 },  // Level 6: 35% direct, 6% indirect
      7: { direct: 0.40, indirect: 0.07 },  // Level 7: 40% direct, 7% indirect
      8: { direct: 0.45, indirect: 0.08 },  // Level 8: 45% direct, 8% indirect
      9: { direct: 0.50, indirect: 0.10 },  // Level 9: 50% direct, 10% indirect
    };
    
    const currentLevel = user.referralLevel || 1;
    const expectedLevel = expectedReferralLevel;
    
    console.log(`Current Level ${currentLevel}:`);
    console.log(`   Direct Commission: ${(commissionRates[currentLevel].direct * 100).toFixed(1)}%`);
    console.log(`   Indirect Commission: ${(commissionRates[currentLevel].indirect * 100).toFixed(1)}%`);
    
    console.log(`Expected Level ${expectedLevel}:`);
    console.log(`   Direct Commission: ${(commissionRates[expectedLevel].direct * 100).toFixed(1)}%`);
    console.log(`   Indirect Commission: ${(commissionRates[expectedLevel].indirect * 100).toFixed(1)}%`);
    
    if (expectedLevel > currentLevel) {
      const directDiff = (commissionRates[expectedLevel].direct - commissionRates[currentLevel].direct) * 100;
      const indirectDiff = (commissionRates[expectedLevel].indirect - commissionRates[currentLevel].indirect) * 100;
      console.log(`💰 MISSING COMMISSION POTENTIAL:`);
      console.log(`   Direct: +${directDiff.toFixed(1)}% commission rate`);
      console.log(`   Indirect: +${indirectDiff.toFixed(1)}% commission rate`);
    }
    
    console.log('');
    
    // Check if we need to manually update the level
    if (expectedReferralLevel > (user.referralLevel || 1)) {
      console.log('🔧 FIXING REFERRAL LEVEL:');
      console.log('-------------------------');
      
      await User.findByIdAndUpdate(user._id, {
        referralLevel: expectedReferralLevel,
        directReferrals: referralCount
      });
      
      console.log(`✅ Updated referral level from ${user.referralLevel || 1} to ${expectedReferralLevel}`);
      console.log(`✅ Updated direct referral count to ${referralCount}`);
      
      const updatedUser = await User.findById(user._id);
      console.log(`🎉 New Level: ${updatedUser.referralLevel}`);
      console.log(`📊 New Direct Commission Rate: ${(commissionRates[expectedReferralLevel].direct * 100).toFixed(1)}%`);
      console.log(`📊 New Indirect Commission Rate: ${(commissionRates[expectedReferralLevel].indirect * 100).toFixed(1)}%`);
    }
    
    // Check recent referral commissions
    console.log('');
    console.log('💼 RECENT REFERRAL COMMISSIONS:');
    console.log('--------------------------------');
    
    const recentCommissions = await Transaction.find({
      userId: user._id,
      type: 'REFERRAL_COMMISSION'
    }).sort({ createdAt: -1 }).limit(10);
    
    if (recentCommissions.length > 0) {
      recentCommissions.forEach(commission => {
        console.log(`💰 $${commission.amount} - ${commission.description}`);
        console.log(`   📅 ${commission.createdAt.toDateString()}`);
      });
    } else {
      console.log('❌ No referral commissions found');
      console.log('   This might indicate the commission system is not working properly');
    }
    
  } catch (error) {
    console.error('❌ Error checking referral level issue:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Get user email from command line argument
const userEmail = process.argv[2] || 'spookymoments62@gmail.com';

checkReferralLevelIssue(userEmail);