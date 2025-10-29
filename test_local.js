#!/usr/bin/env node
/**
 * Test Backend Locally
 * Run this to test backend on localhost before deploying
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

const TEST_USER = {
  email: 'snapthinktrader@gmail.com',
  password: 'Ajtiwari23@'
};

console.log('🧪 Testing Backend Locally\n');
console.log(`📡 API URL: ${API_URL}\n`);

async function testLocal() {
  try {
    console.log('📝 Testing Login...');
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    
    if (response.data.success && response.data.token) {
      console.log('✅ Login successful!');
      console.log(`   Token: ${response.data.token.substring(0, 30)}...`);
      
      const token = response.data.token;
      
      console.log('\n📝 Testing Profile Endpoint...');
      const profileResponse = await axios.get(`${API_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (profileResponse.data.success) {
        const user = profileResponse.data.data.user;
        console.log('✅ Profile fetch successful!');
        console.log(`   Name: ${user.name}`);
        console.log(`   Deposit Level: ${user.currentLevel} (${user.levelName})`);
        console.log(`   Referral Level: ${user.referralLevel}`);
        console.log(`   Daily Earning Rate: ${(user.dailyEarningRate * 100).toFixed(2)}%`);
        console.log(`   Commission Rate: ${(user.commissionRate * 100).toFixed(2)}%`);
        console.log(`   Indirect Commission: ${(user.indirectCommissionRate * 100).toFixed(2)}%`);
        
        console.log('\n✅ All tests passed! Backend is working correctly!');
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    console.log('\n💡 Make sure backend is running:');
    console.log('   cd backend && npm start');
  }
}

testLocal();
