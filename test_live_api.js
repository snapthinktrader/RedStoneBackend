const axios = require('axios');

async function testLiveAPI() {
  try {
    console.log('=== TESTING LIVE API ===');
    console.log('URL: https://redstonebackend.onrender.com/api/users/profile');
    
    // Test with spookymoments62 - we need to login first to get token
    const loginResponse = await axios.post('https://redstonebackend.onrender.com/api/auth/login', {
      email: 'spookymomets62@gmail.com',
      password: 'Sattu@1234'
    });
    
    const token = loginResponse.data.token;
    console.log('✓ Login successful');
    
    // Get profile
    const profileResponse = await axios.get('https://redstonebackend.onrender.com/api/users/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = profileResponse.data;
    console.log('\n=== PROFILE DATA ===');
    console.log('Email:', data.user.email);
    console.log('Username:', data.user.username);
    console.log('Wallet Balance:', data.user.walletBalance);
    console.log('Total Deposit:', data.user.totalDeposit);
    console.log('Total Referrals:', data.user.totalReferrals);
    console.log('Daily Earning Rate:', (data.user.dailyEarningRate * 100).toFixed(2) + '%');
    console.log('Lifetime Referral Earnings:', data.user.lifetimeReferralEarnings || 0);
    console.log('Pending Referral Commission:', data.user.pendingReferralCommission || 0);
    
    console.log('\n=== COMPARISON ===');
    console.log('Expected (timeline calculation): $6,101.98');
    console.log('Local test result: $6,095.18');
    console.log('Live API returns: $' + data.user.walletBalance);
    
    if (data.user.walletBalance > 6200) {
      console.log('\n⚠️  WARNING: Balance still too high! Deployment may not be complete.');
    } else if (data.user.walletBalance >= 6000 && data.user.walletBalance <= 6200) {
      console.log('\n✅ SUCCESS: Balance is now correct!');
    } else {
      console.log('\n⚠️  Balance seems unexpected');
    }
    
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testLiveAPI();
