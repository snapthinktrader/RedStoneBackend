/**
 * Cleanup Script: Remove Old Referral Commission Transactions
 * 
 * This script removes:
 * 1. REFERRAL_COMMISSION transactions (now calculated per-second, not as transactions)
 * 2. DAILY_EARNING transactions (also calculated per-second)
 * 3. Old RECRUITMENT_BONUS transactions (replaced by milestone bonuses)
 * 
 * And recalculates user wallet balances based only on:
 * - DEPOSIT
 * - WITHDRAWAL
 * - MILESTONE_BONUS
 * - MANUAL_CREDIT
 * - PROMOTIONAL_BONUS
 * - SUPPORT_CREDIT
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');

const MONGODB_URI = process.env.MONGODB_URI;

async function cleanupOldCommissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Find all transactions to be removed
    console.log('📊 Analyzing transactions to remove...');
    
    const transactionsToRemove = await Transaction.find({
      type: { $in: ['REFERRAL_COMMISSION', 'DAILY_EARNING', 'RECRUITMENT_BONUS'] }
    });

    console.log(`Found ${transactionsToRemove.length} transactions to remove:`);
    
    // Group by type for reporting
    const byType = {};
    let totalAmount = 0;
    
    transactionsToRemove.forEach(tx => {
      byType[tx.type] = (byType[tx.type] || 0) + 1;
      if (tx.status === 'COMPLETED') {
        totalAmount += tx.amount;
      }
    });

    Object.keys(byType).forEach(type => {
      console.log(`  - ${type}: ${byType[type]} transactions`);
    });
    console.log(`  Total amount credited: $${totalAmount.toFixed(2)}\n`);

    // Step 2: Get all affected users
    const affectedUserIds = [...new Set(transactionsToRemove.map(tx => tx.userId.toString()))];
    console.log(`📍 Found ${affectedUserIds.length} affected users\n`);

    // Step 3: For each user, recalculate correct balance
    console.log('🔄 Recalculating user balances...\n');
    
    let usersUpdated = 0;
    const updates = [];

    for (const userId of affectedUserIds) {
      const user = await User.findById(userId);
      if (!user) {
        console.log(`  ⚠️  User ${userId} not found, skipping`);
        continue;
      }

      // Calculate correct balance from valid transactions only
      const validTransactions = await Transaction.find({
        userId: userId,
        type: { $in: ['DEPOSIT', 'WITHDRAWAL', 'MILESTONE_BONUS', 'MANUAL_CREDIT', 'PROMOTIONAL_BONUS', 'SUPPORT_CREDIT'] },
        status: 'COMPLETED'
      });

      let correctBalance = 0;
      validTransactions.forEach(tx => {
        if (['DEPOSIT', 'MILESTONE_BONUS', 'MANUAL_CREDIT', 'PROMOTIONAL_BONUS', 'SUPPORT_CREDIT'].includes(tx.type)) {
          correctBalance += tx.amount;
        } else if (tx.type === 'WITHDRAWAL') {
          correctBalance -= tx.amount;
        }
      });

      // Add current per-second earnings
      const currentEarnings = user.getCurrentBalance ? user.getCurrentBalance() : user.walletBalance;
      
      const oldBalance = user.walletBalance;
      const balanceDiff = correctBalance - oldBalance;

      if (Math.abs(balanceDiff) > 0.01) { // Only update if difference is significant
        updates.push({
          userId: userId,
          email: user.email,
          oldBalance: oldBalance,
          correctBalance: correctBalance,
          difference: balanceDiff
        });

        // Update user balance
        user.walletBalance = correctBalance;
        await user.save();
        usersUpdated++;
      }
    }

    console.log(`✅ Updated ${usersUpdated} user balances\n`);

    if (updates.length > 0) {
      console.log('📋 Balance adjustments made:');
      updates.forEach(update => {
        console.log(`  ${update.email}:`);
        console.log(`    Old: $${update.oldBalance.toFixed(2)}`);
        console.log(`    New: $${update.correctBalance.toFixed(2)}`);
        console.log(`    Diff: ${update.difference >= 0 ? '+' : ''}$${update.difference.toFixed(2)}\n`);
      });
    }

    // Step 4: Delete old commission transactions
    console.log('🗑️  Removing old commission transactions...');
    
    const deleteResult = await Transaction.deleteMany({
      type: { $in: ['REFERRAL_COMMISSION', 'DAILY_EARNING', 'RECRUITMENT_BONUS'] }
    });

    console.log(`✅ Deleted ${deleteResult.deletedCount} transactions\n`);

    // Step 5: Summary
    console.log('📊 Cleanup Summary:');
    console.log(`  - Transactions removed: ${deleteResult.deletedCount}`);
    console.log(`  - Users updated: ${usersUpdated}`);
    console.log(`  - Total amount removed from records: $${totalAmount.toFixed(2)}`);
    console.log('\n✅ Cleanup completed successfully!');
    console.log('\n📝 Note: Users will continue earning from:');
    console.log('   1. Per-second earnings (2% daily from their deposits)');
    console.log('   2. Per-second referral earnings (15% of referral earnings)');
    console.log('   3. Milestone bonuses (one-time rewards for referral targets)');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the cleanup
cleanupOldCommissions();
