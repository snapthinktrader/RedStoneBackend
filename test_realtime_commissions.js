const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function testRealtimeCommissions() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Test with spooky moments user (has referrals)
    console.log('\n📊 Testing Real-Time Commission Calculations:');
    console.log('='.repeat(60));

    // Find spooky moments user
    const user = await User.findOne({ 
      $or: [
        { name: /spooky.*moment/i },
        { email: /spooky.*moment/i },
        { name: /spooky/i }
      ]
    });
    if (!user) {
      console.log('❌ Spooky moments user not found, trying to find any user with referrals...');
      
      // Find any user with referrals
      const userWithReferrals = await User.findOne({
        _id: { $in: await User.distinct('referredBy', { isActive: true }) }
      });
      
      if (!userWithReferrals) {
        console.log('❌ No users with referrals found');
        return;
      }
      
      console.log(`🔄 Using user: ${userWithReferrals.name} (${userWithReferrals.email})`);
      user = userWithReferrals;
    }

    console.log(`\n👤 Testing commissions for: ${user.name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`💰 Current Balance: $${user.walletBalance}`);
    console.log(`📈 Referral Level: ${user.currentLevel} (${user.getCommissionRate() * 100}% commission rate)`);

    // Get their direct referrals
    const directReferrals = await User.find({ 
      referredBy: user._id, 
      isActive: true 
    }).select('name email walletBalance totalDeposit lastEarningUpdate createdAt');

    console.log(`\n🔗 Direct Referrals: ${directReferrals.length}`);
    
    if (directReferrals.length === 0) {
      console.log('❌ No active referrals found');
      return;
    }

    let totalDailyCommission = 0;
    let totalCommissionPerSecond = 0;

    console.log('\n📈 Real-Time Commission Analysis:');
    console.log('-'.repeat(80));

    for (let i = 0; i < directReferrals.length; i++) {
      const referral = directReferrals[i];
      
      // Calculate real-time earnings for this referral
      const realTimeData = referral.calculateRealTimeEarnings();
      
      // Calculate commission rates
      const SECONDS_PER_DAY = 86400;
      const referralEarningsPerSecond = realTimeData.dailyRate / SECONDS_PER_DAY;
      const myCommissionRate = user.getCommissionRate();
      const myCommissionPerSecond = referralEarningsPerSecond * myCommissionRate;
      const myDailyCommission = realTimeData.dailyRate * myCommissionRate;
      
      totalDailyCommission += myDailyCommission;
      totalCommissionPerSecond += myCommissionPerSecond;

      console.log(`\n${i + 1}. ${referral.name} (${referral.email})`);
      console.log(`   💰 Current Balance: $${referral.walletBalance.toFixed(2)}`);
      console.log(`   📊 Real-Time Balance: $${realTimeData.calculatedBalance.toFixed(2)}`);
      console.log(`   🔥 Pending Earnings: $${realTimeData.pendingEarnings.toFixed(2)}`);
      console.log(`   ⏱️  Earnings/Second: $${referralEarningsPerSecond.toFixed(8)}`);
      console.log(`   📅 Daily Earning Rate: $${realTimeData.dailyRate.toFixed(4)}`);
      console.log(`   🎯 My Commission Rate: ${(myCommissionRate * 100).toFixed(1)}%`);
      console.log(`   💸 My Commission/Second: $${myCommissionPerSecond.toFixed(8)}`);
      console.log(`   💰 My Daily Commission: $${myDailyCommission.toFixed(4)}`);
      console.log(`   ⏰ Last Update: ${realTimeData.lastUpdate.toLocaleString()}`);
      console.log(`   ⌛ Elapsed: ${realTimeData.elapsedSeconds} seconds`);
    }

    console.log('\n💰 TOTAL COMMISSION SUMMARY:');
    console.log('='.repeat(40));
    console.log(`💸 Total Commission Per Second: $${totalCommissionPerSecond.toFixed(8)}`);
    console.log(`📅 Total Daily Commission: $${totalDailyCommission.toFixed(4)}`);
    console.log(`📊 Monthly Commission (30 days): $${(totalDailyCommission * 30).toFixed(2)}`);
    console.log(`🚀 Yearly Commission (365 days): $${(totalDailyCommission * 365).toFixed(2)}`);

    // Simulate API response
    console.log('\n🔗 API Response Preview (what frontend will receive):');
    console.log('-'.repeat(60));
    
    const apiResponse = {
      success: true,
      data: {
        referrals: directReferrals.map(referral => {
          const realTimeData = referral.calculateRealTimeEarnings();
          const SECONDS_PER_DAY = 86400;
          const referralEarningsPerSecond = realTimeData.dailyRate / SECONDS_PER_DAY;
          const myCommissionRate = user.getCommissionRate();
          const myCommissionPerSecond = referralEarningsPerSecond * myCommissionRate;
          const myDailyCommission = realTimeData.dailyRate * myCommissionRate;

          return {
            id: referral._id.toString(),
            refereeName: referral.name,
            refereeEmail: referral.email,
            dailyEarnings: realTimeData.dailyRate,
            myDailyCommission: myDailyCommission,
            myCommissionPerSecond: myCommissionPerSecond,
            realTimeBalance: realTimeData.calculatedBalance,
            pendingEarnings: realTimeData.pendingEarnings,
            elapsedSeconds: realTimeData.elapsedSeconds
          };
        })
      }
    };

    console.log(JSON.stringify(apiResponse, null, 2));

    console.log('\n✅ Real-time commission calculation test completed!');
    console.log('🎯 The network will now show live updating commission values');

  } catch (error) {
    console.error('❌ Error testing real-time commissions:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run test
testRealtimeCommissions();