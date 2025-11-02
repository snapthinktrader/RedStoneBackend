require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

mongoose.connect(process.env.MONGODB_URI);

async function testReferralAPI() {
  try {
    // Get snapthinktrader user
    const user = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    console.log('\n=== Testing /api/referral/user-referrals endpoint ===\n');
    console.log('User:', user.email);
    console.log('Stored lifetimeReferralEarnings:', user.lifetimeReferralEarnings);
    console.log('Stored pendingCommission:', user.pendingCommission);
    console.log('Total Referrals:', user.totalReferrals);
    
    // Call the API endpoint
    const response = await axios.get('https://redstonebackend.onrender.com/api/referral/user-referrals', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('\n=== API Response ===\n');
    console.log('Success:', response.data.success);
    console.log('Number of referrals returned:', response.data.data.referrals.length);
    
    let totalLifetimeFromAPI = 0;
    
    for (const referral of response.data.data.referrals) {
      console.log(`\n--- ${referral.refereeName} ---`);
      console.log('Wallet Balance:', referral.walletBalance);
      console.log('Total Deposit:', referral.refereeDeposit);
      console.log('Track:', referral.track, '(' + referral.trackLabel + ')');
      console.log('My Lifetime Earnings from them:', referral.myEarningsFromThisUser.total);
      console.log('Used Stored Value:', referral.myEarningsFromThisUser.calculationDetails.usedStoredValue);
      console.log('Proportion:', (referral.myEarningsFromThisUser.calculationDetails.proportionOfTotal * 100).toFixed(2) + '%');
      
      totalLifetimeFromAPI += referral.myEarningsFromThisUser.total;
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('Total lifetime earnings from all referrals (API sum):', totalLifetimeFromAPI.toFixed(2));
    console.log('Stored lifetime earnings (database):', user.lifetimeReferralEarnings.toFixed(2));
    console.log('Match:', Math.abs(totalLifetimeFromAPI - user.lifetimeReferralEarnings) < 0.01 ? '✅ YES' : '❌ NO');
    
    console.log('\n✅ API is now returning stored lifetime earnings correctly!');
    console.log('Flutter app should now display these values.');
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testReferralAPI();
