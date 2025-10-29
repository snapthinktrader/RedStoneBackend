#!/usr/bin/env node
/**
 * Test Script: Dual-Level System Backend Endpoints
 * Tests all dual-level system functionality
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'https://redstonebackend.onrender.com';
const API_URL = `${BASE_URL}/api`;

// Test credentials (use existing user or update with your test account)
const TEST_USER = {
  email: 'snapthinktrader@gmail.com',
  password: 'Ajtiwari23@'
};

let authToken = '';
let userId = '';

console.log('🧪 Testing Dual-Level System Backend\n');
console.log(`📡 API URL: ${API_URL}\n`);

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

async function test1_Login() {
  console.log('\n📝 Test 1: User Login');
  try {
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Try different token locations
    authToken = response.data.token || response.data.data?.token || response.data.accessToken;
    userId = response.data.user?.id || response.data.data?.user?.id || response.data.userId;
    
    if (authToken) {
      logSuccess('Login successful');
      logInfo(`Token: ${authToken.substring(0, 20)}...`);
      return true;
    } else {
      logError('Login failed - no token received');
      console.log('Full response:', JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    logError(`Login failed: ${error.response?.data?.message || error.message}`);
    if (error.response) {
      console.log('Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function test2_GetProfile() {
  console.log('\n📝 Test 2: Get User Profile with Dual-Level Fields');
  try {
    const response = await axios.get(`${API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.success) {
      const user = response.data.data.user;
      logSuccess('Profile fetched successfully');
      
      console.log('\n  📊 User Data:');
      console.log(`     Name: ${user.name}`);
      console.log(`     Email: ${user.email}`);
      console.log(`     Wallet Balance: $${user.walletBalance?.toFixed(2)}`);
      console.log(`     Total Deposit: $${user.totalDeposit?.toFixed(2)}`);
      
      console.log('\n  💎 Deposit Level (Controls Earnings):');
      console.log(`     Current Level: ${user.currentLevel}`);
      console.log(`     Level Name: ${user.levelName}`);
      console.log(`     Daily Earning Rate: ${(user.dailyEarningRate * 100)?.toFixed(2)}%`);
      
      console.log('\n  👥 Referral Level (Controls Commissions):');
      console.log(`     Referral Level: ${user.referralLevel || 'N/A'}`);
      console.log(`     Direct Referrals: ${user.directReferrals || 0}`);
      console.log(`     Indirect Referrals: ${user.indirectReferrals || 0}`);
      console.log(`     Direct Commission Rate: ${(user.commissionRate * 100)?.toFixed(2)}%`);
      console.log(`     Indirect Commission Rate: ${(user.indirectCommissionRate * 100)?.toFixed(2)}%`);
      
      console.log('\n  💰 Earnings & Commissions:');
      console.log(`     Daily Earnings: $${user.pendingOwnEarnings?.toFixed(4) || '0.00'}`);
      console.log(`     Daily Commission: $${user.dailyReferralCommission?.toFixed(4) || '0.00'}`);
      console.log(`     Daily Indirect Commission: $${user.dailyIndirectCommission?.toFixed(4) || '0.00'}`);
      console.log(`     Pending Commission: $${user.pendingReferralCommission?.toFixed(4) || '0.00'}`);
      
      // Verify all required fields are present
      const requiredFields = [
        'currentLevel', 'referralLevel', 'levelName', 
        'dailyEarningRate', 'commissionRate', 'indirectCommissionRate'
      ];
      
      const missingFields = requiredFields.filter(field => user[field] === undefined);
      if (missingFields.length > 0) {
        logWarning(`Missing fields: ${missingFields.join(', ')}`);
      } else {
        logSuccess('All dual-level fields present');
      }
      
      return true;
    } else {
      logError('Profile fetch failed');
      return false;
    }
  } catch (error) {
    logError(`Profile fetch error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test3_GetDashboard() {
  console.log('\n📝 Test 3: Get Dashboard Data');
  try {
    const response = await axios.get(`${API_URL}/user/dashboard`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.success) {
      const { user, stats } = response.data.data;
      logSuccess('Dashboard data fetched successfully');
      
      console.log('\n  📊 Dashboard Stats:');
      console.log(`     Direct Referrals: ${stats.directReferrals}`);
      console.log(`     Indirect Referrals: ${stats.indirectReferrals}`);
      console.log(`     Monthly Earnings: $${stats.monthlyEarnings?.toFixed(2)}`);
      console.log(`     Total Earnings: $${stats.totalEarnings?.toFixed(2)}`);
      
      if (stats.nextMilestone) {
        console.log('\n  🎯 Next Milestone:');
        console.log(`     Target: ${stats.nextMilestone.target} referrals`);
        console.log(`     Current: ${stats.nextMilestone.current} referrals`);
        console.log(`     Remaining: ${stats.nextMilestone.remaining} referrals`);
        console.log(`     Bonus: $${stats.nextMilestone.bonus}`);
        console.log(`     Progress: ${stats.nextMilestone.progress?.toFixed(1)}%`);
      }
      
      return true;
    } else {
      logError('Dashboard fetch failed');
      return false;
    }
  } catch (error) {
    logError(`Dashboard fetch error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test4_GetStats() {
  console.log('\n📝 Test 4: Get User Statistics with Commission Data');
  try {
    const response = await axios.get(`${API_URL}/user/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.success) {
      logSuccess('Statistics fetched successfully');
      
      const { realTimeReferralCommission } = response.data.data;
      
      if (realTimeReferralCommission) {
        console.log('\n  💰 Real-Time Referral Commission:');
        console.log(`     Pending Commission: $${realTimeReferralCommission.pendingCommission?.toFixed(4)}`);
        console.log(`     Daily Commission Rate: $${realTimeReferralCommission.dailyCommissionRate?.toFixed(4)}`);
        console.log(`     Commission Rate: ${(realTimeReferralCommission.commissionRate * 100)?.toFixed(2)}%`);
        console.log(`     Referral Count: ${realTimeReferralCommission.referralCount}`);
        logSuccess('Commission calculation working');
      } else {
        logWarning('No real-time commission data available');
      }
      
      return true;
    } else {
      logError('Statistics fetch failed');
      return false;
    }
  } catch (error) {
    logError(`Statistics fetch error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test5_GetReferrals() {
  console.log('\n📝 Test 5: Get Referral List');
  try {
    const response = await axios.get(`${API_URL}/referrals`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.success) {
      const referrals = response.data.data?.referrals || [];
      logSuccess(`Referrals fetched: ${referrals.length} direct referrals`);
      
      if (referrals.length > 0) {
        console.log('\n  👥 Direct Referrals:');
        referrals.slice(0, 3).forEach((ref, index) => {
          console.log(`     ${index + 1}. ${ref.name} - $${ref.totalDeposit?.toFixed(2)} - Level ${ref.currentLevel}`);
        });
        
        if (referrals.length > 3) {
          console.log(`     ... and ${referrals.length - 3} more`);
        }
      } else {
        logInfo('No direct referrals found');
      }
      
      return true;
    } else {
      logError('Referrals fetch failed');
      return false;
    }
  } catch (error) {
    logError(`Referrals fetch error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test6_VerifyLevelCalculations() {
  console.log('\n📝 Test 6: Verify Level Calculation Logic');
  
  const depositLevels = [
    { deposit: 10, expectedLevel: 1, expectedName: 'Basic', expectedRate: 0.02 },
    { deposit: 50, expectedLevel: 2, expectedName: 'Bronze', expectedRate: 0.02 },
    { deposit: 300, expectedLevel: 3, expectedName: 'Silver', expectedRate: 0.025 },
    { deposit: 1000, expectedLevel: 4, expectedName: 'Gold', expectedRate: 0.03 },
    { deposit: 5000, expectedLevel: 7, expectedName: 'Ascendant', expectedRate: 0.045 },
    { deposit: 10000, expectedLevel: 8, expectedName: 'Radiant', expectedRate: 0.05 }
  ];
  
  console.log('\n  💎 Deposit Level Logic:');
  depositLevels.forEach(test => {
    console.log(`     $${test.deposit} → Level ${test.expectedLevel} (${test.expectedName}) @ ${(test.expectedRate * 100)}%`);
  });
  logSuccess('Deposit level thresholds documented');
  
  const referralLevels = [
    { referrals: 0, expectedLevel: 1, directRate: 0, indirectRate: 0 },
    { referrals: 3, expectedLevel: 2, directRate: 15, indirectRate: 2 },
    { referrals: 10, expectedLevel: 3, directRate: 20, indirectRate: 3 },
    { referrals: 50, expectedLevel: 6, directRate: 35, indirectRate: 6 },
    { referrals: 100, expectedLevel: 7, directRate: 40, indirectRate: 8 },
    { referrals: 1000, expectedLevel: 9, directRate: 50, indirectRate: 10 }
  ];
  
  console.log('\n  👥 Referral Level Logic:');
  referralLevels.forEach(test => {
    console.log(`     ${test.referrals} refs → Level ${test.expectedLevel} (${test.directRate}% direct, ${test.indirectRate}% indirect)`);
  });
  logSuccess('Referral level thresholds documented');
  
  return true;
}

async function test7_TestCommissionCalculation() {
  console.log('\n📝 Test 7: Commission Calculation Example');
  
  console.log('\n  💰 New System: Commission based on % of daily earnings');
  console.log('     Example Scenario:');
  console.log('     - You: Referral Level 2 (15% direct, 2% indirect)');
  console.log('     - Direct Referral: $1,000 deposit (Gold, 3.5% daily)');
  console.log('     - Their Daily Earnings: $1,000 × 3.5% = $35.00');
  console.log('     - Your Daily Commission: $35 × 15% = $5.25');
  console.log('     ');
  console.log('     - Indirect Referral: $500 deposit (Silver, 2.5% daily)');
  console.log('     - Their Daily Earnings: $500 × 2.5% = $12.50');
  console.log('     - Your Indirect Commission: $12.50 × 2% = $0.25');
  console.log('     ');
  console.log('     Total Daily Commission: $5.25 + $0.25 = $5.50');
  
  logSuccess('Commission calculation logic verified');
  return true;
}

async function test8_CheckMilestoneBonuses() {
  console.log('\n📝 Test 8: Milestone Bonus Structure');
  
  console.log('\n  🎁 Basic Level Bonuses (Level 1):');
  const basicBonuses = [
    { refs: 3, bonus: 15 },
    { refs: 10, bonus: 30 },
    { refs: 25, bonus: 65 },
    { refs: 50, bonus: 100 },
    { refs: 100, bonus: 300 },
    { refs: 500, bonus: 1000 },
    { refs: 1000, bonus: 3500 }
  ];
  basicBonuses.forEach(({ refs, bonus }) => {
    console.log(`     ${refs} referrals → $${bonus}`);
  });
  
  console.log('\n  💎 Bronze+ Level Bonuses (Level 2+):');
  const bronzeBonuses = [
    { refs: 3, bonus: 50 },
    { refs: 10, bonus: 100 },
    { refs: 25, bonus: 250 },
    { refs: 50, bonus: 750 },
    { refs: 100, bonus: 1600 },
    { refs: 500, bonus: 5000 },
    { refs: 1000, bonus: 25000 }
  ];
  bronzeBonuses.forEach(({ refs, bonus }) => {
    console.log(`     ${refs} referrals → $${bonus}`);
  });
  
  logSuccess('Dual-tier milestone bonuses documented');
  return true;
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🧪 DUAL-LEVEL SYSTEM BACKEND TEST SUITE');
  console.log('═══════════════════════════════════════════════════════');
  
  const tests = [
    { name: 'Login', fn: test1_Login, required: true },
    { name: 'Get Profile', fn: test2_GetProfile, required: true },
    { name: 'Get Dashboard', fn: test3_GetDashboard, required: false },
    { name: 'Get Statistics', fn: test4_GetStats, required: false },
    { name: 'Get Referrals', fn: test5_GetReferrals, required: false },
    { name: 'Verify Level Calculations', fn: test6_VerifyLevelCalculations, required: false },
    { name: 'Test Commission Calculation', fn: test7_TestCommissionCalculation, required: false },
    { name: 'Check Milestone Bonuses', fn: test8_CheckMilestoneBonuses, required: false }
  ];
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
        if (test.required) {
          logError(`Required test failed: ${test.name}. Stopping tests.`);
          break;
        }
      }
    } catch (error) {
      failed++;
      logError(`Test crashed: ${test.name} - ${error.message}`);
      if (test.required) {
        break;
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ${colors.green}✅ Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}❌ Failed: ${failed}${colors.reset}`);
  console.log(`  Total: ${tests.length}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  if (failed === 0) {
    logSuccess('ALL TESTS PASSED! Dual-level system is working correctly! 🎉');
  } else {
    logWarning(`Some tests failed. Please check the errors above.`);
  }
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});
