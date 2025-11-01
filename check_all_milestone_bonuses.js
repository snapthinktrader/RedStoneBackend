const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
require('dotenv').config();

async function checkAllMilestoneBonuses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔍 CHECKING ALL USERS FOR MILESTONE BONUS ELIGIBILITY');
    console.log('=====================================================');
    console.log('');
    
    // Get milestone configuration
    const milestones = JSON.parse(process.env.MILESTONE_BONUSES || '{"10":100,"25":300,"50":750,"100":2000,"200":5000}');
    console.log('🎯 MILESTONE CONFIGURATION:');
    Object.entries(milestones).forEach(([count, bonus]) => {
      console.log(`   ${count} referrals → $${bonus} bonus`);
    });
    console.log('');
    
    // Find all users
    const allUsers = await User.find({ isActive: true }).select('name email _id');
    
    console.log(`👥 Total Active Users: ${allUsers.length}`);
    console.log('');
    
    let usersWithMissingBonuses = [];
    
    for (const user of allUsers) {
      // Count direct referrals
      const directReferrals = await User.find({
        referredBy: user._id,
        isActive: true
      });
      
      if (directReferrals.length >= 3) { // Only check users with 3+ referrals
        
        // Check how many have made deposits
        let referralsWithDeposits = 0;
        for (const referral of directReferrals) {
          const deposits = await Transaction.countDocuments({
            userId: referral._id,
            type: 'DEPOSIT',
            status: 'COMPLETED'
          });
          if (deposits > 0) {
            referralsWithDeposits++;
          }
        }
        
        // Check existing milestone bonuses
        const existingMilestoneBonuses = await Transaction.find({
          userId: user._id,
          type: 'MILESTONE_BONUS'
        });
        
        console.log(`👤 ${user.name} (${user.email})`);
        console.log(`   📊 Direct Referrals: ${directReferrals.length}`);
        console.log(`   💳 Referrals with Deposits: ${referralsWithDeposits}`);
        console.log(`   🏆 Milestone Bonuses Received: ${existingMilestoneBonuses.length}`);
        
        // Check for missing bonuses
        let missingBonuses = [];
        for (const [count, bonus] of Object.entries(milestones)) {
          const milestoneCount = parseInt(count);
          const isEligible = directReferrals.length >= milestoneCount;
          const alreadyReceived = existingMilestoneBonuses.some(
            b => b.metadata?.milestoneCount === milestoneCount
          );
          
          if (isEligible && !alreadyReceived) {
            missingBonuses.push({ count: milestoneCount, bonus });
          }
        }
        
        if (missingBonuses.length > 0) {
          console.log(`   🚨 MISSING BONUSES:`);
          missingBonuses.forEach(({ count, bonus }) => {
            console.log(`      ${count} referrals → $${bonus}`);
          });
          usersWithMissingBonuses.push({
            user,
            referralCount: directReferrals.length,
            referralsWithDeposits,
            missingBonuses
          });
        } else {
          console.log(`   ✅ All eligible bonuses received`);
        }
        
        if (existingMilestoneBonuses.length > 0) {
          console.log(`   🎁 Received Bonuses:`);
          existingMilestoneBonuses.forEach(bonus => {
            console.log(`      $${bonus.amount} for ${bonus.metadata?.milestoneCount || 'Unknown'} referrals (${bonus.createdAt.toDateString()})`);
          });
        }
        
        console.log('');
      }
    }
    
    console.log('');
    console.log('📋 SUMMARY OF MISSING MILESTONE BONUSES:');
    console.log('=======================================');
    
    if (usersWithMissingBonuses.length === 0) {
      console.log('✅ All eligible users have received their milestone bonuses!');
    } else {
      console.log(`⚠️  Found ${usersWithMissingBonuses.length} users with missing milestone bonuses:`);
      console.log('');
      
      usersWithMissingBonuses.forEach((item, index) => {
        console.log(`${index + 1}. ${item.user.name} (${item.user.email})`);
        console.log(`   📊 ${item.referralCount} referrals (${item.referralsWithDeposits} with deposits)`);
        console.log(`   🚨 Missing bonuses:`);
        item.missingBonuses.forEach(({ count, bonus }) => {
          console.log(`      → $${bonus} for ${count} referrals`);
        });
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking milestone bonuses:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkAllMilestoneBonuses();