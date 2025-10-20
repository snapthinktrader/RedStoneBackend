require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const MONGODB_URI = process.env.MONGODB_URI;

async function fixEarningStartDate() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the user
    const email = 'snapthinktrader@gmail.com';
    const user = await User.findOne({ email });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('📊 Current User State:');
    console.log(`Email: ${user.email}`);
    console.log(`Wallet Balance: $${user.walletBalance.toFixed(2)}`);
    console.log(`Account Created: ${user.createdAt}`);
    console.log(`Last Earning Update: ${user.lastEarningUpdate || 'Not set (null)'}`);

    // Calculate current (wrong) earnings
    const currentEarnings = user.calculateRealTimeEarnings();
    console.log(`\n❌ Current (WRONG) Calculation:`);
    console.log(`  Time elapsed: ${(currentEarnings.elapsedSeconds / 3600).toFixed(2)} hours`);
    console.log(`  Earnings: $${(currentEarnings.pendingEarnings || 0).toFixed(2)}`);
    console.log(`  Display Balance: $${currentEarnings.calculatedBalance.toFixed(2)}`);

    // Set lastEarningUpdate to 16th Oct 2025, 8:00 PM (estimate - you can adjust this)
    // This is when you manually added the $50
    const correctStartDate = new Date('2025-10-16T20:00:00+05:30'); // 8 PM IST on 16th Oct
    
    console.log(`\n🔧 Fixing lastEarningUpdate to: ${correctStartDate}`);
    console.log(`   (You can adjust this date if the money was added at a different time)`);

    user.lastEarningUpdate = correctStartDate;
    await user.save();

    console.log('✅ Updated successfully!\n');

    // Reload and check new calculation
    const updatedUser = await User.findOne({ email });
    const newEarnings = updatedUser.calculateRealTimeEarnings();
    
    console.log('✅ New (CORRECT) Calculation:');
    console.log(`  Last Update: ${updatedUser.lastEarningUpdate}`);
    console.log(`  Time elapsed: ${(newEarnings.elapsedSeconds / 3600).toFixed(2)} hours`);
    console.log(`  Earnings: $${(newEarnings.pendingEarnings || 0).toFixed(2)}`);
    console.log(`  Display Balance: $${newEarnings.calculatedBalance.toFixed(2)}`);

    const hoursElapsed = newEarnings.elapsedSeconds / 3600;
    const daysElapsed = hoursElapsed / 24;
    console.log(`\n📈 Earnings Breakdown:`);
    console.log(`  Base Amount: $50.00`);
    console.log(`  Time Period: ${hoursElapsed.toFixed(2)} hours (${daysElapsed.toFixed(2)} days)`);
    console.log(`  Rate: 2% per day compound`);
    console.log(`  Formula: $50 × (1.02)^${daysElapsed.toFixed(4)} = $${newEarnings.calculatedBalance.toFixed(2)}`);

    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

fixEarningStartDate();
