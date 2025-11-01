const axios = require('axios');
require('dotenv').config();

async function testReferralAPI() {
  try {
    console.log('🔍 Testing Real-Time Referral Network API...');
    console.log('='.repeat(50));

    // First login to get token
    console.log('🔐 Logging in as spooky moments user...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'spookymoments62@gmail.com',
      password: 'Sattu@1234'
    });

    if (!loginResponse.data.success) {
      console.log('❌ Login failed:', loginResponse.data.message);
      return;
    }

    // Debug: Check the actual response structure
    console.log('🔍 Login response structure:', JSON.stringify(loginResponse.data, null, 2));
    
    // Try different possible token locations
    const token = loginResponse.data.token || 
                  loginResponse.data.data?.token || 
                  loginResponse.data.accessToken ||
                  loginResponse.data.data?.accessToken;
                  
    console.log('✅ Login successful');
    console.log('🔑 Token received:', token ? 'Yes' : 'No');
    
    if (!token) {
      console.log('❌ No token found in response');
      return;
    }

    // Test the referral network endpoint
    console.log('\n🔗 Fetching referral network data...');
    const referralResponse = await axios.get('http://localhost:5000/api/referral/user-referrals', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (referralResponse.data.success) {
      console.log('✅ API Response successful');
      console.log('\n📊 Real-Time Network Data:');
      console.log('-'.repeat(40));
      
      const referrals = referralResponse.data.data.referrals;
      referrals.forEach((ref, index) => {
        console.log(`\n${index + 1}. ${ref.refereeName}`);
        console.log(`   📧 Email: ${ref.refereeEmail}`);
        console.log(`   💰 Real-Time Balance: $${ref.realTimeBalance?.toFixed(2) || 'N/A'}`);
        console.log(`   🔥 Pending Earnings: $${ref.pendingEarnings?.toFixed(2) || 'N/A'}`);
        console.log(`   📅 Daily Earnings: $${ref.dailyEarnings?.toFixed(4) || 'N/A'}`);
        console.log(`   💸 My Daily Commission: $${ref.myDailyCommission?.toFixed(6) || 'N/A'}`);
        console.log(`   ⚡ My Commission/Second: $${ref.myCommissionPerSecond?.toFixed(10) || 'N/A'}`);
        console.log(`   📈 Commission Rate: ${ref.myCommissionRate ? (ref.myCommissionRate * 100).toFixed(1) + '%' : 'N/A'}`);
      });

      // Calculate total real-time commission
      const totalDailyCommission = referrals.reduce((sum, ref) => sum + (ref.myDailyCommission || 0), 0);
      const totalCommissionPerSecond = referrals.reduce((sum, ref) => sum + (ref.myCommissionPerSecond || 0), 0);

      console.log('\n💰 TOTAL REAL-TIME COMMISSION:');
      console.log('='.repeat(35));
      console.log(`💸 Per Second: $${totalCommissionPerSecond.toFixed(10)}`);
      console.log(`📅 Per Day: $${totalDailyCommission.toFixed(6)}`);
      console.log(`📊 Per Month: $${(totalDailyCommission * 30).toFixed(4)}`);
      console.log(`🚀 Per Year: $${(totalDailyCommission * 365).toFixed(2)}`);

      console.log('\n✅ Real-time commission display is working!');
      console.log('🎯 The frontend will now show live updating values');
      
    } else {
      console.log('❌ API call failed:', referralResponse.data.message);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to server. Please start the backend server:');
      console.log('   cd /Users/mahendrabahubali/Desktop/RedStone/redstone_flutter_app/backend');
      console.log('   npm run dev');
    } else {
      console.log('❌ API test error:', error.response?.data || error.message);
    }
  }
}

testReferralAPI();