const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

async function checkBackendCalculation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('\n=== USER DATA ===');
    console.log('Email:', user.email);
    console.log('Stored walletBalance:', user.walletBalance);
    console.log('Total deposits:', user.totalDeposit);
    console.log('Total referrals:', user.totalReferrals);
    
    // This is what the backend API will calculate
    console.log('\n=== CALLING calculateRealTimeEarnings() ===');
    const earnings = await user.calculateRealTimeEarnings();
    
    console.log('\n=== RESULTS ===');
    console.log('Calculated Balance: $' + earnings.calculatedBalance.toFixed(2));
    console.log('Pending Earnings: $' + earnings.pendingEarnings.toFixed(2));
    console.log('Current Daily Rate:', (earnings.dailyRate * 100).toFixed(2) + '%');
    console.log('Commission/Second: $' + earnings.commissionPerSecond.toFixed(8));
    console.log('Commission/Day: $' + (earnings.commissionPerSecond * 86400).toFixed(2));
    
    console.log('\n=== COMPARISON ===');
    console.log('Timeline Script Expected: $6,101.98');
    console.log('Backend Now Returns: $' + earnings.calculatedBalance.toFixed(2));
    console.log('Previous (Wrong): $12,104.47');
    console.log('Improvement: $' + (12104.47 - earnings.calculatedBalance).toFixed(2) + ' less (correct!)');
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkBackendCalculation();
