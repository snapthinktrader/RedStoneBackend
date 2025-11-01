const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
require('dotenv').config();

async function checkMilestoneBonusForUser(userEmail) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`🔍 CHECKING MILESTONE BONUS FOR: ${userEmail}`);
    console.log('=============================================');
    
    // Find the user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`📧 User ID: ${user._id}`);
    console.log(`💰 Current Balance: $${user.walletBalance}`);
    console.log(`✅ Active: ${user.isActive}`);
    console.log('');
    
    // Count direct referrals (people they referred)
    const directReferrals = await User.find({
      referredBy: user._id,
      isActive: true
    }).select('name email createdAt walletBalance');
    
    console.log(`👥 DIRECT REFERRALS: ${directReferrals.length}`);
    console.log('-------------------------------------------');
    
    for (let i = 0; i < directReferrals.length; i++) {
      const referral = directReferrals[i];
      
      // Check if this referral has made deposits
      const deposits = await Transaction.find({
        userId: referral._id,
        type: 'DEPOSIT',
        status: 'COMPLETED'
      });
      
      const totalDeposits = deposits.reduce((sum, dep) => sum + dep.amount, 0);
      
      console.log(`${i + 1}. ${referral.name} (${referral.email})`);
      console.log(`   📅 Joined: ${referral.createdAt.toDateString()}`);
      console.log(`   💰 Balance: $${referral.walletBalance}`);
      console.log(`   💳 Total Deposits: $${totalDeposits}`);
      console.log(`   📊 Deposit Count: ${deposits.length}`);
      console.log('');
    }
    
    // Check milestone configuration
    const milestones = JSON.parse(process.env.MILESTONE_BONUSES || '{"10":100,"25":300,"50":750,"100":2000,"200":5000}');
    console.log('🎯 MILESTONE CONFIGURATION:');
    console.log('----------------------------');
    Object.entries(milestones).forEach(([count, bonus]) => {
      console.log(`${count} referrals → $${bonus} bonus`);
    });
    console.log('');
    
    // Check existing milestone bonuses
    const existingMilestoneBonuses = await Transaction.find({
      userId: user._id,
      type: 'MILESTONE_BONUS'
    }).sort({ createdAt: -1 });
    
    console.log(`🏆 MILESTONE BONUSES RECEIVED: ${existingMilestoneBonuses.length}`);
    console.log('--------------------------------------------');
    
    if (existingMilestoneBonuses.length > 0) {
      existingMilestoneBonuses.forEach(bonus => {
        console.log(`✅ $${bonus.amount} for ${bonus.metadata?.milestoneCount || 'Unknown'} referrals`);
        console.log(`   📅 Awarded: ${bonus.createdAt.toDateString()}`);
        console.log(`   📝 Description: ${bonus.description}`);
        console.log('');
      });
    } else {
      console.log('❌ No milestone bonuses received yet');
      console.log('');
    }
    
    // Check eligibility for milestone bonuses
    console.log('🎯 MILESTONE ELIGIBILITY CHECK:');
    console.log('--------------------------------');
    
    const sortedMilestones = Object.entries(milestones)
      .map(([count, bonus]) => [parseInt(count), bonus])
      .sort((a, b) => a[0] - b[0]);
    
    for (const [count, bonus] of sortedMilestones) {
      const isEligible = directReferrals.length >= count;
      const alreadyReceived = existingMilestoneBonuses.some(
        b => b.metadata?.milestoneCount === count
      );
      
      if (isEligible && !alreadyReceived) {
        console.log(`🚨 MISSING MILESTONE BONUS: ${count} referrals → $${bonus}`);
        console.log(`   Current referrals: ${directReferrals.length}`);
        console.log(`   Should receive: $${bonus}`);
        console.log('');
      } else if (isEligible && alreadyReceived) {
        console.log(`✅ Already received: ${count} referrals → $${bonus}`);
      } else {
        console.log(`⏳ Not eligible yet: ${count} referrals → $${bonus} (need ${count - directReferrals.length} more)`);
      }
    }
    
    // Check recent referral commissions
    const recentCommissions = await Transaction.find({
      userId: user._id,
      type: 'REFERRAL_COMMISSION'
    }).sort({ createdAt: -1 }).limit(10);
    
    console.log('');
    console.log(`💼 RECENT REFERRAL COMMISSIONS: ${recentCommissions.length}`);
    console.log('-------------------------------------------');
    
    if (recentCommissions.length > 0) {
      recentCommissions.forEach(commission => {
        console.log(`💰 $${commission.amount} - ${commission.description}`);
        console.log(`   📅 ${commission.createdAt.toDateString()}`);
        console.log('');
      });
    } else {
      console.log('❌ No referral commissions found');
    }
    
  } catch (error) {
    console.error('❌ Error checking milestone bonus:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Get user email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('Usage: node check_milestone_bonus.js <user_email>');
  console.log('Example: node check_milestone_bonus.js user@example.com');
  process.exit(1);
}

checkMilestoneBonusForUser(userEmail);