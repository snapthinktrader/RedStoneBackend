require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

mongoose.connect(process.env.MONGODB_URI);

async function testWalletBalanceAPI() {
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
    
    console.log('\n=== Testing Wallet Balance Fix ===\n');
    console.log('User:', user.email);
    console.log('Stored walletBalance:', user.walletBalance);
    console.log('Stored lifetimeReferralEarnings:', user.lifetimeReferralEarnings);
    console.log('Stored pendingCommission:', user.pendingCommission);
    
    console.log('\n--- Calling /api/users/profile ---\n');
    
    // Call the API endpoint
    const response = await axios.get('https://redstonebackend.onrender.com/api/users/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Success:', response.data.success);
    
    const userData = response.data.data.user;
    
    console.log('\n=== API Response ===');
    console.log('walletBalance (total):', userData.walletBalance);
    console.log('storedBalance:', userData.storedBalance);
    console.log('pendingOwnEarnings:', userData.pendingOwnEarnings);
    console.log('pendingReferralCommission:', userData.pendingReferralCommission);
    console.log('pendingIndirectCommission:', userData.pendingIndirectCommission);
    
    console.log('\n=== Calculation Check ===');
    const expectedTotal = userData.storedBalance + userData.pendingOwnEarnings + userData.pendingReferralCommission;
    console.log('Expected: $' + userData.storedBalance + ' + $' + userData.pendingOwnEarnings.toFixed(2) + ' + $' + userData.pendingReferralCommission.toFixed(2));
    console.log('Expected Total: $' + expectedTotal.toFixed(2));
    console.log('Actual walletBalance: $' + userData.walletBalance.toFixed(2));
    console.log('Match:', Math.abs(expectedTotal - userData.walletBalance) < 0.01 ? '✅ YES' : '❌ NO');
    
    if (userData.pendingReferralCommission > 1600) {
      console.log('\n✅ SUCCESS! Backend is including lifetime referral earnings ($1,680) in wallet balance!');
      console.log('Flutter app should now show ~$2,652 total balance.');
    } else {
      console.log('\n❌ Issue: pendingReferralCommission is', userData.pendingReferralCommission);
      console.log('Expected: ~$1,680');
      console.log('Render may still be deploying. Wait 1-2 minutes and try again.');
    }
    
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await mongoose.disconnect();
  }
}

testWalletBalanceAPI();
