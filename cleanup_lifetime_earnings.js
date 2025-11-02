/**
 * Cleanup Script: Remove Incorrect Lifetime Earnings
 * 
 * This script recalculates lifetime referral earnings based on the NEW per-deposit calculation method.
 * Old method: All deposits earned from earliest deposit time (WRONG)
 * New method: Each deposit earns from its own confirmation time (CORRECT)
 * 
 * Run: node cleanup_lifetime_earnings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Deposit = require('./src/models/Deposit');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/redstone';
const SECONDS_PER_DAY = 86400;

async function calculateCorrectLifetimeEarnings(userId) {
  try {
    // Get all confirmed deposits for this user
    const deposits = await Deposit.find({
      userId: userId,
      status: 'CONFIRMED',
      balanceUpdated: true
    }).sort({ processedAt: 1 });

    if (deposits.length === 0) {
      return 0;
    }

    const now = new Date();
    const dailyRate = 0.02; // 2% daily
    const ratePerSecond = dailyRate / SECONDS_PER_DAY;
    
    let totalLifetimeEarnings = 0;

    // Calculate earnings for each deposit separately
    for (const deposit of deposits) {
      const depositStartTime = deposit.processedAt || deposit.createdAt;
      const secondsSinceDeposit = Math.floor((now - depositStartTime) / 1000);
      
      if (secondsSinceDeposit <= 0) continue;
      
      const earningsFromThisDeposit = deposit.amount * ratePerSecond * secondsSinceDeposit;
      totalLifetimeEarnings += earningsFromThisDeposit;
    }

    return totalLifetimeEarnings;

  } catch (error) {
    console.error(`Error calculating for user ${userId}:`, error.message);
    return 0;
  }
}

async function cleanupLifetimeEarnings() {
  console.log('🔄 Starting Lifetime Earnings Cleanup...\n');
  console.log('=' .repeat(80));
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all users who have referrals (referees)
    const usersWithReferrals = await User.find({
      totalReferrals: { $gt: 0 }
    }).select('email totalReferrals');

    console.log(`📊 Found ${usersWithReferrals.length} users with referrals\n`);
    
    let updatedCount = 0;
    let totalOldEarnings = 0;
    let totalNewEarnings = 0;
    const updates = [];

    for (const user of usersWithReferrals) {
      // Get all active referrals for this user
      const referrals = await User.find({
        referredBy: user._id,
        isActive: true
      });

      if (referrals.length === 0) continue;

      const myCommissionRate = 0.15; // 15% commission
      let newLifetimeEarnings = 0;

      // Calculate correct earnings from each referral
      for (const referral of referrals) {
        const referralEarnings = await calculateCorrectLifetimeEarnings(referral._id);
        const myCommissionFromThisReferral = referralEarnings * myCommissionRate;
        newLifetimeEarnings += myCommissionFromThisReferral;
      }

      const oldLifetimeEarnings = user.lifetimeReferralEarnings || 0;
      
      // Only update if there's a significant difference (more than $0.01)
      if (Math.abs(oldLifetimeEarnings - newLifetimeEarnings) > 0.01) {
        updates.push({
          email: user.email,
          oldEarnings: oldLifetimeEarnings.toFixed(2),
          newEarnings: newLifetimeEarnings.toFixed(2),
          difference: (newLifetimeEarnings - oldLifetimeEarnings).toFixed(2)
        });

        // Update the user's lifetime earnings
        user.lifetimeReferralEarnings = newLifetimeEarnings;
        await user.save();

        totalOldEarnings += oldLifetimeEarnings;
        totalNewEarnings += newLifetimeEarnings;
        updatedCount++;

        console.log(`✏️  ${user.email}`);
        console.log(`   Old: $${oldLifetimeEarnings.toFixed(2)} → New: $${newLifetimeEarnings.toFixed(2)} (${newLifetimeEarnings > oldLifetimeEarnings ? '+' : ''}${(newLifetimeEarnings - oldLifetimeEarnings).toFixed(2)})`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📋 CLEANUP SUMMARY\n');
    console.log(`Total users checked: ${usersWithReferrals.length}`);
    console.log(`Users updated: ${updatedCount}`);
    console.log(`Total old earnings: $${totalOldEarnings.toFixed(2)}`);
    console.log(`Total new earnings: $${totalNewEarnings.toFixed(2)}`);
    console.log(`Net difference: ${totalNewEarnings > totalOldEarnings ? '+' : ''}$${(totalNewEarnings - totalOldEarnings).toFixed(2)}`);
    
    if (updates.length > 0) {
      console.log('\n📊 DETAILED CHANGES:');
      console.log('-'.repeat(80));
      updates.forEach(update => {
        console.log(`${update.email}:`);
        console.log(`  Before: $${update.oldEarnings} | After: $${update.newEarnings} | Diff: $${update.difference}`);
      });
    }

    console.log('\n✅ Cleanup completed successfully!');
    console.log('=' .repeat(80));

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the cleanup
cleanupLifetimeEarnings()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
