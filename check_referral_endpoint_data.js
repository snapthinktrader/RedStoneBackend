require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Transaction = require('./src/models/Transaction');
const Deposit = require('./src/models/Deposit');

mongoose.connect(process.env.MONGODB_URI);

async function checkReferralEndpointData() {
  try {
    // Get snapthinktrader (the parent user with earnings)
    const parentUser = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    
    console.log('\n=== PARENT USER DATA ===');
    console.log('Email:', parentUser.email);
    console.log('Wallet Balance:', parentUser.walletBalance);
    console.log('Lifetime Referral Earnings:', parentUser.lifetimeReferralEarnings);
    console.log('Pending Commission:', parentUser.pendingCommission);
    console.log('Total Referrals:', parentUser.totalReferrals);
    
    // Get their direct referrals
    const directReferrals = await User.find({
      referredBy: parentUser._id,
      isActive: true
    }).select('name email walletBalance totalDeposit createdAt');
    
    console.log('\n=== DIRECT REFERRALS ===');
    console.log('Count:', directReferrals.length);
    
    for (const referral of directReferrals) {
      console.log(`\n--- ${referral.name} (${referral.email}) ---`);
      console.log('Wallet Balance:', referral.walletBalance);
      console.log('Total Deposit:', referral.totalDeposit);
      console.log('Joined:', referral.createdAt);
      
      // Check their deposits with timestamps
      const deposits = await Deposit.find({
        userId: referral._id,
        status: 'CONFIRMED',
        balanceUpdated: true
      }).sort({ processedAt: 1 });
      
      console.log('Deposits:', deposits.length);
      for (const deposit of deposits) {
        const startTime = deposit.processedAt || deposit.createdAt;
        const daysSince = (Date.now() - startTime) / (1000 * 60 * 60 * 24);
        console.log(`  - $${deposit.amount} deposited ${daysSince.toFixed(2)} days ago (${startTime.toISOString()})`);
      }
      
      // Calculate what the endpoint would show
      const SECONDS_PER_DAY = 86400;
      const now = new Date();
      let accumulatedCommission = 0;
      
      for (const deposit of deposits) {
        const depositStartTime = deposit.processedAt || deposit.createdAt;
        const secondsSinceDeposit = Math.floor((now - depositStartTime) / 1000);
        
        if (secondsSinceDeposit <= 0) continue;
        
        const dailyRate = 0.02; // 2% daily
        const ratePerSecond = dailyRate / SECONDS_PER_DAY;
        const earningsFromThisDeposit = deposit.amount * ratePerSecond * secondsSinceDeposit;
        const commissionFromThisDeposit = earningsFromThisDeposit * 0.15; // 15% commission
        
        accumulatedCommission += commissionFromThisDeposit;
        console.log(`    Commission from this deposit: $${commissionFromThisDeposit.toFixed(2)}`);
      }
      
      console.log(`  TOTAL Commission from ${referral.name}: $${accumulatedCommission.toFixed(2)}`);
    }
    
    console.log('\n=== SOLUTION ===');
    console.log('The endpoint is calculating from deposits with timestamps.');
    console.log('But we have STORED lifetime earnings: $' + parentUser.lifetimeReferralEarnings);
    console.log('This stored value was calculated correctly from referral wallet balances.');
    console.log('\nWe need to use the STORED value instead of recalculating from deposits.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkReferralEndpointData();
