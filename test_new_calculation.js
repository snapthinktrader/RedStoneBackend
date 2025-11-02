const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');

async function testNewCalculation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const user = await User.findOne({ email: 'spookymoments62@gmail.com' });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('\n=== TESTING NEW CALCULATION ===');
    console.log('User:', user.email);
    console.log('Stored wallet balance:', user.walletBalance);
    console.log('Total deposits:', user.totalDeposit);
    console.log('Total referrals:', user.totalReferrals);
    
    console.log('\n=== CALCULATING REAL-TIME EARNINGS ===');
    const earnings = await user.calculateRealTimeEarnings();
    
    console.log('\nResults:');
    console.log('Calculated balance:', earnings.calculatedBalance.toFixed(2));
    console.log('Pending earnings:', earnings.pendingEarnings.toFixed(2));
    console.log('Daily rate:', (earnings.dailyRate * 100).toFixed(2) + '%');
    console.log('Commission per second:', earnings.commissionPerSecond.toFixed(8));
    console.log('Commission per day:', (earnings.commissionPerSecond * 86400).toFixed(2));
    console.log('Deposits found:', earnings.depositsFound);
    console.log('Elapsed seconds:', earnings.elapsedSeconds);
    
    console.log('\n=== COMPARISON ===');
    console.log('Expected (from calculation script): $6,101.98');
    console.log('Actual (new method): $' + earnings.calculatedBalance.toFixed(2));
    console.log('Difference: $' + Math.abs(6101.98 - earnings.calculatedBalance).toFixed(2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testNewCalculation();
