const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function testMilestoneSystem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔍 TESTING MILESTONE SYSTEM WITH UPDATED CONFIGURATION');
    console.log('====================================================');
    console.log('');
    
    // Test milestone configuration
    const milestones = JSON.parse(process.env.MILESTONE_BONUSES_LOWER || '{"3":50,"10":100,"15":150,"25":250,"50":750,"100":1000,"500":5000,"1000":25000}');
    console.log('🎯 Current Milestone Configuration (Lower Track):');
    Object.entries(milestones).forEach(([count, bonus]) => {
      console.log(`   ${count} referrals → $${bonus} bonus`);
    });
    console.log('');
    
    const upperMilestones = JSON.parse(process.env.MILESTONE_BONUSES_UPPER || '{"3":100,"10":200,"15":300,"25":500,"50":1500,"100":3000,"500":10000,"1000":50000}');
    console.log('🎯 Upper Track Configuration (Bronze+ only):');
    Object.entries(upperMilestones).forEach(([count, bonus]) => {
      console.log(`   ${count} referrals → $${bonus} bonus`);
    });
    console.log('');
    
    // Test milestone calculation with different referral counts
    const testCounts = [0, 1, 2, 3, 5, 10, 15, 25, 30];
    
    console.log('📊 Testing Milestone Calculation:');
    console.log('----------------------------------');
    
    // Import the UserController to test the getNextMilestone method
    const UserController = require('./src/controllers/userController');
    
    testCounts.forEach(count => {
      const milestone = UserController.getNextMilestone(count);
      console.log(`Referrals: ${count}`);
      console.log(`  Next Milestone: ${milestone.target} referrals → $${milestone.bonus}`);
      console.log(`  Progress: ${count}/${milestone.target} (${milestone.progress.toFixed(1)}%)`);
      console.log(`  Remaining: ${milestone.remaining}`);
      console.log(`  Completed: ${milestone.completed || false}`);
      console.log('');
    });
    
    // Test a specific user's data
    console.log('👤 Testing with Ajay Tiwari (3 referrals):');
    console.log('------------------------------------------');
    const ajay = await User.findOne({ email: 'snapthinktrader@gmail.com' });
    if (ajay) {
      const milestone = UserController.getNextMilestone(ajay.directReferrals || 0);
      console.log(`✅ Current Referrals: ${ajay.directReferrals || 0}`);
      console.log(`🎯 Next Milestone: ${milestone.target} referrals → $${milestone.bonus}`);
      console.log(`📊 Progress: ${milestone.progress.toFixed(1)}%`);
      console.log(`⏳ Remaining: ${milestone.remaining}`);
      
      if (ajay.directReferrals >= 3) {
        console.log('🎉 Should be eligible for $50 bonus!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing milestone system:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testMilestoneSystem();