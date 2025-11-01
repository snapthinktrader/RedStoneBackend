/**
 * Restore Lifetime Referral Earnings
 * 
 * This script calculates lifetime referral earnings based on:
 * - Referral's wallet balance (from admin deposits/promotional bonuses)
 * - Time since their first balance credit
 * - 2% daily rate (simple interest per second)
 * - 15% commission for referrer
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');

const MONGODB_URI = process.env.MONGODB_URI;
const SECONDS_PER_DAY = 86400;
const DAILY_RATE = 0.02; // 2%
const COMMISSION_RATE = 0.15; // 15%

async function restoreLifetimeEarnings() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    console.log('=' .repeat(80));

    // Find all users with referrals
    const allUsers = await User.find({});
    const usersWithReferrals = [];

    for (const user of allUsers) {
      const referralCount = await User.countDocuments({ referredBy: user._id });
      if (referralCount > 0) {
        usersWithReferrals.push(user);
      }
    }

    console.log(`\n📊 Found ${usersWithReferrals.length} users with referrals\n`);

    for (const user of usersWithReferrals) {
      const referrals = await User.find({ referredBy: user._id, isActive: true });
      
      console.log(`\n${user.email}:`);
      console.log(`  Current wallet: $${user.walletBalance.toFixed(2)}`);
      console.log(`  Referrals: ${referrals.length}\n`);

      let totalLifetimeEarnings = 0;
      let totalPendingCommission = 0;

      for (const referral of referrals) {
        if (referral.walletBalance <= 0) {
          console.log(`    ${referral.email}: $0 (no balance)`);
          continue;
        }

        // Find when their balance was first added
        const firstCredit = await Transaction.findOne({
          userId: referral._id,
          status: 'COMPLETED',
          type: { $in: ['DEPOSIT', 'PROMOTIONAL_BONUS', 'MANUAL_CREDIT', 'MILESTONE_BONUS', 'SUPPORT_CREDIT'] }
        }).sort({ createdAt: 1 });

        if (!firstCredit) {
          console.log(`    ${referral.email}: $0 (no transaction history)`);
          continue;
        }

        const startTime = firstCredit.createdAt;
        const now = new Date();
        const secondsSince = Math.floor((now - startTime) / 1000);
        const daysSince = Math.floor(secondsSince / SECONDS_PER_DAY);

        // Calculate their lifetime earnings (simple interest)
        const ratePerSecond = DAILY_RATE / SECONDS_PER_DAY;
        const referralLifetimeEarnings = referral.walletBalance * ratePerSecond * secondsSince;
        
        // My commission (15% of their earnings)
        const myCommission = referralLifetimeEarnings * COMMISSION_RATE;

        totalLifetimeEarnings += myCommission;
        totalPendingCommission += myCommission;

        console.log(`    ${referral.email}:`);
        console.log(`      Balance: $${referral.walletBalance.toFixed(2)}`);
        console.log(`      Started: ${startTime.toLocaleDateString()} (${daysSince} days ago)`);
        console.log(`      Their earnings: $${referralLifetimeEarnings.toFixed(2)}`);
        console.log(`      Your commission: $${myCommission.toFixed(2)}`);
      }

      console.log(`\n  📈 TOTAL LIFETIME EARNINGS: $${totalLifetimeEarnings.toFixed(2)}`);
      console.log(`  💰 PENDING COMMISSION: $${totalPendingCommission.toFixed(2)}`);

      // Update the user
      user.lifetimeReferralEarnings = totalLifetimeEarnings;
      user.pendingCommission = totalPendingCommission;
      await user.save();

      console.log(`  ✅ Updated database`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ All lifetime earnings restored!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

// Run the script
restoreLifetimeEarnings();
