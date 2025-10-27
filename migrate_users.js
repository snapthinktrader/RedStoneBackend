#!/usr/bin/env node
/**
 * Migration Script: Add referralLevel to Existing Users
 * Run from backend directory
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

console.log('🔄 Starting Migration: Add referralLevel Field\n');

async function migrate() {
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    console.log('URI:', process.env.MONGODB_URI ? '✓ Found' : '✗ Not found');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all users without referralLevel field or with null value
    console.log('🔍 Finding users to migrate...');
    const usersToMigrate = await User.find({
      $or: [
        { referralLevel: { $exists: false } },
        { referralLevel: null }
      ]
    });

    console.log(`📊 Found ${usersToMigrate.length} users to migrate\n`);

    if (usersToMigrate.length === 0) {
      console.log('✅ No users need migration. All users already have referralLevel field.');
      await mongoose.disconnect();
      return;
    }

    // Calculate referral level for each user
    console.log('⚙️  Calculating referral levels...\n');
    
    let migrated = 0;
    let errors = 0;

    for (const user of usersToMigrate) {
      try {
        const referralCount = user.directReferrals || 0;
        let newReferralLevel = 1;
        
        if (referralCount >= 1000) newReferralLevel = 9;
        else if (referralCount >= 500) newReferralLevel = 8;
        else if (referralCount >= 100) newReferralLevel = 7;
        else if (referralCount >= 50) newReferralLevel = 6;
        else if (referralCount >= 25) newReferralLevel = 5;
        else if (referralCount >= 15) newReferralLevel = 4;
        else if (referralCount >= 10) newReferralLevel = 3;
        else if (referralCount >= 3) newReferralLevel = 2;
        else newReferralLevel = 1;
        
        user.referralLevel = newReferralLevel;
        await user.save();
        
        console.log(`✅ ${user.email}: ${referralCount} referrals → Level ${newReferralLevel}`);
        migrated++;
      } catch (error) {
        console.error(`❌ Error migrating ${user.email}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${migrated} users`);
    console.log(`   ❌ Errors: ${errors} users`);
    console.log(`   📈 Total processed: ${usersToMigrate.length} users\n`);

    // Show distribution
    console.log('📊 Referral Level Distribution:');
    const distribution = await User.aggregate([
      {
        $group: {
          _id: '$referralLevel',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    distribution.forEach(({ _id, count }) => {
      console.log(`   Level ${_id}: ${count} users`);
    });

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run migration
migrate().catch(console.error);
